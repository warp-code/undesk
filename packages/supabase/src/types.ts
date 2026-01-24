// Re-export generated types
export type { Database, Json } from "./generated";
import type { Database } from "./generated";

// Convenience type aliases
export type DealRow = Database["public"]["Tables"]["deals"]["Row"];
export type DealInsert = Database["public"]["Tables"]["deals"]["Insert"];
export type DealUpdate = Database["public"]["Tables"]["deals"]["Update"];

export type OfferRow = Database["public"]["Tables"]["offers"]["Row"];
export type OfferInsert = Database["public"]["Tables"]["offers"]["Insert"];
export type OfferUpdate = Database["public"]["Tables"]["offers"]["Update"];

export type RawEventRow = Database["public"]["Tables"]["raw_events"]["Row"];
export type RawEventInsert =
  Database["public"]["Tables"]["raw_events"]["Insert"];

// Status types (matching database constraints)
export type DealStatus = "open" | "executed" | "expired";
export type OfferStatus = "open" | "settled";
