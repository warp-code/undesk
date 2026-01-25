"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSupabase } from "../_providers/SupabaseProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { useMxePublicKey } from "../_providers/OtcProvider";
import type { Offer } from "../_lib/types";
import {
  createDecryptionCipher,
  decryptOfferData,
  bytesToHex,
} from "../_lib/decryption";
import { formatTimeRemaining } from "../_lib/format";

interface UseMyOffersReturn {
  offers: Offer[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches offers with deal join, filters by user's encryption key, decrypts.
 * Requires derived keys and MXE public key to be available.
 */
export function useMyOffers(): UseMyOffersReturn {
  const supabase = useSupabase();
  const { derivedKeys, hasDerivedKeys } = useDerivedKeysContext();
  const mxePublicKey = useMxePublicKey();

  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userPubKeyHex = useMemo(() => {
    if (!hasDerivedKeys || !derivedKeys) return null;
    return "\\x" + bytesToHex(derivedKeys.encryption.publicKey);
  }, [derivedKeys, hasDerivedKeys]);

  const fetchOffers = useCallback(async () => {
    if (!userPubKeyHex || !mxePublicKey || !derivedKeys) {
      setOffers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch offers with deal data via join
      const { data, error: queryError } = await supabase
        .from("offers")
        .select(
          `
          address,
          deal_address,
          ciphertexts,
          nonce,
          submitted_at,
          status,
          deals!inner (
            base_mint,
            quote_mint,
            status
          )
        `
        )
        .eq("encryption_key", userPubKeyHex)
        .order("submitted_at", { ascending: false });

      if (queryError) throw queryError;

      const cipher = createDecryptionCipher(
        derivedKeys.encryption.privateKey,
        mxePublicKey
      );

      const decrypted: Offer[] = (data ?? []).map((row) => {
        const { price, amount } = decryptOfferData(
          row.ciphertexts,
          row.nonce,
          cipher
        );

        // Handle deals as object (Supabase join returns object for !inner)
        const deal = row.deals as {
          base_mint: string;
          quote_mint: string;
          status: string;
        };

        return {
          id: row.address,
          baseMint: deal.base_mint,
          quoteMint: deal.quote_mint,
          amount,
          yourPrice: price,
          submittedAt: formatTimeRemaining(
            new Date(row.submitted_at).getTime()
          ),
          dealStatus: deal.status as "open" | "executed" | "expired",
          offerStatus: mapOfferStatus(row.status),
        };
      });

      setOffers(decrypted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch offers");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, userPubKeyHex, mxePublicKey, derivedKeys]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  return { offers, isLoading, error, refetch: fetchOffers };
}

/**
 * Map database status to frontend status.
 */
function mapOfferStatus(
  status: string
): "pending" | "executed" | "partial" | "failed" {
  switch (status) {
    case "open":
      return "pending";
    case "settled":
      return "executed"; // May need more nuance based on settlement data
    default:
      return "pending";
  }
}
