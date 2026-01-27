# Solana & Anchor Integration Plan

**Date:** 2026-01-22
**Status:** In Progress

---

## Goal

Integrate the frontend with the Solana blockchain, Arcium program, and Supabase backend to enable:
1. Wallet connection (Phantom, Solflare, etc.)
2. Deterministic key derivation (controller + encryption keypairs)
3. Deal creation with encrypted parameters
4. Offer submission to existing deals
5. Read deals/offers from Supabase (populated by indexer)
6. Real-time updates via Supabase Realtime
7. Client-side decryption of user's own encrypted data

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐       │
│  │  Create Deal    │     │  Submit Offer   │     │  Read Data      │       │
│  │  (Anchor tx)    │     │  (Anchor tx)    │     │  (Supabase)     │       │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘       │
│           │                       │                       │                 │
│           │                       │                       │                 │
│           ▼                       ▼                       ▼                 │
│  ┌─────────────────────────────────────┐     ┌─────────────────────────┐   │
│  │          Solana + Arcium            │     │       Supabase          │   │
│  │  (write encrypted data on-chain)    │     │  (REST + Realtime)      │   │
│  └─────────────────┬───────────────────┘     └────────────┬────────────┘   │
│                    │                                      │                 │
└────────────────────┼──────────────────────────────────────┼─────────────────┘
                     │                                      │
                     │         ┌──────────────┐             │
                     └────────►│   INDEXER    │─────────────┘
                               │ (captures    │
                               │  events,     │
                               │  writes to   │
                               │  Supabase)   │
                               └──────────────┘
```

**Key insight:** The frontend writes to Solana but reads from Supabase. The indexer bridges the two by capturing on-chain events and storing them in Supabase.

---

## Package Dependencies

### Required Packages (Add to `frontend/package.json`)

Based on root `package.json` versions for Anchor 0.32.1 and Arcium 0.5.4 compatibility:

```json
{
  "dependencies": {
    "@coral-xyz/anchor": "0.32.1",
    "@arcium-hq/client": "0.5.4",
    "@solana/web3.js": "^1.95.0",
    "@solana/spl-token": "0.4.14",
    "@solana/wallet-adapter-base": "^0.9.23",
    "@solana/wallet-adapter-react": "^0.15.35",
    "@solana/wallet-adapter-react-ui": "^0.9.35",
    "@solana/wallet-adapter-wallets": "^0.19.32",
    "@supabase/supabase-js": "^2.45.0",
    "@noble/hashes": "^1.4.0",
    "@noble/curves": "^1.4.0",
    "bs58": "^5.0.0"
  }
}
```

**Notes:**
- `@arcium-hq/client` provides `RescueCipher`, `x25519`, `deserializeLE`, and Arcium account helpers
- `@supabase/supabase-js` for reading from Supabase (REST + Realtime subscriptions)
- `@noble/hashes` for SHA-256 (deterministic key derivation)
- `@noble/curves` as fallback for x25519 if needed
- Wallet adapter versions compatible with web3.js 1.95+

---

## Architecture Overview

```
frontend/app/otc/
├── _providers/
│   ├── SolanaProvider.tsx       # Wallet adapter + connection context
│   ├── OtcProvider.tsx          # OTC program context (Anchor program instance)
│   ├── SupabaseProvider.tsx     # Supabase client context
│   └── DerivedKeysProvider.tsx  # Centralized key management
├── _hooks/
│   ├── useWallet.ts             # Re-export wallet adapter hooks
│   ├── useDerivedKeys.ts        # Controller + encryption keypair derivation
│   ├── useOtcProgram.ts         # Access to Anchor program
│   ├── useDeals.ts              # Fetch deals from Supabase + realtime
│   ├── useMyDeals.ts            # User's deals with decrypted data
│   ├── useMarketDeals.ts        # All open deals (public fields only)
│   ├── useOffers.ts             # Fetch offers from Supabase + realtime
│   ├── useMyOffers.ts           # User's offers with decrypted data
│   ├── useCreateDeal.ts         # Deal creation (Anchor mutation)
│   └── useSubmitOffer.ts        # Offer submission (Anchor mutation)
├── _lib/
│   ├── types.ts                 # Existing types + Supabase row types
│   ├── constants.ts             # Program ID, Supabase URL, etc.
│   ├── encryption.ts            # RescueCipher wrapper, key derivation
│   ├── accounts.ts              # PDA derivation helpers
│   ├── supabase.ts              # Supabase client factory
│   └── decryption.ts            # Decrypt user's deals/offers from Supabase data
└── _components/
    ├── WalletButton.tsx         # Connect/disconnect wallet UI
    └── ... (existing components)
```

---

## Phase 1: Wallet Connection Infrastructure

### Task 1.1: Create SolanaProvider

**File:** `_providers/SolanaProvider.tsx`

Wrap the app with Solana wallet adapter context.

```typescript
"use client";

import { FC, ReactNode, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

// Import wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css";

interface SolanaProviderProps {
  children: ReactNode;
}

export const SolanaProvider: FC<SolanaProviderProps> = ({ children }) => {
  // Use environment variable or default to devnet
  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl("devnet"),
    []
  );

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
```

### Task 1.2: Create WalletButton Component

**File:** `_components/WalletButton.tsx`

Custom styled wallet button matching dark theme.

```typescript
"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  const { connected, publicKey } = useWallet();

  // Use wallet adapter's built-in button with custom styling
  // Override styles in globals.css to match design system
  return <WalletMultiButton />;
}
```

### Task 1.3: Add Wallet Adapter CSS Overrides

**File:** `globals.css` (append)

```css
/* Wallet Adapter Overrides */
.wallet-adapter-button {
  background-color: var(--primary) !important;
  color: white !important;
  font-family: var(--font-sans) !important;
  border-radius: 8px !important;
}

.wallet-adapter-modal-wrapper {
  background-color: var(--card) !important;
}

.wallet-adapter-modal-title {
  color: var(--foreground) !important;
}
```

### Task 1.4: Integrate Provider into Layout

**File:** Modify `app/layout.tsx` or `app/otc/layout.tsx`

```typescript
import { SolanaProvider } from "./_providers/SolanaProvider";

export default function OtcLayout({ children }) {
  return <SolanaProvider>{children}</SolanaProvider>;
}
```

---

## Phase 2: Key Derivation System

### Task 2.1: Create Encryption Utilities

**File:** `_lib/encryption.ts`

Implement deterministic key derivation from wallet signatures.

```typescript
import { sha256 } from "@noble/hashes/sha256";
import { Keypair, PublicKey } from "@solana/web3.js";
import { x25519, RescueCipher } from "@arcium-hq/client";

const CONTROLLER_MESSAGE = "otc:controller:v1";
const ENCRYPTION_MESSAGE = "otc:encryption:v1";

export interface DerivedKeys {
  controller: Keypair;
  encryption: {
    privateKey: Uint8Array;
    publicKey: Uint8Array;
  };
}

/**
 * Derives a 32-byte seed from a wallet signature.
 */
async function deriveFromSignature(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  walletPubkey: PublicKey,
  purpose: string
): Promise<Uint8Array> {
  const message = `${purpose}\nWallet: ${walletPubkey.toBase58()}`;
  const messageBytes = new TextEncoder().encode(message);
  const signature = await signMessage(messageBytes);
  return sha256(signature);
}

/**
 * Derives both controller (ed25519) and encryption (x25519) keypairs.
 */
export async function deriveKeys(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  walletPubkey: PublicKey
): Promise<DerivedKeys> {
  const [controllerSeed, encryptionSeed] = await Promise.all([
    deriveFromSignature(signMessage, walletPubkey, CONTROLLER_MESSAGE),
    deriveFromSignature(signMessage, walletPubkey, ENCRYPTION_MESSAGE),
  ]);

  return {
    controller: Keypair.fromSeed(controllerSeed),
    encryption: {
      privateKey: encryptionSeed,
      publicKey: x25519.getPublicKey(encryptionSeed),
    },
  };
}

/**
 * Creates a RescueCipher for encryption/decryption with MXE.
 */
export function createCipher(
  privateKey: Uint8Array,
  mxePublicKey: Uint8Array
): RescueCipher {
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  return new RescueCipher(sharedSecret);
}

/**
 * Encrypts deal input (amount: u64, price: u128).
 */
export function encryptDealInput(
  cipher: RescueCipher,
  amount: bigint,
  price: bigint,
  nonce: Uint8Array
): Uint8Array[] {
  return cipher.encrypt([amount, price], nonce);
}

/**
 * Encrypts offer input (price: u128, amount: u64).
 * Note: Order is price first, then amount - matches OfferInput struct.
 */
export function encryptOfferInput(
  cipher: RescueCipher,
  price: bigint,
  amount: bigint,
  nonce: Uint8Array
): Uint8Array[] {
  return cipher.encrypt([price, amount], nonce);
}

/**
 * Converts a decimal price to X64.64 fixed-point format.
 * Example: 2.5 -> 2n * 2n**64n + (5n * 2n**64n / 10n)
 */
export function toX64Price(price: number): bigint {
  const wholePart = Math.floor(price);
  const fractionalPart = price - wholePart;
  const scale = BigInt(2) ** BigInt(64);
  return BigInt(wholePart) * scale + BigInt(Math.floor(fractionalPart * Number(scale)));
}

/**
 * Converts X64.64 fixed-point to decimal.
 */
export function fromX64Price(x64Price: bigint): number {
  const scale = BigInt(2) ** BigInt(64);
  const wholePart = Number(x64Price / scale);
  const fractionalPart = Number(x64Price % scale) / Number(scale);
  return wholePart + fractionalPart;
}
```

### Task 2.2: Create useDerivedKeys Hook

**File:** `_hooks/useDerivedKeys.ts`

Hook to manage derived keys with caching.

```typescript
"use client";

import { useCallback, useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { DerivedKeys, deriveKeys } from "../_lib/encryption";

interface UseDerivedKeysReturn {
  derivedKeys: DerivedKeys | null;
  isDerivingKeys: boolean;
  deriveKeysFromWallet: () => Promise<DerivedKeys | null>;
  clearKeys: () => void;
}

export function useDerivedKeys(): UseDerivedKeysReturn {
  const { publicKey, signMessage, connected } = useWallet();
  const [derivedKeys, setDerivedKeys] = useState<DerivedKeys | null>(null);
  const [isDerivingKeys, setIsDerivingKeys] = useState(false);

  // Clear keys when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setDerivedKeys(null);
    }
  }, [connected]);

  const deriveKeysFromWallet = useCallback(async () => {
    if (!publicKey || !signMessage) {
      return null;
    }

    setIsDerivingKeys(true);
    try {
      const keys = await deriveKeys(signMessage, publicKey);
      setDerivedKeys(keys);
      return keys;
    } catch (error) {
      console.error("Failed to derive keys:", error);
      return null;
    } finally {
      setIsDerivingKeys(false);
    }
  }, [publicKey, signMessage]);

  const clearKeys = useCallback(() => {
    setDerivedKeys(null);
  }, []);

  return {
    derivedKeys,
    isDerivingKeys,
    deriveKeysFromWallet,
    clearKeys,
  };
}
```

---

## Phase 3: OTC Program Integration

### Task 3.1: Add Program Constants

**File:** `_lib/constants.ts` (extend existing)

```typescript
import { PublicKey } from "@solana/web3.js";

// Program ID - update after deployment
export const OTC_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_OTC_PROGRAM_ID || "YOUR_PROGRAM_ID_HERE"
);

// Arcium cluster configuration
// null = use localnet default, number = specific cluster offset
export const ARCIUM_CLUSTER_OFFSET: number | null = null;

// Account offsets for encrypted fields
export const DEAL_CIPHERTEXT_OFFSET = 24; // 8 (discriminator) + 16 (nonce)
export const DEAL_CIPHERTEXT_LENGTH = 96; // 3 * 32 bytes

export const OFFER_CIPHERTEXT_OFFSET = 24;
export const OFFER_CIPHERTEXT_LENGTH = 96;

// Token mints (devnet/mainnet addresses)
export const TOKEN_MINTS = {
  META: new PublicKey("..."),
  ETH: new PublicKey("..."),
  SOL: new PublicKey("..."),
  USDC: new PublicKey("..."),
} as const;
```

### Task 3.2: Create Account Helpers

**File:** `_lib/accounts.ts`

PDA derivation utilities.

```typescript
import { PublicKey } from "@solana/web3.js";
import { OTC_PROGRAM_ID } from "./constants";

export function getDealAddress(createKey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("deal"), createKey.toBuffer()],
    OTC_PROGRAM_ID
  )[0];
}

export function getOfferAddress(deal: PublicKey, createKey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("offer"), deal.toBuffer(), createKey.toBuffer()],
    OTC_PROGRAM_ID
  )[0];
}
```

### Task 3.3: Create OtcProvider

**File:** `_providers/OtcProvider.tsx`

Provides Anchor program instance and MXE public key.

```typescript
"use client";

import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getClusterAccAddress,
  getArciumEnv,
  getCompDefAccOffset,
} from "@arcium-hq/client";
import { OTC_PROGRAM_ID, ARCIUM_CLUSTER_OFFSET } from "../_lib/constants";

// Import generated IDL (from `anchor build`)
import idl from "../../../target/idl/otc.json";
import { Otc } from "../../../target/types/otc";

interface OtcContextValue {
  program: Program<Otc> | null;
  provider: AnchorProvider | null;
  mxePublicKey: Uint8Array | null;
  isLoading: boolean;
  arciumAccounts: {
    mxeAccount: PublicKey;
    mempoolAccount: PublicKey;
    executingPool: PublicKey;
    clusterAccount: PublicKey;
  } | null;
  getCompDefAccount: (name: string) => PublicKey;
}

const OtcContext = createContext<OtcContextValue>({
  program: null,
  provider: null,
  mxePublicKey: null,
  isLoading: true,
  arciumAccounts: null,
  getCompDefAccount: () => PublicKey.default,
});

export const useOtcProgram = () => useContext(OtcContext);

interface OtcProviderProps {
  children: ReactNode;
}

export const OtcProvider: FC<OtcProviderProps> = ({ children }) => {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [mxePublicKey, setMxePublicKey] = useState<Uint8Array | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Create Anchor provider
  const provider = useMemo(() => {
    if (!wallet.publicKey) return null;
    return new AnchorProvider(connection, wallet as any, {
      commitment: "confirmed",
    });
  }, [connection, wallet]);

  // Create program instance
  const program = useMemo(() => {
    if (!provider) return null;
    return new Program<Otc>(idl as Otc, OTC_PROGRAM_ID, provider);
  }, [provider]);

  // Get Arcium account addresses
  const arciumAccounts = useMemo(() => {
    try {
      const arciumEnv = getArciumEnv();
      const clusterOffset = ARCIUM_CLUSTER_OFFSET ?? arciumEnv.arciumClusterOffset;

      return {
        mxeAccount: getMXEAccAddress(OTC_PROGRAM_ID),
        mempoolAccount: getMempoolAccAddress(clusterOffset),
        executingPool: getExecutingPoolAccAddress(clusterOffset),
        clusterAccount: getClusterAccAddress(clusterOffset),
      };
    } catch {
      return null;
    }
  }, []);

  // Helper to get computation definition account
  const getCompDefAccount = useMemo(
    () => (name: string) => {
      const offset = getCompDefAccOffset(name);
      return getCompDefAccAddress(
        OTC_PROGRAM_ID,
        Buffer.from(offset).readUInt32LE()
      );
    },
    []
  );

  // Fetch MXE public key
  useEffect(() => {
    async function fetchMxeKey() {
      if (!provider) return;

      setIsLoading(true);
      try {
        // Retry logic for MXE key (may not be ready immediately)
        for (let i = 0; i < 10; i++) {
          try {
            const key = await getMXEPublicKey(provider, OTC_PROGRAM_ID);
            if (key) {
              setMxePublicKey(key);
              break;
            }
          } catch {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchMxeKey();
  }, [provider]);

  return (
    <OtcContext.Provider
      value={{
        program,
        provider,
        mxePublicKey,
        isLoading,
        arciumAccounts,
        getCompDefAccount,
      }}
    >
      {children}
    </OtcContext.Provider>
  );
};
```

---

## Phase 3.5: Supabase Integration

The indexer populates Supabase with deal and offer data. The frontend reads from Supabase for all listings and uses Realtime for live updates.

### Task 3.5.1: Create Supabase Client

**File:** `_lib/supabase.ts`

```typescript
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "./database.types"; // Generated from Supabase

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let supabase: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabase) {
    supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
  }
  return supabase;
}
```

### Task 3.5.2: Generate Database Types

Run `supabase gen types typescript` to generate `_lib/database.types.ts` from your Supabase schema. This provides type safety for all queries.

The schema (from indexer architecture):

```typescript
// _lib/database.types.ts (generated, but here's the shape)
export interface Database {
  public: {
    Tables: {
      deals: {
        Row: {
          address: string;              // Deal pubkey (base58)
          base_mint: string;
          quote_mint: string;
          expires_at: string;           // ISO timestamp
          allow_partial: boolean;
          status: "open" | "executed" | "expired";
          created_at: string;
          settled_at: string | null;
          // Encrypted fields (for user's own deals)
          encryption_key: string;       // hex-encoded [u8; 32]
          nonce: string;                // hex-encoded [u8; 16]
          ciphertexts: string;          // hex-encoded [[u8; 32]; 2]
          // Settlement (null until settled)
          settlement_encryption_key: string | null;
          settlement_nonce: string | null;
          settlement_ciphertexts: string | null;
        };
      };
      offers: {
        Row: {
          address: string;
          deal_address: string;
          offer_index: number;
          status: "open" | "settled";
          submitted_at: string;
          encryption_key: string;
          nonce: string;
          ciphertexts: string;
          settlement_encryption_key: string | null;
          settlement_nonce: string | null;
          settlement_ciphertexts: string | null;
        };
      };
    };
  };
}
```

### Task 3.5.3: Create SupabaseProvider

**File:** `_providers/SupabaseProvider.tsx`

```typescript
"use client";

import { createContext, FC, ReactNode, useContext, useMemo } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../_lib/supabase";
import { Database } from "../_lib/database.types";

const SupabaseContext = createContext<SupabaseClient<Database> | null>(null);

export const useSupabase = () => {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error("useSupabase must be used within SupabaseProvider");
  }
  return context;
};

export const SupabaseProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const supabase = useMemo(() => getSupabaseClient(), []);

  return (
    <SupabaseContext.Provider value={supabase}>
      {children}
    </SupabaseContext.Provider>
  );
};
```

### Task 3.5.4: Create useMarketDeals Hook (Public Data)

**File:** `_hooks/useMarketDeals.ts`

Fetches all open deals from Supabase. No decryption needed - just public fields.

```typescript
"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "../_providers/SupabaseProvider";
import { MarketDeal } from "../_lib/types";

export function useMarketDeals() {
  const supabase = useSupabase();
  const [marketDeals, setMarketDeals] = useState<MarketDeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initial fetch
  useEffect(() => {
    async function fetchDeals() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("deals")
        .select("address, base_mint, quote_mint, expires_at, allow_partial, created_at, status")
        .eq("status", "open")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch deals:", error);
      } else {
        setMarketDeals(
          data.map((d) => ({
            id: d.address,
            pair: `${getTokenSymbol(d.base_mint)}/${getTokenSymbol(d.quote_mint)}`,
            expiresAt: d.expires_at,
            createdAt: d.created_at,
            allowPartial: d.allow_partial,
          }))
        );
      }
      setIsLoading(false);
    }

    fetchDeals();
  }, [supabase]);

  // Realtime subscription for new deals
  useEffect(() => {
    const channel = supabase
      .channel("deals-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deals" },
        (payload) => {
          const d = payload.new as Database["public"]["Tables"]["deals"]["Row"];
          if (d.status === "open") {
            setMarketDeals((prev) => [
              {
                id: d.address,
                pair: `${getTokenSymbol(d.base_mint)}/${getTokenSymbol(d.quote_mint)}`,
                expiresAt: d.expires_at,
                createdAt: d.created_at,
                allowPartial: d.allow_partial,
              },
              ...prev,
            ]);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deals" },
        (payload) => {
          const d = payload.new as Database["public"]["Tables"]["deals"]["Row"];
          if (d.status !== "open") {
            // Remove from market deals when settled/expired
            setMarketDeals((prev) => prev.filter((deal) => deal.id !== d.address));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return { marketDeals, isLoading };
}

function getTokenSymbol(mint: string): string {
  // Map mint addresses to symbols - use TOKEN_MINTS constant
  const symbols: Record<string, string> = {
    // Add your mint -> symbol mappings here
  };
  return symbols[mint] || mint.slice(0, 4) + "...";
}
```

### Task 3.5.5: Create Decryption Utilities

**File:** `_lib/decryption.ts`

Helper functions to decrypt user's own deals/offers from Supabase data.

```typescript
import { RescueCipher } from "@arcium-hq/client";
import { fromX64Price } from "./encryption";

/**
 * Checks if a deal/offer belongs to this user by comparing encryption keys.
 */
export function isOwnedByUser(
  rowEncryptionKey: string, // hex-encoded from Supabase
  userEncryptionPubkey: Uint8Array
): boolean {
  const rowKeyBytes = hexToBytes(rowEncryptionKey);
  return arraysEqual(rowKeyBytes, userEncryptionPubkey);
}

/**
 * Decrypts deal creation data (amount, price).
 */
export function decryptDealData(
  cipher: RescueCipher,
  nonce: string,      // hex-encoded
  ciphertexts: string // hex-encoded
): { amount: bigint; price: number } {
  const nonceBytes = hexToBytes(nonce);
  const ciphertextBytes = hexToBytes(ciphertexts);

  // Split ciphertexts into 32-byte chunks
  const chunks = splitIntoChunks(ciphertextBytes, 32);

  const decrypted = cipher.decrypt(chunks, nonceBytes);

  return {
    amount: decrypted[0],
    price: fromX64Price(decrypted[1]),
  };
}

/**
 * Decrypts offer creation data (price, amount).
 */
export function decryptOfferData(
  cipher: RescueCipher,
  nonce: string,
  ciphertexts: string
): { price: number; amount: bigint } {
  const nonceBytes = hexToBytes(nonce);
  const ciphertextBytes = hexToBytes(ciphertexts);
  const chunks = splitIntoChunks(ciphertextBytes, 32);

  const decrypted = cipher.decrypt(chunks, nonceBytes);

  return {
    price: fromX64Price(decrypted[0]),
    amount: decrypted[1],
  };
}

/**
 * Decrypts deal settlement data.
 */
export function decryptDealSettlement(
  cipher: RescueCipher,
  nonce: string,
  ciphertexts: string
): { totalFilled: bigint; creatorReceives: bigint; creatorRefund: bigint } {
  const nonceBytes = hexToBytes(nonce);
  const ciphertextBytes = hexToBytes(ciphertexts);
  const chunks = splitIntoChunks(ciphertextBytes, 32);

  const decrypted = cipher.decrypt(chunks, nonceBytes);

  return {
    totalFilled: decrypted[0],
    creatorReceives: decrypted[1],
    creatorRefund: decrypted[2],
  };
}

// Utility functions
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function splitIntoChunks(bytes: Uint8Array, chunkSize: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(bytes.slice(i, i + chunkSize));
  }
  return chunks;
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
```

### Task 3.5.6: Create useMyDeals Hook (User's Decrypted Deals)

**File:** `_hooks/useMyDeals.ts`

Fetches user's deals from Supabase and decrypts their private data.

```typescript
"use client";

import { useEffect, useState, useMemo } from "react";
import { useSupabase } from "../_providers/SupabaseProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { useOtcProgram } from "../_providers/OtcProvider";
import { createCipher } from "../_lib/encryption";
import { isOwnedByUser, decryptDealData, decryptDealSettlement } from "../_lib/decryption";
import { Deal } from "../_lib/types";

export function useMyDeals() {
  const supabase = useSupabase();
  const { derivedKeys } = useDerivedKeysContext();
  const { mxePublicKey } = useOtcProgram();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create cipher for decryption
  const cipher = useMemo(() => {
    if (!derivedKeys || !mxePublicKey) return null;
    return createCipher(derivedKeys.encryption.privateKey, mxePublicKey);
  }, [derivedKeys, mxePublicKey]);

  // Fetch and decrypt user's deals
  useEffect(() => {
    if (!derivedKeys || !cipher) {
      setDeals([]);
      setIsLoading(false);
      return;
    }

    async function fetchMyDeals() {
      setIsLoading(true);

      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch deals:", error);
        setIsLoading(false);
        return;
      }

      // Filter to user's deals and decrypt
      const myDeals = data
        .filter((d) => isOwnedByUser(d.encryption_key, derivedKeys.encryption.publicKey))
        .map((d) => {
          try {
            const { amount, price } = decryptDealData(cipher, d.nonce, d.ciphertexts);

            // Decrypt settlement if available
            let settlement = null;
            if (d.settlement_nonce && d.settlement_ciphertexts) {
              settlement = decryptDealSettlement(
                cipher,
                d.settlement_nonce,
                d.settlement_ciphertexts
              );
            }

            return {
              id: d.address,
              pair: `${getTokenSymbol(d.base_mint)}/${getTokenSymbol(d.quote_mint)}`,
              amount: Number(amount) / 1e6,
              price,
              total: (Number(amount) / 1e6) * price,
              status: d.status,
              isPartial: false, // Could be computed from settlement
              allowPartial: d.allow_partial,
              expiresAt: d.expires_at,
              createdAt: d.created_at,
              offerCount: 0, // Could join with offers table
              settlement,
            };
          } catch (err) {
            console.error("Failed to decrypt deal:", d.address, err);
            return null;
          }
        })
        .filter((d): d is Deal => d !== null);

      setDeals(myDeals);
      setIsLoading(false);
    }

    fetchMyDeals();
  }, [supabase, derivedKeys, cipher]);

  // Realtime updates for user's deals
  useEffect(() => {
    if (!derivedKeys || !cipher) return;

    const channel = supabase
      .channel("my-deals-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals" },
        (payload) => {
          const d = payload.new as any;
          if (!isOwnedByUser(d.encryption_key, derivedKeys.encryption.publicKey)) {
            return; // Not our deal
          }

          if (payload.eventType === "INSERT") {
            try {
              const { amount, price } = decryptDealData(cipher, d.nonce, d.ciphertexts);
              setDeals((prev) => [
                {
                  id: d.address,
                  pair: `${getTokenSymbol(d.base_mint)}/${getTokenSymbol(d.quote_mint)}`,
                  amount: Number(amount) / 1e6,
                  price,
                  total: (Number(amount) / 1e6) * price,
                  status: d.status,
                  isPartial: false,
                  allowPartial: d.allow_partial,
                  expiresAt: d.expires_at,
                  createdAt: d.created_at,
                  offerCount: 0,
                },
                ...prev,
              ]);
            } catch (err) {
              console.error("Failed to decrypt new deal:", err);
            }
          } else if (payload.eventType === "UPDATE") {
            setDeals((prev) =>
              prev.map((deal) =>
                deal.id === d.address ? { ...deal, status: d.status } : deal
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, derivedKeys, cipher]);

  return { deals, isLoading };
}

function getTokenSymbol(mint: string): string {
  // Map mint addresses to symbols
  return mint.slice(0, 4) + "...";
}
```

---

## Phase 4: Deal Creation ✅

### Task 4.1: Create useCreateDeal Hook ✅

**Implemented:** `frontend/app/otc/_hooks/useCreateDeal.ts`

**File:** `_hooks/useCreateDeal.ts`

```typescript
"use client";

import { useCallback, useState } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { randomBytes } from "crypto";
import {
  deserializeLE,
  getComputationAccAddress,
  getArciumEnv,
} from "@arcium-hq/client";
import { useOtcProgram } from "../_providers/OtcProvider";
import { useDerivedKeys } from "./useDerivedKeys";
import {
  createCipher,
  encryptDealInput,
  toX64Price,
} from "../_lib/encryption";
import { getDealAddress } from "../_lib/accounts";
import { ARCIUM_CLUSTER_OFFSET } from "../_lib/constants";

interface CreateDealParams {
  baseMint: PublicKey;
  quoteMint: PublicKey;
  amount: bigint;      // Base token amount
  price: number;       // Price in quote per base (decimal)
  expiresAt: Date;
  allowPartial: boolean;
}

interface CreateDealResult {
  dealAddress: PublicKey;
  createKey: PublicKey;
  signature: string;
}

interface UseCreateDealReturn {
  createDeal: (params: CreateDealParams) => Promise<CreateDealResult>;
  isCreating: boolean;
  error: Error | null;
}

export function useCreateDeal(): UseCreateDealReturn {
  const { program, provider, mxePublicKey, arciumAccounts, getCompDefAccount } =
    useOtcProgram();
  const { derivedKeys } = useDerivedKeys();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const createDeal = useCallback(
    async (params: CreateDealParams): Promise<CreateDealResult> => {
      if (!program || !provider || !mxePublicKey || !arciumAccounts) {
        throw new Error("Program not initialized");
      }
      if (!derivedKeys) {
        throw new Error("Keys not derived. Please sign to derive keys first.");
      }

      setIsCreating(true);
      setError(null);

      try {
        // 1. Create cipher for encryption
        const cipher = createCipher(
          derivedKeys.encryption.privateKey,
          mxePublicKey
        );

        // 2. Encrypt amount and price
        const x64Price = toX64Price(params.price);
        const nonce = randomBytes(16);
        const ciphertext = encryptDealInput(cipher, params.amount, x64Price, nonce);

        // 3. Generate ephemeral create_key
        const createKey = Keypair.generate();
        const dealAddress = getDealAddress(createKey.publicKey);

        // 4. Prepare computation offset
        const arciumEnv = getArciumEnv();
        const clusterOffset = ARCIUM_CLUSTER_OFFSET ?? arciumEnv.arciumClusterOffset;
        const computationOffset = new anchor.BN(randomBytes(8), "hex");

        // 5. Build and send transaction
        const expiresAtBN = new anchor.BN(Math.floor(params.expiresAt.getTime() / 1000));

        const signature = await program.methods
          .createDeal(
            computationOffset,
            derivedKeys.controller.publicKey, // controller
            Array.from(derivedKeys.encryption.publicKey), // encryption pubkey
            new anchor.BN(deserializeLE(nonce).toString()), // nonce as u128
            expiresAtBN,
            params.allowPartial,
            Array.from(ciphertext[0]), // encrypted amount
            Array.from(ciphertext[1])  // encrypted price
          )
          .accountsPartial({
            createKey: createKey.publicKey,
            deal: dealAddress,
            baseMint: params.baseMint,
            quoteMint: params.quoteMint,
            computationAccount: getComputationAccAddress(
              clusterOffset,
              computationOffset
            ),
            clusterAccount: arciumAccounts.clusterAccount,
            mxeAccount: arciumAccounts.mxeAccount,
            mempoolAccount: arciumAccounts.mempoolAccount,
            executingPool: arciumAccounts.executingPool,
            compDefAccount: getCompDefAccount("create_deal"),
          })
          .signers([createKey])
          .rpc({ skipPreflight: true, commitment: "confirmed" });

        return {
          dealAddress,
          createKey: createKey.publicKey,
          signature,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsCreating(false);
      }
    },
    [program, provider, mxePublicKey, arciumAccounts, derivedKeys, getCompDefAccount]
  );

  return { createDeal, isCreating, error };
}
```

### Task 4.2: Integrate with CreateDealForm ✅

**File:** Modified `_components/CreateDealForm.tsx`

Integrated `useCreateDeal` hook with key derivation flow and proper button states.

```typescript
// Add imports
import { useWallet } from "@solana/wallet-adapter-react";
import { useCreateDeal } from "../_hooks/useCreateDeal";
import { useDerivedKeys } from "../_hooks/useDerivedKeys";
import { TOKEN_MINTS } from "../_lib/constants";

// Inside component:
const { connected } = useWallet();
const { derivedKeys, deriveKeysFromWallet, isDerivingKeys } = useDerivedKeys();
const { createDeal, isCreating } = useCreateDeal();

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // Derive keys if not already done
  if (!derivedKeys) {
    await deriveKeysFromWallet();
    return; // User will click again after signing
  }

  try {
    const result = await createDeal({
      baseMint: TOKEN_MINTS[baseToken],
      quoteMint: TOKEN_MINTS.USDC,
      amount: BigInt(Math.floor(parseFloat(amount) * 1e6)), // Assuming 6 decimals
      price: parseFloat(price),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      allowPartial: true,
    });

    console.log("Deal created:", result.dealAddress.toBase58());
    // Navigate to deals tab, etc.
  } catch (error) {
    console.error("Failed to create deal:", error);
  }
};

// Button states
const buttonText = !connected
  ? "Connect Wallet"
  : !derivedKeys
  ? isDerivingKeys
    ? "Signing..."
    : "Sign to Continue"
  : isCreating
  ? "Creating Deal..."
  : "Create Deal";
```

---

## Phase 5: Offer Submission ✅

### Task 5.1: Create useSubmitOffer Hook ✅

**Implemented:** `frontend/app/otc/_hooks/useSubmitOffer.ts`

**File:** `_hooks/useSubmitOffer.ts`

```typescript
"use client";

import { useCallback, useState } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { randomBytes } from "crypto";
import {
  deserializeLE,
  getComputationAccAddress,
  getArciumEnv,
} from "@arcium-hq/client";
import { useOtcProgram } from "../_providers/OtcProvider";
import { useDerivedKeys } from "./useDerivedKeys";
import {
  createCipher,
  encryptOfferInput,
  toX64Price,
} from "../_lib/encryption";
import { getOfferAddress } from "../_lib/accounts";
import { ARCIUM_CLUSTER_OFFSET } from "../_lib/constants";

interface SubmitOfferParams {
  dealAddress: PublicKey;
  price: number;       // Your bid price (decimal)
  amount: bigint;      // Amount of base asset
}

interface SubmitOfferResult {
  offerAddress: PublicKey;
  createKey: PublicKey;
  signature: string;
}

interface UseSubmitOfferReturn {
  submitOffer: (params: SubmitOfferParams) => Promise<SubmitOfferResult>;
  isSubmitting: boolean;
  error: Error | null;
}

export function useSubmitOffer(): UseSubmitOfferReturn {
  const { program, provider, mxePublicKey, arciumAccounts, getCompDefAccount } =
    useOtcProgram();
  const { derivedKeys } = useDerivedKeys();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const submitOffer = useCallback(
    async (params: SubmitOfferParams): Promise<SubmitOfferResult> => {
      if (!program || !provider || !mxePublicKey || !arciumAccounts) {
        throw new Error("Program not initialized");
      }
      if (!derivedKeys) {
        throw new Error("Keys not derived. Please sign to derive keys first.");
      }

      setIsSubmitting(true);
      setError(null);

      try {
        // 1. Create cipher for encryption
        const cipher = createCipher(
          derivedKeys.encryption.privateKey,
          mxePublicKey
        );

        // 2. Encrypt price and amount (note: price first for OfferInput struct)
        const x64Price = toX64Price(params.price);
        const nonce = randomBytes(16);
        const ciphertext = encryptOfferInput(cipher, x64Price, params.amount, nonce);

        // 3. Generate ephemeral create_key
        const createKey = Keypair.generate();
        const offerAddress = getOfferAddress(params.dealAddress, createKey.publicKey);

        // 4. Prepare computation offset
        const arciumEnv = getArciumEnv();
        const clusterOffset = ARCIUM_CLUSTER_OFFSET ?? arciumEnv.arciumClusterOffset;
        const computationOffset = new anchor.BN(randomBytes(8), "hex");

        // 5. Build and send transaction
        const signature = await program.methods
          .submitOffer(
            computationOffset,
            derivedKeys.controller.publicKey, // controller
            Array.from(derivedKeys.encryption.publicKey), // encryption pubkey
            new anchor.BN(deserializeLE(nonce).toString()), // nonce as u128
            Array.from(ciphertext[0]), // encrypted price
            Array.from(ciphertext[1])  // encrypted amount
          )
          .accountsPartial({
            createKey: createKey.publicKey,
            deal: params.dealAddress,
            offer: offerAddress,
            computationAccount: getComputationAccAddress(
              clusterOffset,
              computationOffset
            ),
            clusterAccount: arciumAccounts.clusterAccount,
            mxeAccount: arciumAccounts.mxeAccount,
            mempoolAccount: arciumAccounts.mempoolAccount,
            executingPool: arciumAccounts.executingPool,
            compDefAccount: getCompDefAccount("submit_offer"),
          })
          .signers([createKey])
          .rpc({ skipPreflight: true, commitment: "confirmed" });

        return {
          offerAddress,
          createKey: createKey.publicKey,
          signature,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsSubmitting(false);
      }
    },
    [program, provider, mxePublicKey, arciumAccounts, derivedKeys, getCompDefAccount]
  );

  return { submitOffer, isSubmitting, error };
}
```

### Task 5.2: Integrate with MakeOfferForm ✅

**File:** Modified `_components/MakeOfferForm.tsx`

Integrated `useSubmitOffer` hook with key derivation flow and proper button states.

---

## Phase 6: User's Offers (Supabase + Decryption)

Similar to Phase 3.5.6 (useMyDeals), we need hooks for user's offers.

### Task 6.1: Create useMyOffers Hook

**File:** `_hooks/useMyOffers.ts`

```typescript
"use client";

import { useEffect, useState, useMemo } from "react";
import { useSupabase } from "../_providers/SupabaseProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { useOtcProgram } from "../_providers/OtcProvider";
import { createCipher } from "../_lib/encryption";
import { isOwnedByUser, decryptOfferData } from "../_lib/decryption";
import { Offer } from "../_lib/types";

export function useMyOffers() {
  const supabase = useSupabase();
  const { derivedKeys } = useDerivedKeysContext();
  const { mxePublicKey } = useOtcProgram();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const cipher = useMemo(() => {
    if (!derivedKeys || !mxePublicKey) return null;
    return createCipher(derivedKeys.encryption.privateKey, mxePublicKey);
  }, [derivedKeys, mxePublicKey]);

  useEffect(() => {
    if (!derivedKeys || !cipher) {
      setOffers([]);
      setIsLoading(false);
      return;
    }

    async function fetchMyOffers() {
      setIsLoading(true);

      // Join with deals to get pair info
      const { data, error } = await supabase
        .from("offers")
        .select(`
          *,
          deals!inner(base_mint, quote_mint, status)
        `)
        .order("submitted_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch offers:", error);
        setIsLoading(false);
        return;
      }

      const myOffers = data
        .filter((o) => isOwnedByUser(o.encryption_key, derivedKeys.encryption.publicKey))
        .map((o) => {
          try {
            const { price, amount } = decryptOfferData(cipher, o.nonce, o.ciphertexts);

            return {
              id: o.address,
              pair: `${getTokenSymbol(o.deals.base_mint)}/${getTokenSymbol(o.deals.quote_mint)}`,
              amount: Number(amount) / 1e6,
              yourPrice: price,
              submittedAt: o.submitted_at,
              dealStatus: o.deals.status,
              offerStatus: o.status === "settled" ? "executed" : "pending",
            };
          } catch (err) {
            console.error("Failed to decrypt offer:", o.address, err);
            return null;
          }
        })
        .filter((o): o is Offer => o !== null);

      setOffers(myOffers);
      setIsLoading(false);
    }

    fetchMyOffers();
  }, [supabase, derivedKeys, cipher]);

  // Realtime updates
  useEffect(() => {
    if (!derivedKeys || !cipher) return;

    const channel = supabase
      .channel("my-offers-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offers" },
        async (payload) => {
          const o = payload.new as any;
          if (!isOwnedByUser(o.encryption_key, derivedKeys.encryption.publicKey)) {
            return;
          }

          if (payload.eventType === "INSERT") {
            // Fetch deal info for the new offer
            const { data: deal } = await supabase
              .from("deals")
              .select("base_mint, quote_mint, status")
              .eq("address", o.deal_address)
              .single();

            if (deal) {
              try {
                const { price, amount } = decryptOfferData(cipher, o.nonce, o.ciphertexts);
                setOffers((prev) => [
                  {
                    id: o.address,
                    pair: `${getTokenSymbol(deal.base_mint)}/${getTokenSymbol(deal.quote_mint)}`,
                    amount: Number(amount) / 1e6,
                    yourPrice: price,
                    submittedAt: o.submitted_at,
                    dealStatus: deal.status,
                    offerStatus: "pending",
                  },
                  ...prev,
                ]);
              } catch (err) {
                console.error("Failed to decrypt new offer:", err);
              }
            }
          } else if (payload.eventType === "UPDATE") {
            setOffers((prev) =>
              prev.map((offer) =>
                offer.id === o.address
                  ? { ...offer, offerStatus: o.status === "settled" ? "executed" : "pending" }
                  : offer
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, derivedKeys, cipher]);

  return { offers, isLoading };
}

function getTokenSymbol(mint: string): string {
  return mint.slice(0, 4) + "...";
}
```

### Task 6.2: Create useOffersForDeal Hook

**File:** `_hooks/useOffersForDeal.ts`

For viewing how many offers a deal has (public count, no decryption).

```typescript
"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "../_providers/SupabaseProvider";

export function useOffersForDeal(dealAddress: string | null) {
  const supabase = useSupabase();
  const [offerCount, setOfferCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!dealAddress) return;

    async function fetchCount() {
      setIsLoading(true);
      const { count, error } = await supabase
        .from("offers")
        .select("*", { count: "exact", head: true })
        .eq("deal_address", dealAddress);

      if (!error && count !== null) {
        setOfferCount(count);
      }
      setIsLoading(false);
    }

    fetchCount();

    // Realtime for offer count changes
    const channel = supabase
      .channel(`deal-offers-${dealAddress}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "offers",
          filter: `deal_address=eq.${dealAddress}`,
        },
        () => {
          setOfferCount((prev) => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, dealAddress]);

  return { offerCount, isLoading };
}
```

---

## Phase 7: Data Flow Integration ✅

**Implemented:** 2026-01-25

**Files created/modified:**
- `frontend/app/otc/_components/ConnectPrompt.tsx` - Wallet/key derivation prompt
- `frontend/app/otc/_components/MarketTable.tsx` - Added empty state
- `frontend/app/otc/_hooks/useMarketDeals.ts` - Added Realtime subscription
- `frontend/app/otc/_hooks/useMyDeals.ts` - Added Realtime subscription
- `frontend/app/otc/_hooks/useMyOffers.ts` - Added Realtime subscription
- `frontend/app/otc/page.tsx` - Replaced mock data with hooks, added loading/error states
- `frontend/.env.example` - Documented all env vars including `NEXT_PUBLIC_USE_MOCK_DATA`

**Key features:**
- Mock data toggle via `NEXT_PUBLIC_USE_MOCK_DATA` env var
- Loading spinners during data fetch
- Error messages on fetch failure
- ConnectPrompt for Deals/Offers tabs when not authenticated
- Market tab works without wallet (public data)
- Supabase Realtime subscriptions for live updates

### Task 7.1: Create DerivedKeysProvider

**File:** `_providers/DerivedKeysProvider.tsx`

Centralized key management context.

```typescript
"use client";

import { createContext, FC, ReactNode, useContext } from "react";
import { useDerivedKeys, UseDerivedKeysReturn } from "../_hooks/useDerivedKeys";

const DerivedKeysContext = createContext<UseDerivedKeysReturn | null>(null);

export const useDerivedKeysContext = () => {
  const context = useContext(DerivedKeysContext);
  if (!context) {
    throw new Error("useDerivedKeysContext must be used within DerivedKeysProvider");
  }
  return context;
};

export const DerivedKeysProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const derivedKeysState = useDerivedKeys();
  return (
    <DerivedKeysContext.Provider value={derivedKeysState}>
      {children}
    </DerivedKeysContext.Provider>
  );
};
```

### Task 7.2: Update Provider Hierarchy

**File:** `app/otc/layout.tsx`

Full provider stack including Supabase:

```typescript
import { ReactNode } from "react";
import { SolanaProvider } from "./_providers/SolanaProvider";
import { SupabaseProvider } from "./_providers/SupabaseProvider";
import { OtcProvider } from "./_providers/OtcProvider";
import { DerivedKeysProvider } from "./_providers/DerivedKeysProvider";

export default function OtcLayout({ children }: { children: ReactNode }) {
  return (
    <SolanaProvider>
      <SupabaseProvider>
        <OtcProvider>
          <DerivedKeysProvider>{children}</DerivedKeysProvider>
        </OtcProvider>
      </SupabaseProvider>
    </SolanaProvider>
  );
}
```

**Provider hierarchy:**
1. **SolanaProvider** - Wallet adapter, RPC connection
2. **SupabaseProvider** - Supabase client for reads
3. **OtcProvider** - Anchor program for writes, MXE key
4. **DerivedKeysProvider** - User's derived encryption/controller keys

### Task 7.3: Replace Mock Data

**File:** Modify `page.tsx`

Replace static `deals`, `marketDeals`, and `offers` with hook-based data:

```typescript
import { useMyDeals } from "./_hooks/useMyDeals";
import { useMyOffers } from "./_hooks/useMyOffers";
import { useMarketDeals } from "./_hooks/useMarketDeals";

export default function OTCPage() {
  // User's own deals (decrypted)
  const { deals, isLoading: dealsLoading } = useMyDeals();

  // User's own offers (decrypted)
  const { offers, isLoading: offersLoading } = useMyOffers();

  // All open market deals (public fields only)
  const { marketDeals, isLoading: marketLoading } = useMarketDeals();

  // Loading states
  const isLoading = dealsLoading || offersLoading || marketLoading;

  // ... rest of component using live data
}
```

### Task 7.4: Update Component Props

Components that previously used mock data should now use live data from hooks:

```typescript
// DealsTable.tsx - receives deals from useMyDeals
<DealsTable deals={deals} isLoading={dealsLoading} />

// MarketTable.tsx - receives marketDeals from useMarketDeals
<MarketTable deals={marketDeals} isLoading={marketLoading} />

// OffersTable.tsx - receives offers from useMyOffers
<OffersTable offers={offers} isLoading={offersLoading} />
```

---

## Phase 8: Error Handling & UX

### Task 8.1: Transaction Status Component

**File:** `_components/TransactionStatus.tsx`

Show pending, confirmed, and error states for transactions.

### Task 8.2: Key Derivation Modal

**File:** `_components/KeyDerivationModal.tsx`

Explain to users what they're signing when deriving keys.

```typescript
interface KeyDerivationModalProps {
  isOpen: boolean;
  onSign: () => void;
  onCancel: () => void;
}

export function KeyDerivationModal({ isOpen, onSign, onCancel }: KeyDerivationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h2>Derive Trading Keys</h2>
        <p>
          To enable private trading, we need you to sign two messages.
          This creates deterministic keypairs that:
        </p>
        <ul>
          <li>Let you create and manage deals privately</li>
          <li>Decrypt your deal/offer details</li>
          <li>Can be regenerated on any device</li>
        </ul>
        <p className="text-muted">
          These signatures are used locally and never leave your browser.
        </p>
        <div className="flex gap-4">
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onSign} className="primary">Sign Messages</button>
        </div>
      </div>
    </div>
  );
}
```

---

## Implementation Order

| Phase | Priority | Dependencies | Status |
|-------|----------|--------------|--------|
| Phase 1: Wallet Connection | High | None | ✅ Done |
| Phase 2: Key Derivation | High | Phase 1 | ✅ Done |
| Phase 3: OTC Program | High | Phase 1 | ✅ Done |
| Phase 3.5: Supabase Integration | High | Indexer deployed, Supabase schema ready | ✅ Done |
| Phase 4: Deal Creation | High | Phase 2, 3 | ✅ Done |
| Phase 5: Offer Submission | High | Phase 2, 3 | ✅ Done |
| Phase 6: User's Offers | Medium | Phase 3.5 | ✅ Done |
| Phase 7: Data Flow | Medium | Phase 3.5, 4, 5, 6 | ✅ Done |
| Phase 8: Error Handling | Medium | All above | ◄── Next |

**Prerequisites:**
1. **Indexer must be deployed** - The frontend reads from Supabase, which is populated by the indexer
2. **Supabase schema must exist** - Tables for `deals` and `offers` (see indexer architecture)
3. **Cranker is optional** - Settlement works without it, but expired deals won't auto-settle

---

## Environment Variables

Add to `.env.local` (see `frontend/.env.example`):

```bash
# Solana RPC endpoint
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com

# Program ID (update after deployment)
NEXT_PUBLIC_OTC_PROGRAM_ID=<your_program_id>

# Arcium cluster offset (leave empty for localnet default)
NEXT_PUBLIC_CLUSTER_OFFSET=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Use mock data instead of Supabase (for development without backend)
NEXT_PUBLIC_USE_MOCK_DATA=false
```

---

## Testing Checklist

### Wallet Connection
- [x] Phantom connects successfully
- [x] Solflare connects successfully
- [x] Disconnect works
- [x] Auto-reconnect on page reload

### Key Derivation
- [x] User signs both messages
- [x] Keys are derived correctly
- [x] Keys persist during session
- [x] Keys clear on disconnect

### Supabase Integration
- [x] Market deals load from Supabase
- [x] New deals appear via Realtime subscription
- [x] Deal status updates reflected in UI
- [x] User's deals filtered and decrypted correctly
- [x] User's offers filtered and decrypted correctly

### Deal Creation
- [x] Form validation works
- [x] Transaction submits successfully
- [x] Deal appears in "Your Deals" tab
- [x] Deal amount/price decrypted correctly

### Offer Submission
- [x] Can submit offer to market deal
- [x] Transaction submits successfully
- [x] Offer appears in "Your Offers" tab
- [x] Offer amount/price decrypted correctly

### Error Handling
- [x] Wallet not connected → shows connect message (ConnectPrompt)
- [x] Keys not derived → prompts for signature (ConnectPrompt)
- [ ] Transaction fails → shows error message
- [ ] Insufficient balance → shows error
- [ ] Supabase unavailable → graceful degradation

---

## Security Considerations

1. **Private keys never leave the client** - derived keys are computed in-browser
2. **Signatures are for derivation only** - not used for on-chain transactions directly
3. **Encryption keys are deterministic** - user can regenerate on any device
4. **Controller keypair** - ephemeral signing authority, not the main wallet

---

## Future Enhancements

1. **Transaction Bundling** - combine multiple operations
2. **Gas Estimation** - show estimated transaction costs
3. **Multi-Wallet Support** - Ledger, Backpack, etc.
4. **Optimistic Updates** - update UI immediately, rollback on failure
5. **Offer Outcome Decryption** - decrypt settlement results after deal settles

---

## Notes

- IDL must be copied from `target/idl/otc.json` after `arcium build`
- Type definitions from `target/types/otc.ts` for TypeScript
- MXE public key may take time to be available on localnet
- Use `skipPreflight: true` for Arcium transactions (encryption validation happens in MPC)
- **Supabase Realtime** handles live updates - no need for direct Solana event subscriptions
- **Indexer must be running** for data to appear in Supabase
- Database types can be auto-generated: `supabase gen types typescript --project-id <id>`

---

## System Dependencies

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────►│   Solana    │────►│   Indexer   │
│  (writes)   │     │  + Arcium   │     │  (reads     │
└─────────────┘     └─────────────┘     │   events)   │
      │                                  └──────┬──────┘
      │                                         │
      │         ┌─────────────┐                 │
      └────────►│  Supabase   │◄────────────────┘
        (reads) │  (storage)  │   (writes)
                └─────────────┘
```

The frontend depends on:
1. **Solana + Arcium** - for creating deals and submitting offers
2. **Supabase** - for reading deal/offer data
3. **Indexer** - must be running to populate Supabase with on-chain events
