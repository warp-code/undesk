"use client";

import { useState, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { awaitComputationFinalization } from "@arcium-hq/client";
import { useOtc } from "../_providers/OtcProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { getBalanceAddress } from "../_lib/accounts";
import { getTokenInfo } from "../_lib/tokens";
import { generateNonce, nonceToU128 } from "../_lib/encryption";

/** Amount to top up per click (in human-readable units) */
const TOP_UP_AMOUNT = 1000;

export interface UseTopUpReturn {
  /** Execute a top-up for the specified mint */
  topUp: (mint: string) => Promise<void>;
  /** Whether a top-up is in progress */
  isLoading: boolean;
  /** Error message if top-up failed */
  error: string | null;
  /** Which mint is currently being topped up (null if none) */
  loadingMint: string | null;
}

/**
 * Converts a human-readable amount to base units (smallest token unit)
 */
function toBaseUnits(amount: number, decimals: number): bigint {
  const [whole, frac = ""] = amount.toString().split(".");
  const fracPadded = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + fracPadded);
}

/**
 * Hook for topping up encrypted balances on-chain.
 *
 * Queues a top_up computation via Arcium to add tokens to user's balance.
 */
export function useTopUp(): UseTopUpReturn {
  const { program, provider, programId, mxePublicKey, arciumAccounts } =
    useOtc();
  const { derivedKeys } = useDerivedKeysContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMint, setLoadingMint] = useState<string | null>(null);

  const topUp = useCallback(
    async (mint: string): Promise<void> => {
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

      setIsLoading(true);
      setLoadingMint(mint);

      try {
        // 1. Convert amount to base units using token decimals
        const tokenInfo = getTokenInfo(mint);
        const amountBigInt = toBaseUnits(TOP_UP_AMOUNT, tokenInfo.decimals);

        // 2. Generate nonce for encryption
        const nonce = generateNonce();

        // 3. Generate random computation offset
        const offsetBytes = new Uint8Array(8);
        crypto.getRandomValues(offsetBytes);
        const computationOffset = new BN(offsetBytes, "le");

        // 4. Derive balance PDA
        const mintPubkey = new PublicKey(mint);
        const balanceAddress = getBalanceAddress(
          programId,
          derivedKeys.controller.publicKey,
          mintPubkey
        );

        // 5. Submit top_up transaction
        const queueSig = await program.methods
          .topUp(
            computationOffset,
            derivedKeys.controller.publicKey,
            Array.from(derivedKeys.encryption.publicKey),
            nonceToU128(nonce),
            new BN(amountBigInt.toString())
          )
          .accountsPartial({
            controllerSigner: derivedKeys.controller.publicKey,
            mint: mintPubkey,
            balance: balanceAddress,
            computationAccount:
              arciumAccounts.getComputationAccAddress(computationOffset),
            clusterAccount: arciumAccounts.getClusterAccAddress(),
            mxeAccount: arciumAccounts.getMXEAccAddress(),
            mempoolAccount: arciumAccounts.getMempoolAccAddress(),
            executingPool: arciumAccounts.getExecutingPoolAccAddress(),
            compDefAccount: arciumAccounts.getCompDefAccAddress("TOP_UP"),
          })
          .signers([derivedKeys.controller])
          .rpc({ skipPreflight: true, commitment: "confirmed" });

        console.log("Queue top_up sig:", queueSig);

        // 6. Await computation finalization
        const finalizeSig = await awaitComputationFinalization(
          provider,
          computationOffset,
          programId,
          "confirmed"
        );
        console.log("Top-up finalize sig:", finalizeSig);

        console.log(
          `Top-up successful: ${TOP_UP_AMOUNT} ${
            tokenInfo.symbol
          } to ${balanceAddress.toBase58()}`
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to top up balance";
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
        setLoadingMint(null);
      }
    },
    [program, provider, programId, mxePublicKey, arciumAccounts, derivedKeys]
  );

  return {
    topUp,
    isLoading,
    error,
    loadingMint,
  };
}
