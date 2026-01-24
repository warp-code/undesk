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
 * Convert byte array to hex string
 */
function bytesToHex(bytes: number[]): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * Flatten and convert 2D byte array to hex string
 */
function ciphertextsToHex(ciphertexts: number[][]): string {
  const flattened = ciphertexts.flat();
  return Buffer.from(flattened).toString("hex");
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

      const insert: DealInsert = {
        address: pubkeyToBase58(data.deal),
        base_mint: pubkeyToBase58(data.baseMint),
        quote_mint: pubkeyToBase58(data.quoteMint),
        expires_at: bnToIsoString(data.expiresAt),
        allow_partial: data.allowPartial,
        created_at: bnToIsoString(data.createdAt),
        created_signature: event.context.signature,
        encryption_key: bytesToHex(data.encryptionKey),
        nonce: bytesToHex(data.nonce),
        ciphertexts: ciphertextsToHex(data.ciphertexts),
        status: "open",
      };

      const { error } = await client
        .from("deals")
        .upsert(insert, { onConflict: "address" });
      if (error) {
        throw new Error(`Failed to upsert deal: ${error.message}`);
      }

      logger.info("Upserted deal", {
        address: insert.address,
        signature: event.context.signature,
      });
    },

    async upsertDealSettled(
      event: EventWithContext<DealSettledData>
    ): Promise<void> {
      const data = event.data;

      const update: DealUpdate = {
        status: statusToString(data.status),
        settled_at: bnToIsoString(data.settledAt),
        settled_signature: event.context.signature,
        settlement_encryption_key: bytesToHex(data.encryptionKey),
        settlement_nonce: bytesToHex(data.nonce),
        settlement_ciphertexts: ciphertextsToHex(data.ciphertexts),
      };

      const address = pubkeyToBase58(data.deal);
      const { error } = await client
        .from("deals")
        .update(update)
        .eq("address", address);
      if (error) {
        throw new Error(`Failed to update deal: ${error.message}`);
      }

      logger.info("Updated deal settlement", {
        address,
        status: update.status,
        signature: event.context.signature,
      });
    },

    async upsertOfferCreated(
      event: EventWithContext<OfferCreatedData>
    ): Promise<void> {
      const data = event.data;

      const insert: OfferInsert = {
        address: pubkeyToBase58(data.offer),
        deal_address: pubkeyToBase58(data.deal),
        offer_index: data.offerIndex,
        submitted_at: bnToIsoString(data.submittedAt),
        created_signature: event.context.signature,
        encryption_key: bytesToHex(data.encryptionKey),
        nonce: bytesToHex(data.nonce),
        ciphertexts: ciphertextsToHex(data.ciphertexts),
        status: "open",
      };

      const { error } = await client
        .from("offers")
        .upsert(insert, { onConflict: "address" });
      if (error) {
        throw new Error(`Failed to upsert offer: ${error.message}`);
      }

      logger.info("Upserted offer", {
        address: insert.address,
        dealAddress: insert.deal_address,
        signature: event.context.signature,
      });
    },

    async upsertOfferSettled(
      event: EventWithContext<OfferSettledData>
    ): Promise<void> {
      const data = event.data;

      const update: OfferUpdate = {
        status: "settled",
        settled_at: bnToIsoString(data.settledAt),
        settled_signature: event.context.signature,
        settlement_encryption_key: bytesToHex(data.encryptionKey),
        settlement_nonce: bytesToHex(data.nonce),
        settlement_ciphertexts: ciphertextsToHex(data.ciphertexts),
      };

      const address = pubkeyToBase58(data.offer);
      const { error } = await client
        .from("offers")
        .update(update)
        .eq("address", address);
      if (error) {
        throw new Error(`Failed to update offer: ${error.message}`);
      }

      logger.info("Updated offer settlement", {
        address,
        signature: event.context.signature,
      });
    },
  };
}
