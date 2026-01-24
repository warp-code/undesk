import {
  createServiceClient,
  type TypedSupabaseClient,
  type DealInsert,
  type OfferInsert,
  type RawEventInsert,
  type DealUpdate,
  type OfferUpdate,
} from "@otc/supabase";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import type {
  EventWithContext,
  DealCreatedData,
  OfferCreatedData,
  DealSettledData,
  OfferSettledData,
} from "../types";
import { logger } from "../log";

export interface Storage {
  insertRawEvent(event: EventWithContext): Promise<void>;
  upsertDealCreated(event: EventWithContext<DealCreatedData>): Promise<void>;
  upsertDealSettled(event: EventWithContext<DealSettledData>): Promise<void>;
  upsertOfferCreated(event: EventWithContext<OfferCreatedData>): Promise<void>;
  upsertOfferSettled(event: EventWithContext<OfferSettledData>): Promise<void>;
}

/**
 * Convert PublicKey to base58 string
 */
function pubkeyToBase58(pubkey: PublicKey): string {
  return pubkey.toBase58();
}

/**
 * Convert BN timestamp (seconds) to ISO string
 */
function bnToIsoString(bn: BN): string {
  const seconds = bn.toNumber();
  return new Date(seconds * 1000).toISOString();
}

/**
 * Convert byte array to PostgreSQL bytea hex format (\x prefix)
 */
function bytesToBytea(bytes: number[]): string {
  return "\\x" + Buffer.from(bytes).toString("hex");
}

/**
 * Flatten and convert 2D byte array to PostgreSQL bytea hex format
 */
function ciphertextsToBytea(ciphertexts: number[][]): string {
  const flattened = ciphertexts.flat();
  return "\\x" + Buffer.from(flattened).toString("hex");
}

/**
 * Map status u8 to database status string
 */
function statusToString(status: number): "executed" | "expired" {
  return status === 1 ? "executed" : "expired";
}

/**
 * Create Supabase storage adapter
 */
export function createSupabaseStorage(config?: {
  url?: string;
  serviceRoleKey?: string;
}): Storage {
  const client: TypedSupabaseClient = createServiceClient({
    url: config?.url,
    serviceRoleKey: config?.serviceRoleKey,
  });

  return {
    async insertRawEvent(event: EventWithContext): Promise<void> {
      const insert: RawEventInsert = {
        event_name: event.name,
        signature: event.context.signature,
        slot: event.context.slot,
        block_time: event.context.blockTime
          ? new Date(event.context.blockTime * 1000).toISOString()
          : null,
        raw_data: JSON.stringify(event.data, (_, v) => {
          // Handle PublicKey and BN serialization
          if (v instanceof PublicKey) return v.toBase58();
          if (BN.isBN(v)) return v.toString();
          return v;
        }),
      };

      const { error } = await client.from("raw_events").insert(insert);
      if (error) {
        // Ignore duplicate key errors (signature + event_name is unique)
        if (error.code === "23505") {
          logger.debug("Raw event already exists", {
            signature: event.context.signature,
            event: event.name,
          });
          return;
        }
        throw new Error(`Failed to insert raw_event: ${error.message}`);
      }

      logger.debug("Inserted raw_event", {
        signature: event.context.signature,
        event: event.name,
      });
    },

    async upsertDealCreated(
      event: EventWithContext<DealCreatedData>
    ): Promise<void> {
      const data = event.data;
      const address = pubkeyToBase58(data.deal);
      const slot = event.context.slot;

      const insert: DealInsert = {
        address,
        base_mint: pubkeyToBase58(data.base_mint),
        quote_mint: pubkeyToBase58(data.quote_mint),
        expires_at: bnToIsoString(data.expires_at),
        allow_partial: data.allow_partial,
        created_at: bnToIsoString(data.created_at),
        created_signature: event.context.signature,
        encryption_key: bytesToBytea(data.encryption_key),
        nonce: bytesToBytea(data.nonce),
        ciphertexts: ciphertextsToBytea(data.ciphertexts),
        status: "open",
        slot,
      };

      // Try insert first
      const { error: insertError } = await client.from("deals").insert(insert);

      if (insertError) {
        // If duplicate key, try conditional update (only if incoming slot > existing)
        if (insertError.code === "23505") {
          const { data: updated, error: updateError } = await client
            .from("deals")
            .update({ ...insert, indexed_at: new Date().toISOString() })
            .eq("address", address)
            .lt("slot", slot)
            .select("address");

          if (updateError) {
            throw new Error(`Failed to update deal: ${updateError.message}`);
          }

          if (!updated || updated.length === 0) {
            logger.debug("Skipped deal upsert (existing slot >= incoming)", {
              address,
              incomingSlot: slot,
            });
            return;
          }

          logger.info("Updated deal (newer slot)", {
            address,
            slot,
            signature: event.context.signature,
          });
          return;
        }
        throw new Error(`Failed to insert deal: ${insertError.message}`);
      }

      logger.info("Inserted deal", {
        address,
        slot,
        signature: event.context.signature,
      });
    },

    async upsertDealSettled(
      event: EventWithContext<DealSettledData>
    ): Promise<void> {
      const data = event.data;
      const address = pubkeyToBase58(data.deal);
      const slot = event.context.slot;

      const update: DealUpdate = {
        status: statusToString(data.status),
        settled_at: bnToIsoString(data.settled_at),
        settled_signature: event.context.signature,
        settlement_encryption_key: bytesToBytea(data.encryption_key),
        settlement_nonce: bytesToBytea(data.nonce),
        settlement_ciphertexts: ciphertextsToBytea(data.ciphertexts),
        slot,
      };

      const { data: updated, error } = await client
        .from("deals")
        .update(update)
        .eq("address", address)
        .lt("slot", slot)
        .select("address");

      if (error) {
        throw new Error(`Failed to update deal: ${error.message}`);
      }

      if (!updated || updated.length === 0) {
        logger.debug("Skipped deal settlement (existing slot >= incoming)", {
          address,
          incomingSlot: slot,
        });
        return;
      }

      logger.info("Updated deal settlement", {
        address,
        status: update.status,
        slot,
        signature: event.context.signature,
      });
    },

    async upsertOfferCreated(
      event: EventWithContext<OfferCreatedData>
    ): Promise<void> {
      const data = event.data;
      const address = pubkeyToBase58(data.offer);
      const slot = event.context.slot;

      const insert: OfferInsert = {
        address,
        deal_address: pubkeyToBase58(data.deal),
        offer_index: data.offer_index,
        submitted_at: bnToIsoString(data.submitted_at),
        created_signature: event.context.signature,
        encryption_key: bytesToBytea(data.encryption_key),
        nonce: bytesToBytea(data.nonce),
        ciphertexts: ciphertextsToBytea(data.ciphertexts),
        status: "open",
        slot,
      };

      // Try insert first
      const { error: insertError } = await client.from("offers").insert(insert);

      if (insertError) {
        // If duplicate key, try conditional update (only if incoming slot > existing)
        if (insertError.code === "23505") {
          const { data: updated, error: updateError } = await client
            .from("offers")
            .update({ ...insert, indexed_at: new Date().toISOString() })
            .eq("address", address)
            .lt("slot", slot)
            .select("address");

          if (updateError) {
            throw new Error(`Failed to update offer: ${updateError.message}`);
          }

          if (!updated || updated.length === 0) {
            logger.debug("Skipped offer upsert (existing slot >= incoming)", {
              address,
              incomingSlot: slot,
            });
            return;
          }

          logger.info("Updated offer (newer slot)", {
            address,
            slot,
            signature: event.context.signature,
          });
          return;
        }
        throw new Error(`Failed to insert offer: ${insertError.message}`);
      }

      logger.info("Inserted offer", {
        address,
        dealAddress: insert.deal_address,
        slot,
        signature: event.context.signature,
      });
    },

    async upsertOfferSettled(
      event: EventWithContext<OfferSettledData>
    ): Promise<void> {
      const data = event.data;
      const address = pubkeyToBase58(data.offer);
      const slot = event.context.slot;

      const update: OfferUpdate = {
        status: "settled",
        settled_at: bnToIsoString(data.settled_at),
        settled_signature: event.context.signature,
        settlement_encryption_key: bytesToBytea(data.encryption_key),
        settlement_nonce: bytesToBytea(data.nonce),
        settlement_ciphertexts: ciphertextsToBytea(data.ciphertexts),
        slot,
      };

      const { data: updated, error } = await client
        .from("offers")
        .update(update)
        .eq("address", address)
        .lt("slot", slot)
        .select("address");

      if (error) {
        throw new Error(`Failed to update offer: ${error.message}`);
      }

      if (!updated || updated.length === 0) {
        logger.debug("Skipped offer settlement (existing slot >= incoming)", {
          address,
          incomingSlot: slot,
        });
        return;
      }

      logger.info("Updated offer settlement", {
        address,
        slot,
        signature: event.context.signature,
      });
    },
  };
}
