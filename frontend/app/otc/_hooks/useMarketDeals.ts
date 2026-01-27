"use client";

import { useState, useEffect, useCallback } from "react";
import { useSupabase } from "../_providers/SupabaseProvider";
import type { MarketDeal } from "../_lib/types";

interface UseMarketDealsReturn {
  marketDeals: MarketDeal[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetches all open deals for the market view.
 * No decryption needed - only public fields are returned.
 */
export function useMarketDeals(): UseMarketDealsReturn {
  const supabase = useSupabase();
  const [marketDeals, setMarketDeals] = useState<MarketDeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch deals
      const { data: dealsData, error: dealsError } = await supabase
        .from("deals")
        .select(
          "address, base_mint, quote_mint, allow_partial, expires_at, created_at, status"
        )
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (dealsError) throw dealsError;

      // Fetch offer counts for all open deals
      const dealAddresses = (dealsData ?? []).map((d) => d.address);
      let offerCountMap: Record<string, number> = {};

      if (dealAddresses.length > 0) {
        const { data: offersData, error: offersError } = await supabase
          .from("offers")
          .select("deal_address")
          .in("deal_address", dealAddresses);

        if (offersError) {
          console.warn("Failed to fetch offer counts:", offersError);
        } else {
          // Count offers per deal
          for (const offer of offersData ?? []) {
            offerCountMap[offer.deal_address] =
              (offerCountMap[offer.deal_address] || 0) + 1;
          }
        }
      }

      const mapped: MarketDeal[] = (dealsData ?? []).map((row) => ({
        id: row.address,
        baseMint: row.base_mint,
        quoteMint: row.quote_mint,
        allowPartial: row.allow_partial,
        expiresAt: new Date(row.expires_at).getTime(),
        createdAt: new Date(row.created_at).getTime(),
        offerCount: offerCountMap[row.address] || 0,
      }));

      setMarketDeals(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch deals");
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchDeals();
  }, [fetchDeals]);

  // Realtime subscription for deal and offer changes
  useEffect(() => {
    const channel = supabase
      .channel("market-deals-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals" },
        () => {
          fetchDeals();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offers" },
        () => {
          fetchDeals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchDeals]);

  return { marketDeals, isLoading, error, refetch: fetchDeals };
}
