"use client";

import { useState, useCallback } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { awaitComputationFinalization } from "@arcium-hq/client";
import { useOtc } from "../_providers/OtcProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { getOfferAddress, getBalanceAddress } from "../_lib/accounts";
import { getTokenInfo } from "../_lib/tokens";
import {
  createCipher,
  encryptOfferInput,
  toX64Price,
  generateNonce,
  nonceToU128,
} from "../_lib/encryption";

export interface SubmitOfferInput {
  /** The deal to submit an offer to (base58) */
  dealAddress: string;
  /** Base mint for decimal lookup (from MarketDeal) */
  baseMint: string;
  /** Quote mint for deriving offeror's balance address */
  quoteMint: string;
  /** Human-readable amount of base token to buy */
  amount: number;
  /** Price per unit in quote token */
  price: number;
  /** Optional derived keys override (useful when keys were just derived in same call) */
  derivedKeysOverride?: import("../_lib/encryption").DerivedKeys;
}

export interface UseSubmitOfferReturn {
  /** Submit an encrypted offer on-chain. Returns the offer address. */
  submitOffer: (input: SubmitOfferInput) => Promise<string>;
  /** Whether an offer is currently being submitted */
  isSubmitting: boolean;
  /** Error message if submission failed */
  error: string | null;
}

/**
 * Converts a human-readable amount to base units (smallest token unit)
 */
function toBaseUnits(amount: number, decimals: number): bigint {
  // Use string manipulation to avoid floating point issues
  const [whole, frac = ""] = amount.toString().split(".");
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + fracPadded);
}

/**
 * Hook for submitting encrypted offers to existing OTC deals.
 *
 * Follows the pattern from submit-offer.test.ts:
 * 1. Generate ephemeral createKey keypair
 * 2. Encrypt price and amount with MXE shared secret (OfferInput order: price, amount)
 * 3. Queue submit_offer computation via Arcium
 * 4. Await finalization
 *
 * @example
 * ```tsx
 * const { submitOffer, isSubmitting, error } = useSubmitOffer();
 *
 * const handleSubmit = async () => {
 *   const offerAddress = await submitOffer({
 *     dealAddress: "4KnQY...",
 *     baseMint: "META111...",
 *     quoteMint: "USDC111...",
 *     amount: 50,
 *     price: 5.5,
 *   });
 *   console.log("Offer submitted:", offerAddress);
 * };
 * ```
 */
export function useSubmitOffer(): UseSubmitOfferReturn {
  const { program, provider, programId, mxePublicKey, arciumAccounts } =
    useOtc();
  const { derivedKeys } = useDerivedKeysContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitOffer = useCallback(
    async (input: SubmitOfferInput): Promise<string> => {
      setError(null);

      // Prerequisites checks
      if (!program || !provider) {
        throw new Error("Wallet not connected");
      }
      // Use override if provided (for when keys were just derived in same call)
      const keys = input.derivedKeysOverride ?? derivedKeys;
      if (!keys) {
        throw new Error("Please sign to derive encryption keys");
      }
      if (!mxePublicKey) {
        throw new Error("MXE public key not available");
      }

      setIsSubmitting(true);

      try {
        // 1. Create cipher from derived encryption key and MXE public key
        const cipher = createCipher(keys.encryption.privateKey, mxePublicKey);

        // 2. Generate nonce for encryption
        const nonce = generateNonce();

        // 3. Convert price to X64.64 fixed-point format
        const priceBigInt = toX64Price(input.price);

        // 4. Convert amount to base units (using token decimals)
        const tokenInfo = getTokenInfo(input.baseMint);
        const amountBigInt = toBaseUnits(input.amount, tokenInfo.decimals);

        // 5. Encrypt offer input (price, amount) - note: different order than DealInput
        const ciphertext = encryptOfferInput(
          cipher,
          priceBigInt,
          amountBigInt,
          nonce
        );

        // 6. Generate ephemeral create_key keypair
        const createKey = Keypair.generate();

        // 7. Derive offer PDA
        const dealPubkey = new PublicKey(input.dealAddress);
        const offerAddress = getOfferAddress(
          programId,
          dealPubkey,
          createKey.publicKey
        );

        // 8. Generate random computation offsets for both instructions
        const submitOfferOffsetBytes = new Uint8Array(8);
        crypto.getRandomValues(submitOfferOffsetBytes);
        const submitOfferOffset = new BN(submitOfferOffsetBytes, "le");

        const announceBalanceOffsetBytes = new Uint8Array(8);
        crypto.getRandomValues(announceBalanceOffsetBytes);
        const announceBalanceOffset = new BN(announceBalanceOffsetBytes, "le");

        // 9. Generate nonce for announceBalance
        const announceNonce = generateNonce();

        // 10. Derive offeror's balance address (quote mint)
        const quoteMintPubkey = new PublicKey(input.quoteMint);
        const offerorBalance = getBalanceAddress(
          programId,
          keys.controller.publicKey,
          quoteMintPubkey
        );

        console.log("Submitting submit_offer transaction...");
        console.log("  Deal address:", input.dealAddress);
        console.log("  Offer address:", offerAddress.toBase58());
        console.log("  Offeror balance:", offerorBalance.toBase58());

        // 11. Send submitOffer transaction FIRST
        const submitOfferSig = await program.methods
          .submitOffer(
            submitOfferOffset,
            keys.controller.publicKey, // controller
            Array.from(keys.encryption.publicKey), // encryption_pubkey
            nonceToU128(nonce), // nonce as u128
            Array.from(ciphertext[0]), // encrypted_price
            Array.from(ciphertext[1]) // encrypted_amount
          )
          .accountsPartial({
            createKey: createKey.publicKey,
            deal: dealPubkey,
            offer: offerAddress,
            computationAccount:
              arciumAccounts.getComputationAccAddress(submitOfferOffset),
            clusterAccount: arciumAccounts.getClusterAccAddress(),
            mxeAccount: arciumAccounts.getMXEAccAddress(),
            mempoolAccount: arciumAccounts.getMempoolAccAddress(),
            executingPool: arciumAccounts.getExecutingPoolAccAddress(),
            compDefAccount: arciumAccounts.getCompDefAccAddress("SUBMIT_OFFER"),
          })
          .signers([createKey])
          .rpc({ skipPreflight: true, commitment: "confirmed" });
        console.log("Submit offer queue sig:", submitOfferSig);

        // 12. Wait for submitOffer computation to finalize BEFORE queuing announceBalance
        // This ensures the balance account has the updated MXE state
        console.log("Awaiting submit_offer finalization...");
        const submitOfferFinalizeSig = await awaitComputationFinalization(
          provider,
          submitOfferOffset,
          programId,
          "confirmed"
        );
        console.log("Submit offer finalize sig:", submitOfferFinalizeSig);

        // 13. NOW send announceBalance (balance account has correct state)
        console.log("Submitting announceBalance transaction...");
        const announceBalanceSig = await program.methods
          .announceBalance(
            announceBalanceOffset,
            keys.controller.publicKey, // controller
            Array.from(keys.encryption.publicKey), // encryption_pubkey
            nonceToU128(announceNonce) // owner_nonce as u128
          )
          .accountsPartial({
            controllerSigner: keys.controller.publicKey,
            balance: offerorBalance,
            computationAccount:
              arciumAccounts.getComputationAccAddress(announceBalanceOffset),
            clusterAccount: arciumAccounts.getClusterAccAddress(),
            mxeAccount: arciumAccounts.getMXEAccAddress(),
            mempoolAccount: arciumAccounts.getMempoolAccAddress(),
            executingPool: arciumAccounts.getExecutingPoolAccAddress(),
            compDefAccount:
              arciumAccounts.getCompDefAccAddress("ANNOUNCE_BALANCE"),
          })
          .signers([keys.controller])
          .rpc({ skipPreflight: true, commitment: "confirmed" });
        console.log("Announce balance queue sig:", announceBalanceSig);

        // 14. Await announceBalance finalization
        console.log("Awaiting announceBalance finalization...");
        const announceBalanceFinalizeSig = await awaitComputationFinalization(
          provider,
          announceBalanceOffset,
          programId,
          "confirmed"
        );
        console.log("Announce balance finalize sig:", announceBalanceFinalizeSig);

        console.log("Offer submitted successfully:", offerAddress.toBase58());
        return offerAddress.toBase58();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to submit offer";
        setError(message);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [program, provider, programId, mxePublicKey, arciumAccounts, derivedKeys]
  );

  return {
    submitOffer,
    isSubmitting,
    error,
  };
}
