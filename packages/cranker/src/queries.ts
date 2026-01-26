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
  // First, get non-open deal addresses (no FK constraint exists, so we can't use embedded joins)
  const { data: settledDeals, error: dealsError } = await supabase
    .from("deals")
    .select("address")
    .neq("status", "open");

  if (dealsError) {
    logger.error("Failed to fetch settled deals", {
      error: dealsError.message,
    });
    throw dealsError;
  }

  if (!settledDeals?.length) {
    return [];
  }

  const settledAddresses = settledDeals.map((d) => d.address);

  // Then get open offers for those deals
  const { data, error } = await supabase
    .from("offers")
    .select("address, deal_address")
    .eq("status", "open")
    .in("deal_address", settledAddresses)
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
