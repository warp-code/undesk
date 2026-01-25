"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSupabase } from "../_providers/SupabaseProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { useMxePublicKey } from "../_providers/OtcProvider";
import type { Deal } from "../_lib/types";
import {
  createDecryptionCipher,
  decryptDealData,
  bytesToHex,
} from "../_lib/decryption";

interface UseMyDealsReturn {
  deals: Deal[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches deals where encryption_key matches user's public key, then decrypts.
 * Requires derived keys and MXE public key to be available.
 */
export function useMyDeals(): UseMyDealsReturn {
  const supabase = useSupabase();
  const { derivedKeys, hasDerivedKeys } = useDerivedKeysContext();
  const mxePublicKey = useMxePublicKey();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User's encryption public key as hex for database comparison
  const userPubKeyHex = useMemo(() => {
    if (!hasDerivedKeys || !derivedKeys) return null;
    return "\\x" + bytesToHex(derivedKeys.encryption.publicKey);
  }, [derivedKeys, hasDerivedKeys]);

  const fetchDeals = useCallback(async () => {
    if (!userPubKeyHex || !mxePublicKey || !derivedKeys) {
      setDeals([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all deals where encryption_key matches user's pubkey
      const { data, error: queryError } = await supabase
        .from("deals")
        .select("*")
        .eq("encryption_key", userPubKeyHex)
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      // Create cipher for decryption
      const cipher = createDecryptionCipher(
        derivedKeys.encryption.privateKey,
        mxePublicKey
      );

      // Decrypt each deal
      const decrypted: Deal[] = (data ?? []).map((row) => {
        const { amount, price } = decryptDealData(
          row.ciphertexts,
          row.nonce,
          cipher
        );

        return {
          id: row.address,
          baseMint: row.base_mint,
          quoteMint: row.quote_mint,
          amount,
          price,
          total: amount * price,
          status: row.status as "open" | "executed" | "expired",
          isPartial: false,
          allowPartial: row.allow_partial,
          expiresAt: new Date(row.expires_at).getTime(),
          createdAt: new Date(row.created_at).getTime(),
        };
      });

      setDeals(decrypted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch deals");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, userPubKeyHex, mxePublicKey, derivedKeys]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  return { deals, isLoading, error, refetch: fetchDeals };
}
