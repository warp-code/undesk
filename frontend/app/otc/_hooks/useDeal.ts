"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSupabase } from "../_providers/SupabaseProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { useMxePublicKey } from "../_providers/OtcProvider";
import type { DealWithDetails } from "../_lib/types";
import {
  createDecryptionCipher,
  decryptDealData,
  bytesToHex,
  isOwnedByUser,
} from "../_lib/decryption";
import { toHumanAmount } from "../_lib/format";

interface UseDealReturn {
  deal: DealWithDetails | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches a single deal by ID.
 * - Returns public data for all users
 * - Returns decrypted private data (amount, price, total) only for the owner
 * - Does NOT reject non-owners (unlike useOffer)
 */
export function useDeal(dealId: string | null): UseDealReturn {
  const supabase = useSupabase();
  const { derivedKeys, hasDerivedKeys } = useDerivedKeysContext();
  const mxePublicKey = useMxePublicKey();

  const [deal, setDeal] = useState<DealWithDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userPubKey = useMemo(() => {
    if (!hasDerivedKeys || !derivedKeys) return null;
    return derivedKeys.encryption.publicKey;
  }, [derivedKeys, hasDerivedKeys]);

  const fetchDeal = useCallback(async () => {
    // No deal selected
    if (!dealId) {
      setDeal(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch deal by address
      const { data: dealData, error: dealError } = await supabase
        .from("deals")
        .select(
          "address, base_mint, quote_mint, status, expires_at, created_at, allow_partial, encryption_key, ciphertexts, nonce"
        )
        .eq("address", dealId)
        .single();

      if (dealError) {
        if (dealError.code === "PGRST116") {
          // Not found
          setError("Deal not found");
          setDeal(null);
          return;
        }
        console.error("Supabase deal query error:", dealError);
        throw dealError;
      }

      if (!dealData) {
        setError("Deal not found");
        setDeal(null);
        return;
      }

      // Fetch offer count for this deal
      const { count: offerCount, error: countError } = await supabase
        .from("offers")
        .select("*", { count: "exact", head: true })
        .eq("deal_address", dealId);

      if (countError) {
        console.warn("Failed to fetch offer count:", countError);
      }

      // Check ownership
      const isOwner =
        userPubKey !== null && isOwnedByUser(dealData.encryption_key, userPubKey);

      // Build base deal object with public data
      const baseDeal: DealWithDetails = {
        id: dealData.address,
        baseMint: dealData.base_mint,
        quoteMint: dealData.quote_mint,
        expiresAt: new Date(dealData.expires_at).getTime(),
        createdAt: new Date(dealData.created_at).getTime(),
        allowPartial: dealData.allow_partial,
        offerCount: offerCount ?? 0,
        status: dealData.status as "open" | "executed" | "expired",
        isOwner,
      };

      // If owner and keys available, decrypt private data
      if (isOwner && derivedKeys && mxePublicKey) {
        try {
          const cipher = createDecryptionCipher(
            derivedKeys.encryption.privateKey,
            mxePublicKey
          );

          const { amount, price } = decryptDealData(
            dealData.ciphertexts,
            dealData.nonce,
            cipher
          );

          // Calculate total using human-readable amount
          const humanAmount = toHumanAmount(amount, dealData.base_mint);
          const total = humanAmount * price;

          setDeal({
            ...baseDeal,
            amount,
            price,
            total,
          });
        } catch (decryptError) {
          console.error("Failed to decrypt deal data:", dealId, decryptError);
          // Return without private data if decryption fails
          setDeal(baseDeal);
        }
      } else {
        // Not owner or no keys - return public data only
        setDeal(baseDeal);
      }
    } catch (err) {
      console.error("Failed to fetch deal:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch deal");
      setDeal(null);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, dealId, userPubKey, mxePublicKey, derivedKeys]);

  useEffect(() => {
    fetchDeal();
  }, [fetchDeal]);

  // Realtime subscription for this specific deal
  useEffect(() => {
    if (!dealId) return;

    const channel = supabase
      .channel(`deal-${dealId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deals",
          filter: `address=eq.${dealId}`,
        },
        () => {
          fetchDeal();
        }
      )
      .subscribe();

    // Also subscribe to offers for this deal (to update offer count)
    const offersChannel = supabase
      .channel(`deal-${dealId}-offers`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offers",
          filter: `deal_address=eq.${dealId}`,
        },
        () => {
          fetchDeal();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(offersChannel);
    };
  }, [supabase, dealId, fetchDeal]);

  return { deal, isLoading, error, refetch: fetchDeal };
}
