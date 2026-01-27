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
      // Fetch offers first (no FK, so we fetch separately)
      const { data: offersData, error: offersError } = await supabase
        .from("offers")
        .select("address, deal_address, ciphertexts, nonce, submitted_at, status")
        .eq("encryption_key", userPubKeyHex)
        .order("submitted_at", { ascending: false });

      if (offersError) {
        console.error("Supabase offers query error:", offersError);
        throw offersError;
      }

      if (!offersData || offersData.length === 0) {
        setOffers([]);
        return;
      }

      // Fetch deals for these offers
      const dealAddresses = [...new Set(offersData.map((o) => o.deal_address))];
      const { data: dealsData, error: dealsError } = await supabase
        .from("deals")
        .select("address, base_mint, quote_mint, status, expires_at")
        .in("address", dealAddresses);

      if (dealsError) {
        console.error("Supabase deals query error:", dealsError);
        throw dealsError;
      }

      // Map deals by address for quick lookup
      const dealsMap = new Map(
        (dealsData ?? []).map((d) => [d.address, d])
      );

      const cipher = createDecryptionCipher(
        derivedKeys.encryption.privateKey,
        mxePublicKey
      );

      const decrypted: Offer[] = [];

      for (const row of offersData) {
        try {
          const deal = dealsMap.get(row.deal_address);
          if (!deal) {
            console.warn("Offer missing deal:", row.address, row.deal_address);
            continue;
          }

          const { price, amount } = decryptOfferData(
            row.ciphertexts,
            row.nonce,
            cipher
          );

          decrypted.push({
            id: row.address,
            dealId: row.deal_address,
            baseMint: deal.base_mint,
            quoteMint: deal.quote_mint,
            amount,
            yourPrice: price,
            dealExpiresAt: new Date(deal.expires_at).getTime(),
            dealStatus: deal.status as "open" | "executed" | "expired",
            offerStatus: mapOfferStatus(row.status),
          });
        } catch (decryptErr) {
          console.error("Failed to decrypt offer:", row.address, decryptErr);
        }
      }

      setOffers(decrypted);
    } catch (err) {
      console.error("Failed to fetch offers:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch offers");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, userPubKeyHex, mxePublicKey, derivedKeys]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  // Realtime subscription for offer changes (only when user has derived keys)
  useEffect(() => {
    if (!userPubKeyHex) return;

    const channel = supabase
      .channel("my-offers-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offers" },
        () => {
          fetchOffers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchOffers, userPubKeyHex]);

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
