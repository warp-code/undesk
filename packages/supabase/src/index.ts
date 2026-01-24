// Types
export type {
  Database,
  Json,
  DealRow,
  DealInsert,
  DealUpdate,
  OfferRow,
  OfferInsert,
  OfferUpdate,
  RawEventRow,
  RawEventInsert,
  DealStatus,
  OfferStatus,
} from "./types";

// Client
export {
  createAnonClient,
  createServiceClient,
  type TypedSupabaseClient,
  type SupabaseConfig,
} from "./client";
