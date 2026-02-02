import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/**
 * Transaction context from logs
 */
export type TxContext = {
  signature: string;
  slot: number;
  blockTime: number | null;
};

/**
 * Parsed event with transaction context
 */
export type EventWithContext<T = unknown> = {
  name: string;
  data: T;
  context: TxContext;
};

/**
 * DealCreated event data (snake_case from Anchor BorshCoder with new IDL format)
 * PublicKey and BN are proper class instances with methods.
 */
export type DealCreatedData = {
  deal: PublicKey;
  base_mint: PublicKey;
  quote_mint: PublicKey;
  expires_at: BN;
  allow_partial: boolean;
  created_at: BN;
  encryption_key: number[]; // [u8; 32]
  nonce: number[]; // [u8; 16]
  ciphertexts: number[][]; // [[u8; 32]; 2]
};

/**
 * OfferCreated event data (snake_case from Anchor BorshCoder)
 */
export type OfferCreatedData = {
  deal: PublicKey;
  offer: PublicKey;
  offer_index: number;
  submitted_at: BN;
  encryption_key: number[]; // [u8; 32]
  nonce: number[]; // [u8; 16]
  ciphertexts: number[][]; // [[u8; 32]; 2]
};

/**
 * DealSettled event data (snake_case from Anchor BorshCoder)
 */
export type DealSettledData = {
  deal: PublicKey;
  status: number; // u8: 1 = executed, 2 = expired
  settled_at: BN;
  encryption_key: number[]; // [u8; 32]
  nonce: number[]; // [u8; 16]
  ciphertexts: number[][]; // [[u8; 32]; 3]
};

/**
 * OfferSettled event data (snake_case from Anchor BorshCoder)
 */
export type OfferSettledData = {
  deal: PublicKey;
  offer: PublicKey;
  offer_index: number;
  settled_at: BN;
  encryption_key: number[]; // [u8; 32]
  nonce: number[]; // [u8; 16]
  ciphertexts: number[][]; // [[u8; 32]; 3]
};

/**
 * BalanceUpdated event data (snake_case from Anchor BorshCoder)
 */
export type BalanceUpdatedData = {
  balance: PublicKey;
  controller: PublicKey;
  mint: PublicKey;
  encryption_key: number[]; // [u8; 32]
  nonce: number[]; // [u8; 16]
  ciphertexts: number[][]; // [[u8; 32]; 2]
};

/**
 * Union of all event data types
 */
export type EventData =
  | DealCreatedData
  | OfferCreatedData
  | DealSettledData
  | OfferSettledData
  | BalanceUpdatedData;

/**
 * Event names from the OTC program
 */
export type EventName =
  | "DealCreated"
  | "OfferCreated"
  | "DealSettled"
  | "OfferSettled"
  | "BalanceUpdated";

/**
 * Ingestion adapter interface
 */
export interface IngestionAdapter {
  start(callback: (events: EventWithContext[]) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}
