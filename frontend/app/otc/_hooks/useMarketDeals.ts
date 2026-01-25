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
      const { data, error: queryError } = await supabase
        .from("deals")
        .select(
          "address, base_mint, quote_mint, allow_partial, expires_at, created_at, status"
        )
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (queryError) throw queryError;

      const mapped: MarketDeal[] = (data ?? []).map((row) => ({
        id: row.address,
        baseMint: row.base_mint,
        quoteMint: row.quote_mint,
        allowPartial: row.allow_partial,
        expiresAt: new Date(row.expires_at).getTime(),
        createdAt: new Date(row.created_at).getTime(),
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

  // TODO: Add Supabase Realtime subscription for INSERT/UPDATE

  return { marketDeals, isLoading, error, refetch: fetchDeals };
}
