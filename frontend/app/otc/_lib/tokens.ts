// Token registry with deterministic localnet mint support

import { LOCALNET_MINTS } from "./deterministic-mints";

// Check if we're on localnet (localhost RPC)
const isLocalnet =
  typeof window !== "undefined" &&
  (process.env.NEXT_PUBLIC_RPC_URL?.includes("localhost") ||
    process.env.NEXT_PUBLIC_RPC_URL?.includes("127.0.0.1"));

// Mainnet mint addresses
const MAINNET_MINTS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  ETH: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
  META: "META111111111111111111111111111111111111111", // Placeholder
} as const;

// Use localnet mints when on localhost, otherwise mainnet
export const MINTS = isLocalnet ? LOCALNET_MINTS : MAINNET_MINTS;

// Supported token mints for UI dropdowns
export const SUPPORTED_MINTS = [MINTS.SOL, MINTS.USDC, MINTS.ETH, MINTS.META];

export type SupportedMint = string;

export interface TokenInfo {
  symbol: string;
  decimals: number;
  name: string;
  logoURI?: string;
}

// Token metadata by symbol
const TOKEN_METADATA: Record<string, TokenInfo> = {
  SOL: { symbol: "SOL", decimals: 9, name: "Wrapped SOL" },
  USDC: { symbol: "USDC", decimals: 6, name: "USD Coin" },
  ETH: { symbol: "ETH", decimals: 8, name: "Ether (Portal)" },
  META: { symbol: "META", decimals: 9, name: "Meta Token" },
};

// Build token registry dynamically
function buildTokenRegistry(): Record<string, TokenInfo> {
  const registry: Record<string, TokenInfo> = {};

  // Add current mints (localnet or mainnet)
  for (const [symbol, mint] of Object.entries(MINTS)) {
    const meta = TOKEN_METADATA[symbol];
    if (meta) {
      registry[mint] = meta;
    }
  }

  // Also add mainnet addresses for when viewing mainnet tokens
  for (const [symbol, mint] of Object.entries(MAINNET_MINTS)) {
    const meta = TOKEN_METADATA[symbol];
    if (meta && !registry[mint]) {
      registry[mint] = meta;
    }
  }

  return registry;
}

export const TOKEN_REGISTRY = buildTokenRegistry();

// Helper: get token info (with fallback for unknown)
export function getTokenInfo(mint: string): TokenInfo {
  const info = TOKEN_REGISTRY[mint];
  if (info) return info;

  // Unknown token fallback
  console.warn(`Unknown token mint: ${mint}`);
  return {
    symbol: `${mint.slice(0, 4)}...${mint.slice(-4)}`,
    decimals: 9,
    name: "Unknown Token",
  };
}

// Helper: get just the symbol
export function getTokenSymbol(mint: string): string {
  return getTokenInfo(mint).symbol;
}

// Format pair for display: "META/USDC"
export function formatPair(baseMint: string, quoteMint: string): string {
  return `${getTokenSymbol(baseMint)}/${getTokenSymbol(quoteMint)}`;
}

// Reverse lookup: symbol → mint
export function getMintFromSymbol(symbol: string): string | undefined {
  return MINTS[symbol as keyof typeof MINTS];
}

export function isSupportedMint(mint: string): boolean {
  return SUPPORTED_MINTS.includes(mint);
}
