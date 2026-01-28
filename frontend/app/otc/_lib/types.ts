// Your Deals - deals created by user
// Deal creator always offers BASE in exchange for QUOTE
export interface Deal {
  id: string;
  baseMint: string;
  quoteMint: string;
  amount: number;
  price: number;
  total: number;
  status: "open" | "executed" | "expired";
  isPartial: boolean;
  allowPartial: boolean;
  expiresAt: number;
  createdAt: number;
  offerCount?: number;
}

// Open Market - other users' deals (no price shown)
// Deal creator always offers BASE in exchange for QUOTE
export interface MarketDeal {
  id: string;
  baseMint: string;
  quoteMint: string;
  expiresAt: number;
  createdAt: number;
  allowPartial: boolean;
  // Mock data for deal details view
  size?: number;
  offerCount?: number;
}

// Your Offers - offers submitted by user
// When making an offer, you send QUOTE and receive BASE
export interface Offer {
  id: string;
  dealId: string;
  baseMint: string;
  quoteMint: string;
  amount: number;
  yourPrice: number;
  dealExpiresAt: number;
  dealStatus: "open" | "executed" | "expired";
  offerStatus: "pending" | "executed" | "partial" | "failed";
}

// Extended offer type for details view with settlement data
export interface OfferWithSettlement extends Offer {
  submittedAt: number;
  // Settlement data (only when settled)
  executedAmt?: number; // Human-readable amount (in base token)
  refundAmt?: number; // Human-readable amount (in quote token)
}

// Deal details with optional private data (only populated for owner)
export interface DealWithDetails extends MarketDeal {
  status: "open" | "executed" | "expired";
  isOwner: boolean;
  // Only populated when isOwner is true and decryption succeeds
  amount?: number; // Decrypted, in raw units
  price?: number; // Decrypted, human-readable
  total?: number; // Calculated: toHumanAmount(amount) * price
}
