"use client";

import { useState, useCallback } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { awaitComputationFinalization } from "@arcium-hq/client";
import { useOtc } from "../_providers/OtcProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { getDealAddress } from "../_lib/accounts";
import { getTokenInfo } from "../_lib/tokens";
import {
  createCipher,
  encryptDealInput,
  toX64Price,
  generateNonce,
  nonceToU128,
} from "../_lib/encryption";

export interface CreateDealInput {
  /** Token mint address being sold (base) */
  baseMint: string;
  /** Token mint address to receive (quote) */
  quoteMint: string;
  /** Human-readable amount to sell */
  amount: number;
  /** Price per unit in quote token */
  price: number;
  /** Expiration time in seconds from now */
  expiresInSeconds: number;
  /** Whether to allow partial fills */
  allowPartial: boolean;
}

export interface UseCreateDealReturn {
  /** Submit an encrypted deal on-chain. Returns the deal address. */
  createDeal: (input: CreateDealInput) => Promise<string>;
  /** Whether a deal is currently being created */
  isCreating: boolean;
  /** Error message if creation failed */
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
 * Hook for creating encrypted OTC deals on-chain.
 *
 * Follows the pattern from create-deal.test.ts:
 * 1. Generate ephemeral createKey keypair
 * 2. Encrypt amount and price with MXE shared secret
 * 3. Queue create_deal computation via Arcium
 * 4. Await finalization
 */
export function useCreateDeal(): UseCreateDealReturn {
  const { program, provider, programId, mxePublicKey, arciumAccounts } =
    useOtc();
  const { derivedKeys } = useDerivedKeysContext();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createDeal = useCallback(
    async (input: CreateDealInput): Promise<string> => {
      setError(null);

      // Prerequisites checks
      if (!program || !provider) {
        throw new Error("Wallet not connected");
      }
      if (!derivedKeys) {
        throw new Error("Please sign to derive encryption keys");
      }
      if (!mxePublicKey) {
        throw new Error("MXE public key not available");
      }

      setIsCreating(true);

      try {
        // 1. Create cipher from derived encryption key and MXE public key
        const cipher = createCipher(
          derivedKeys.encryption.privateKey,
          mxePublicKey
        );

        // 2. Generate nonce for encryption
        const nonce = generateNonce();

        // 3. Convert amount to base units (using token decimals)
        const tokenInfo = getTokenInfo(input.baseMint);
        const amountBigInt = toBaseUnits(input.amount, tokenInfo.decimals);

        // 4. Convert price to X64.64 fixed-point format
        const priceBigInt = toX64Price(input.price);

        // 5. Encrypt deal input (amount, price)
        const ciphertext = encryptDealInput(
          cipher,
          amountBigInt,
          priceBigInt,
          nonce
        );

        // 6. Generate ephemeral create_key keypair
        const createKey = Keypair.generate();

        // 7. Derive deal PDA
        const dealAddress = getDealAddress(programId, createKey.publicKey);

        // 8. Generate random computation offset
        const offsetBytes = new Uint8Array(8);
        crypto.getRandomValues(offsetBytes);
        const computationOffset = new BN(offsetBytes, "le");

        // 9. Calculate expiration timestamp (unix seconds)
        const expiresAt = new BN(
          Math.floor(Date.now() / 1000) + input.expiresInSeconds
        );

        // 10. Submit create_deal transaction
        const queueSig = await program.methods
          .createDeal(
            computationOffset,
            derivedKeys.controller.publicKey,
            Array.from(derivedKeys.encryption.publicKey),
            nonceToU128(nonce),
            expiresAt,
            input.allowPartial,
            Array.from(ciphertext[0]),
            Array.from(ciphertext[1])
          )
          .accountsPartial({
            createKey: createKey.publicKey,
            deal: dealAddress,
            baseMint: new PublicKey(input.baseMint),
            quoteMint: new PublicKey(input.quoteMint),
            computationAccount:
              arciumAccounts.getComputationAccAddress(computationOffset),
            clusterAccount: arciumAccounts.getClusterAccAddress(),
            mxeAccount: arciumAccounts.getMXEAccAddress(),
            mempoolAccount: arciumAccounts.getMempoolAccAddress(),
            executingPool: arciumAccounts.getExecutingPoolAccAddress(),
            compDefAccount: arciumAccounts.getCompDefAccAddress("CREATE_DEAL"),
          })
          .signers([createKey])
          .rpc({ skipPreflight: true, commitment: "confirmed" });

        console.log("Queue create_deal sig:", queueSig);

        // 11. Await computation finalization
        const finalizeSig = await awaitComputationFinalization(
          provider,
          computationOffset,
          programId,
          "confirmed"
        );
        console.log("Finalize sig:", finalizeSig);

        console.log("Deal created successfully:", dealAddress.toBase58());
        return dealAddress.toBase58();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create deal";
        setError(message);
        throw err;
      } finally {
        setIsCreating(false);
      }
    },
    [program, provider, programId, mxePublicKey, arciumAccounts, derivedKeys]
  );

  return {
    createDeal,
    isCreating,
    error,
  };
}
