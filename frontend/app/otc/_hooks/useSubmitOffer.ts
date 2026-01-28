"use client";

import { useState, useCallback } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { awaitComputationFinalization } from "@arcium-hq/client";
import { useOtc } from "../_providers/OtcProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { getOfferAddress } from "../_lib/accounts";
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
        const cipher = createCipher(
          keys.encryption.privateKey,
          mxePublicKey
        );

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

        // 8. Generate random computation offset
        const offsetBytes = new Uint8Array(8);
        crypto.getRandomValues(offsetBytes);
        const computationOffset = new BN(offsetBytes, "le");

        // 9. Submit submit_offer transaction
        console.log("Submitting submit_offer transaction...");
        console.log("  Deal address:", input.dealAddress);
        console.log("  Offer address:", offerAddress.toBase58());

        const queueSig = await program.methods
          .submitOffer(
            computationOffset,
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
              arciumAccounts.getComputationAccAddress(computationOffset),
            clusterAccount: arciumAccounts.getClusterAccAddress(),
            mxeAccount: arciumAccounts.getMXEAccAddress(),
            mempoolAccount: arciumAccounts.getMempoolAccAddress(),
            executingPool: arciumAccounts.getExecutingPoolAccAddress(),
            compDefAccount: arciumAccounts.getCompDefAccAddress("SUBMIT_OFFER"),
          })
          .signers([createKey])
          .rpc({ skipPreflight: true, commitment: "confirmed" });

        console.log("Queue submit_offer sig:", queueSig);

        // 10. Await computation finalization
        console.log("Awaiting computation finalization...");
        const finalizeSig = await awaitComputationFinalization(
          provider,
          computationOffset,
          programId,
          "confirmed"
        );
        console.log("Finalize sig:", finalizeSig);

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
