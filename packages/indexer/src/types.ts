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
 * DealCreated event data (camelCase from Anchor)
 */
export type DealCreatedData = {
  deal: PublicKey;
  baseMint: PublicKey;
  quoteMint: PublicKey;
  expiresAt: BN;
  allowPartial: boolean;
  createdAt: BN;
  encryptionKey: number[]; // [u8; 32]
  nonce: number[]; // [u8; 16]
  ciphertexts: number[][]; // [[u8; 32]; 2]
};

/**
 * OfferCreated event data (camelCase from Anchor)
 */
export type OfferCreatedData = {
  deal: PublicKey;
  offer: PublicKey;
  offerIndex: number;
  submittedAt: BN;
  encryptionKey: number[]; // [u8; 32]
  nonce: number[]; // [u8; 16]
  ciphertexts: number[][]; // [[u8; 32]; 2]
};

/**
 * DealSettled event data (camelCase from Anchor)
 */
export type DealSettledData = {
  deal: PublicKey;
  status: number; // u8: 1 = executed, 2 = expired
  settledAt: BN;
  encryptionKey: number[]; // [u8; 32]
  nonce: number[]; // [u8; 16]
  ciphertexts: number[][]; // [[u8; 32]; 3]
};

/**
 * OfferSettled event data (camelCase from Anchor)
 */
export type OfferSettledData = {
  deal: PublicKey;
  offer: PublicKey;
  offerIndex: number;
  settledAt: BN;
  encryptionKey: number[]; // [u8; 32]
  nonce: number[]; // [u8; 16]
  ciphertexts: number[][]; // [[u8; 32]; 3]
};

/**
 * Union of all event data types
 */
export type EventData =
  | DealCreatedData
  | OfferCreatedData
  | DealSettledData
  | OfferSettledData;

/**
 * Event names from the OTC program
 */
export type EventName =
  | "DealCreated"
  | "OfferCreated"
  | "DealSettled"
  | "OfferSettled";

/**
 * Ingestion adapter interface
 */
export interface IngestionAdapter {
  start(callback: (events: EventWithContext[]) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
}
