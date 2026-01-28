"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSupabase } from "../_providers/SupabaseProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { useMxePublicKey } from "../_providers/OtcProvider";
import type { OfferWithSettlement } from "../_lib/types";
import {
  createDecryptionCipher,
  decryptOfferData,
  decryptOfferSettlementData,
  bytesToHex,
  hexToBytes,
} from "../_lib/decryption";
import { toHumanAmount } from "../_lib/format";

interface UseOfferReturn {
  offer: OfferWithSettlement | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches a single offer by ID, verifies ownership, and decrypts.
 * Returns null if offerId is null or offer not found/not owned.
 */
export function useOffer(offerId: string | null): UseOfferReturn {
  const supabase = useSupabase();
  const { derivedKeys, hasDerivedKeys } = useDerivedKeysContext();
  const mxePublicKey = useMxePublicKey();

  const [offer, setOffer] = useState<OfferWithSettlement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userPubKeyHex = useMemo(() => {
    if (!hasDerivedKeys || !derivedKeys) return null;
    return "\\x" + bytesToHex(derivedKeys.encryption.publicKey);
  }, [derivedKeys, hasDerivedKeys]);

  const fetchOffer = useCallback(async () => {
    // Return null if no offer selected or keys not ready
    if (!offerId || !userPubKeyHex || !mxePublicKey || !derivedKeys) {
      setOffer(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch offer by address
      const { data: offerData, error: offerError } = await supabase
        .from("offers")
        .select(
          "address, deal_address, ciphertexts, nonce, submitted_at, status, settlement_ciphertexts, settlement_nonce, encryption_key"
        )
        .eq("address", offerId)
        .single();

      if (offerError) {
        if (offerError.code === "PGRST116") {
          // Not found
          setError("Offer not found");
          setOffer(null);
          return;
        }
        console.error("Supabase offer query error:", offerError);
        throw offerError;
      }

      if (!offerData) {
        setError("Offer not found");
        setOffer(null);
        return;
      }

      // Verify ownership - check if encryption_key matches user's pubkey
      const offerEncryptionKey = hexToBytes(offerData.encryption_key);
      const userPubKey = derivedKeys.encryption.publicKey;
      const isOwner =
        offerEncryptionKey.length === userPubKey.length &&
        offerEncryptionKey.every((byte, i) => byte === userPubKey[i]);

      if (!isOwner) {
        setError("You do not own this offer");
        setOffer(null);
        return;
      }

      // Fetch the associated deal
      const { data: dealData, error: dealError } = await supabase
        .from("deals")
        .select("address, base_mint, quote_mint, status, expires_at")
        .eq("address", offerData.deal_address)
        .single();

      if (dealError || !dealData) {
        console.error("Failed to fetch deal for offer:", dealError);
        setError("Associated deal not found");
        setOffer(null);
        return;
      }

      // Decrypt offer data
      const cipher = createDecryptionCipher(
        derivedKeys.encryption.privateKey,
        mxePublicKey
      );

      const { price, amount } = decryptOfferData(
        offerData.ciphertexts,
        offerData.nonce,
        cipher
      );

      // Decrypt settlement if available
      let executedAmt: number | undefined;
      let refundAmt: number | undefined;
      let settlementOutcome: number | null = null;

      if (
        offerData.status === "settled" &&
        offerData.settlement_ciphertexts &&
        offerData.settlement_nonce
      ) {
        try {
          const settlement = decryptOfferSettlementData(
            offerData.settlement_ciphertexts,
            offerData.settlement_nonce,
            cipher
          );
          settlementOutcome = settlement.outcome;
          // Convert bigint amounts to human-readable
          executedAmt = toHumanAmount(
            Number(settlement.executedAmt),
            dealData.base_mint
          );
          refundAmt = toHumanAmount(
            Number(settlement.refundAmt),
            dealData.quote_mint
          );
        } catch (e) {
          console.error("Failed to decrypt settlement:", offerData.address, e);
        }
      }

      // Map database status to frontend status
      const offerStatus = mapOfferStatus(offerData.status, settlementOutcome);

      setOffer({
        id: offerData.address,
        dealId: offerData.deal_address,
        baseMint: dealData.base_mint,
        quoteMint: dealData.quote_mint,
        amount,
        yourPrice: price,
        dealExpiresAt: new Date(dealData.expires_at).getTime(),
        dealStatus: dealData.status as "open" | "executed" | "expired",
        offerStatus,
        submittedAt: new Date(offerData.submitted_at).getTime(),
        executedAmt,
        refundAmt,
      });
    } catch (err) {
      console.error("Failed to fetch offer:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch offer");
      setOffer(null);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, offerId, userPubKeyHex, mxePublicKey, derivedKeys]);

  useEffect(() => {
    fetchOffer();
  }, [fetchOffer]);

  // Realtime subscription for this specific offer
  useEffect(() => {
    if (!offerId || !userPubKeyHex) return;

    const channel = supabase
      .channel(`offer-${offerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "offers",
          filter: `address=eq.${offerId}`,
        },
        () => {
          fetchOffer();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, offerId, fetchOffer, userPubKeyHex]);

  return { offer, isLoading, error, refetch: fetchOffer };
}

/**
 * Map database status to frontend status.
 */
function mapOfferStatus(
  status: string,
  settlementOutcome: number | null
): "pending" | "executed" | "partial" | "failed" {
  if (status === "open") return "pending";
  if (status === "settled" && settlementOutcome !== null) {
    switch (settlementOutcome) {
      case 0:
        return "executed";
      case 1:
        return "partial";
      case 2:
        return "failed";
    }
  }
  // Fallback for settled without decrypted outcome
  if (status === "settled") return "executed";
  return "pending";
}
