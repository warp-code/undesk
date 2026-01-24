// Token registry - source: https://token.jup.ag/strict
// Last updated: 2026-01-23

export interface TokenInfo {
  symbol: string;
  decimals: number;
  name: string;
  logoURI?: string;
}

// Mint address → token metadata
export const TOKEN_REGISTRY: Record<string, TokenInfo> = {
  // Native SOL (wrapped)
  So11111111111111111111111111111111111111112: {
    symbol: "SOL",
    decimals: 9,
    name: "Wrapped SOL",
  },
  // USDC
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    symbol: "USDC",
    decimals: 6,
    name: "USD Coin",
  },
  // USDT
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
    symbol: "USDT",
    decimals: 6,
    name: "Tether USD",
  },
  // ETH (Wormhole)
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": {
    symbol: "ETH",
    decimals: 8,
    name: "Ether (Portal)",
  },
  // BONK
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: {
    symbol: "BONK",
    decimals: 5,
    name: "Bonk",
  },
  // JUP
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: {
    symbol: "JUP",
    decimals: 6,
    name: "Jupiter",
  },
  // WIF
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: {
    symbol: "WIF",
    decimals: 6,
    name: "dogwifhat",
  },
  // PYTH
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: {
    symbol: "PYTH",
    decimals: 6,
    name: "Pyth Network",
  },
  // RAY
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": {
    symbol: "RAY",
    decimals: 6,
    name: "Raydium",
  },
  // ORCA
  orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE: {
    symbol: "ORCA",
    decimals: 6,
    name: "Orca",
  },
  // RENDER
  rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof: {
    symbol: "RENDER",
    decimals: 8,
    name: "Render Token",
  },
  // HNT
  hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux: {
    symbol: "HNT",
    decimals: 8,
    name: "Helium",
  },
  // JITO
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: {
    symbol: "JITO",
    decimals: 9,
    name: "Jito Staked SOL",
  },
  // W (Wormhole)
  "85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ": {
    symbol: "W",
    decimals: 6,
    name: "Wormhole",
  },
  // POPCAT
  "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr": {
    symbol: "POPCAT",
    decimals: 9,
    name: "Popcat",
  },
  // TNSR
  TNSRxcUxoT9xBG3de7PiJyTDYu7kskLqcpddxnEJAS6: {
    symbol: "TNSR",
    decimals: 9,
    name: "Tensor",
  },
  // KMNO
  KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS: {
    symbol: "KMNO",
    decimals: 6,
    name: "Kamino",
  },
  // MEW
  MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5: {
    symbol: "MEW",
    decimals: 5,
    name: "cat in a dogs world",
  },
  // MOBILE
  mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6: {
    symbol: "MOBILE",
    decimals: 6,
    name: "Helium Mobile",
  },
  // DRIFT
  DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7: {
    symbol: "DRIFT",
    decimals: 6,
    name: "Drift",
  },

  // Placeholder tokens for mock data (clearly fake addresses)
  META111111111111111111111111111111111111111: {
    symbol: "META",
    decimals: 9,
    name: "Meta Token (Mock)",
  },
};

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

// Reverse lookup: symbol → mint (for form submission)
export function getMintFromSymbol(symbol: string): string | undefined {
  for (const [mint, info] of Object.entries(TOKEN_REGISTRY)) {
    if (info.symbol === symbol) return mint;
  }
  return undefined;
}
