import { PublicKey } from "@solana/web3.js";
import type { Deal, MarketDeal, Offer } from "./types";

// OTC Program Configuration
export const OTC_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_OTC_PROGRAM_ID ||
    "8wCCLUv68ofgoNg3AKbahgeqZitorLcgbRXQeHj7FpMd"
);

// Cluster offset: null = localnet env, number = devnet/testnet
export const CLUSTER_OFFSET: number | null = process.env
  .NEXT_PUBLIC_CLUSTER_OFFSET
  ? parseInt(process.env.NEXT_PUBLIC_CLUSTER_OFFSET, 10)
  : null;

// Arcium ciphertext structure (account layout: [8-byte disc][16-byte nonce][ciphertext...])
export const CIPHERTEXT_OFFSET = 24;
export const CIPHERTEXT_SIZE = 32;

// Computation definition names
export const COMP_DEF_NAMES = {
  CREATE_DEAL: "create_deal",
  SUBMIT_OFFER: "submit_offer",
  CRANK_DEAL: "crank_deal",
  CRANK_OFFER: "crank_offer",
} as const;

// Mint addresses for mock data
const MINTS = {
  META: "META111111111111111111111111111111111111111",
  ETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const;

// Mock data
export const MOCK_DEALS: Deal[] = [
  {
    id: "d1",
    baseMint: MINTS.META,
    quoteMint: MINTS.USDC,
    amount: 4444,
    price: 444,
    total: 1973136,
    status: "open",
    isPartial: false,
    allowPartial: true,
    expiresAt: Date.now() + 83640000,
    createdAt: Date.now(),
    offerCount: 0,
  },
  {
    id: "d2",
    baseMint: MINTS.ETH,
    quoteMint: MINTS.USDC,
    amount: 10,
    price: 3200,
    total: 32000,
    status: "open",
    isPartial: true,
    allowPartial: true,
    expiresAt: Date.now() + 20520000,
    createdAt: Date.now() - 3600000,
    offerCount: 3,
  },
  {
    id: "d3",
    baseMint: MINTS.META,
    quoteMint: MINTS.USDC,
    amount: 1000,
    price: 450,
    total: 450000,
    status: "executed",
    isPartial: true,
    allowPartial: false,
    expiresAt: 0,
    createdAt: Date.now() - 86400000,
    offerCount: 2,
  },
];

export const MOCK_MARKET_DEALS: MarketDeal[] = [
  {
    id: "mkt001",
    baseMint: MINTS.META,
    quoteMint: MINTS.USDC,
    expiresAt: Date.now() + 9240000,
    createdAt: Date.now() - 14760000,
    allowPartial: true,
    size: 5000,
    offerCount: 3,
  },
  {
    id: "mkt002",
    baseMint: MINTS.META,
    quoteMint: MINTS.USDC,
    expiresAt: Date.now() + 51720000,
    createdAt: Date.now() - 34680000,
    allowPartial: false,
    size: 2500,
    offerCount: 0,
  },
  {
    id: "mkt003",
    baseMint: MINTS.ETH,
    quoteMint: MINTS.USDC,
    expiresAt: Date.now() + 22140000,
    createdAt: Date.now() - 64260000,
    allowPartial: true,
    size: 15,
    offerCount: 2,
  },
  {
    id: "mkt004",
    baseMint: MINTS.ETH,
    quoteMint: MINTS.USDC,
    expiresAt: Date.now() + 3900000,
    createdAt: Date.now() - 82500000,
    allowPartial: true,
    size: 8,
    offerCount: 4,
  },
  {
    id: "mkt005",
    baseMint: MINTS.SOL,
    quoteMint: MINTS.USDC,
    expiresAt: Date.now() + 67200000,
    createdAt: Date.now() - 19200000,
    allowPartial: false,
    size: 100,
    offerCount: 0,
  },
];

export const MOCK_OFFERS: Offer[] = [
  {
    id: "off001",
    dealId: "mkt001",
    baseMint: MINTS.META,
    quoteMint: MINTS.USDC,
    amount: 10,
    yourPrice: 442,
    dealExpiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2h from now
    dealStatus: "open",
    offerStatus: "pending",
  },
  {
    id: "off002",
    dealId: "mkt003",
    baseMint: MINTS.ETH,
    quoteMint: MINTS.USDC,
    amount: 2,
    yourPrice: 3200,
    dealExpiresAt: 0, // executed, no expiry
    dealStatus: "executed",
    offerStatus: "executed",
  },
  {
    id: "off003",
    dealId: "mkt001",
    baseMint: MINTS.META,
    quoteMint: MINTS.USDC,
    amount: 25,
    yourPrice: 448,
    dealExpiresAt: Date.now() - 24 * 60 * 60 * 1000, // expired 1d ago
    dealStatus: "expired",
    offerStatus: "failed",
  },
  {
    id: "off004",
    dealId: "mkt002",
    baseMint: MINTS.SOL,
    quoteMint: MINTS.USDC,
    amount: 50,
    yourPrice: 185,
    dealExpiresAt: Date.now() + 3 * 60 * 60 * 1000, // 3h from now
    dealStatus: "open",
    offerStatus: "pending",
  },
  {
    id: "off005",
    dealId: "mkt003",
    baseMint: MINTS.ETH,
    quoteMint: MINTS.USDC,
    amount: 1,
    yourPrice: 3150,
    dealExpiresAt: 0, // executed, no expiry
    dealStatus: "executed",
    offerStatus: "partial",
  },
];

// FAQ data for negotiation panel
export const FAQ_ITEMS = [
  {
    q: "What is an OTC RFQ?",
    a: "OTC RFQ (Request for Quote) lets you request private quotes from market makers for large trades without exposing your order to public markets.",
  },
  {
    q: "How does private price discovery work?",
    a: "Your order details are encrypted. Market makers submit sealed bids that only you can see, preventing front-running and information leakage.",
  },
  {
    q: "How is confidentiality preserved?",
    a: "All trade parameters are encrypted using Arcium's MPC network. Neither party sees the other's limits until a match is confirmed.",
  },
  {
    q: "What happens after both sides agree?",
    a: "Once prices match, the trade executes atomically on-chain. Funds are swapped directly between wallets with no counterparty risk.",
  },
];
