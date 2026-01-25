import { TypedSupabaseClient } from "@otc/supabase";
import { CrankableDeal, CrankableOffer } from "./types";
import { logger } from "./log";

/**
 * Fetch expired deals that are still open (crankable)
 */
export async function getExpiredOpenDeals(
  supabase: TypedSupabaseClient,
  batchSize: number
): Promise<CrankableDeal[]> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("deals")
    .select("address")
    .eq("status", "open")
    .lt("expires_at", now)
    .limit(batchSize);

  if (error) {
    logger.error("Failed to fetch expired open deals", {
      error: error.message,
    });
    throw error;
  }

  return (data ?? []).map((row) => ({
    address: row.address,
  }));
}

/**
 * Fetch open offers whose deals are no longer open (crankable)
 */
export async function getOpenOffersForSettledDeals(
  supabase: TypedSupabaseClient,
  batchSize: number
): Promise<CrankableOffer[]> {
  const { data, error } = await supabase
    .from("offers")
    .select("address, deal_address, deals!inner(status)")
    .eq("status", "open")
    .neq("deals.status", "open")
    .limit(batchSize);

  if (error) {
    logger.error("Failed to fetch open offers for settled deals", {
      error: error.message,
    });
    throw error;
  }

  return (data ?? []).map((row) => ({
    address: row.address,
    dealAddress: row.deal_address,
  }));
}
