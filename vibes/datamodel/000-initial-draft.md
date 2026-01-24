# OTC Data Model - Initial Draft

**Date:** 2026-01-23
**Status:** Complete (all questions resolved)

---

## Overview

This document consolidates data definitions across:
- **On-chain accounts** (Rust structs in `programs/otc/src/state/`)
- **On-chain events** (Rust events in `programs/otc/src/events.rs`)
- **Database schema** (Supabase/Postgres)
- **Frontend types** (TypeScript in `frontend/app/otc/_lib/types.ts`)

---

## 1. On-Chain Accounts

### DealAccount

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `nonce` | `[u8; 16]` | - | Nonce for MXE encryption |
| `ciphertexts` | `[[u8; 32]; 3]` | Yes | amount (u64), price (u128 X64.64), fill_amount (u64) |
| `create_key` | `Pubkey` | No | Ephemeral signer for PDA uniqueness |
| `controller` | `Pubkey` | No | Derived ed25519 signing authority |
| `encryption_pubkey` | `[u8; 32]` | No | Creator's x25519 pubkey |
| `base_mint` | `Pubkey` | No | Token being sold |
| `quote_mint` | `Pubkey` | No | Token received in exchange |
| `created_at` | `i64` | No | Unix timestamp (set at callback) |
| `expires_at` | `i64` | No | Unix timestamp when deal expires |
| `status` | `u8` | No | 0=OPEN, 1=EXECUTED, 2=EXPIRED |
| `allow_partial` | `bool` | No | Allow partial fills at expiry |
| `num_offers` | `u32` | No | Counter of offers |
| `bump` | `u8` | No | PDA bump |

**PDA Seeds:** `["deal", create_key]`

### OfferAccount

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `nonce` | `[u8; 16]` | - | Nonce for MXE encryption |
| `ciphertexts` | `[[u8; 32]; 3]` | Yes | price (u128), amount (u64), amt_to_execute (u64) |
| `create_key` | `Pubkey` | No | Ephemeral signer for PDA uniqueness |
| `controller` | `Pubkey` | No | Derived ed25519 signing authority |
| `encryption_pubkey` | `[u8; 32]` | No | Offeror's x25519 pubkey |
| `deal` | `Pubkey` | No | Parent deal address |
| `submitted_at` | `i64` | No | Unix timestamp (set at callback) |
| `offer_index` | `u32` | No | FIFO sequence number |
| `status` | `u8` | No | 0=OPEN, 1=SETTLED |
| `bump` | `u8` | No | PDA bump |

**PDA Seeds:** `["offer", deal, create_key]`

### Status & Outcome Enums

All enum values are defined in `programs/otc/src/state/status.rs` and `encrypted-ixs/src/lib.rs`.

#### DealStatus (on-chain account status)

| Value | Name | Description |
|-------|------|-------------|
| 0 | OPEN | Deal is active, accepting offers |
| 1 | EXECUTED | Deal settled with fills (full OR partial if `allow_partial=true`) |
| 2 | EXPIRED | Deal expired with no fills, OR partial fills but `allow_partial=false` |

**Logic (from `crank_deal`):**
- `EXECUTED` if: fully filled OR (`allow_partial` AND has some fills)
- `EXPIRED` if: expired with no fills OR (has partial fills but `allow_partial=false`)

#### OfferStatus (on-chain account status)

| Value | Name | Description |
|-------|------|-------------|
| 0 | OPEN | Offer pending, not yet settled |
| 1 | SETTLED | Offer has been cranked (see OfferOutcome for result) |

#### OfferOutcome (encrypted in OfferSettled event)

| Value | Name | Description |
|-------|------|-------------|
| 0 | EXECUTED | Fully filled (`executed_amt == offer.amount`) |
| 1 | PARTIAL | Partially filled (`0 < executed_amt < offer.amount`) |
| 2 | FAILED | Nothing executed (`executed_amt == 0`) - price too low or deal expired |

**Note:** `OfferOutcome` is only available after decrypting the `OfferSettled` event. The on-chain `OfferAccount.status` only shows OPEN vs SETTLED.

```rust
// Rust definitions
pub struct DealStatus;
impl DealStatus {
    pub const OPEN: u8 = 0;
    pub const EXECUTED: u8 = 1;
    pub const EXPIRED: u8 = 2;
}

pub struct OfferStatus;
impl OfferStatus {
    pub const OPEN: u8 = 0;
    pub const SETTLED: u8 = 1;
}

// OfferOutcome (in encrypted-ixs, not exposed on-chain)
pub const EXECUTED: u8 = 0;
pub const PARTIAL: u8 = 1;
pub const FAILED: u8 = 2;
```

---

## 2. On-Chain Events

### DealCreated

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `deal` | `Pubkey` | No | Deal PDA address |
| `base_mint` | `Pubkey` | No | Token being sold |
| `quote_mint` | `Pubkey` | No | Token received |
| `created_at` | `i64` | No | Creation timestamp |
| `expires_at` | `i64` | No | Expiration timestamp |
| `allow_partial` | `bool` | No | Allow partial fills |
| `encryption_key` | `[u8; 32]` | No | Creator's x25519 pubkey (echoed) |
| `nonce` | `[u8; 16]` | - | Encryption nonce |
| `ciphertexts` | `[[u8; 32]; 2]` | Yes | amount (u64), price (u128 X64.64) |

### OfferCreated

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `deal` | `Pubkey` | No | Parent deal address |
| `offer` | `Pubkey` | No | Offer PDA address |
| `offer_index` | `u32` | No | FIFO sequence number |
| `submitted_at` | `i64` | No | Submission timestamp |
| `encryption_key` | `[u8; 32]` | No | Offeror's x25519 pubkey |
| `nonce` | `[u8; 16]` | - | Encryption nonce |
| `ciphertexts` | `[[u8; 32]; 2]` | Yes | price (u128), amount (u64) |

### DealSettled

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `deal` | `Pubkey` | No | Deal PDA address |
| `status` | `u8` | No | 1=EXECUTED, 2=EXPIRED |
| `settled_at` | `i64` | No | Settlement timestamp |
| `encryption_key` | `[u8; 32]` | No | Creator's x25519 pubkey |
| `nonce` | `[u8; 16]` | - | Encryption nonce |
| `ciphertexts` | `[[u8; 32]; 3]` | Yes | total_filled, creator_receives, creator_refund (all u64) |

### OfferSettled

| Field | Type | Encrypted | Description |
|-------|------|-----------|-------------|
| `deal` | `Pubkey` | No | Parent deal address |
| `offer` | `Pubkey` | No | Offer PDA address |
| `offer_index` | `u32` | No | FIFO sequence number |
| `encryption_key` | `[u8; 32]` | No | Offeror's x25519 pubkey |
| `nonce` | `[u8; 16]` | - | Encryption nonce |
| `ciphertexts` | `[[u8; 32]; 3]` | Yes | outcome (u8), executed_amt (u64), refund_amt (u64) |

---

## 3. Database Schema (Supabase)

### deals

```sql
CREATE TABLE deals (
  -- Primary key
  address TEXT PRIMARY KEY,           -- Deal pubkey (base58)

  -- Public metadata (from DealCreated event)
  base_mint TEXT NOT NULL,
  quote_mint TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  allow_partial BOOLEAN NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'executed' | 'expired'
  created_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,              -- Set when settled

  -- Creation encrypted data
  encryption_key BYTEA NOT NULL,       -- [u8; 32] creator's x25519 pubkey
  nonce BYTEA NOT NULL,                -- [u8; 16]
  ciphertexts BYTEA NOT NULL,          -- [[u8; 32]; 2] = 64 bytes

  -- Settlement encrypted data (null until settled)
  settlement_encryption_key BYTEA,
  settlement_nonce BYTEA,
  settlement_ciphertexts BYTEA,        -- [[u8; 32]; 3] = 96 bytes

  -- Indexing metadata
  created_signature TEXT NOT NULL,
  settled_signature TEXT,
  indexed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deals_status ON deals(status);
CREATE INDEX idx_deals_mints ON deals(base_mint, quote_mint);
CREATE INDEX idx_deals_expires_at ON deals(expires_at);
```

### offers

```sql
CREATE TABLE offers (
  -- Primary key
  address TEXT PRIMARY KEY,           -- Offer pubkey (base58)

  -- Relationships
  deal_address TEXT NOT NULL REFERENCES deals(address),

  -- Public metadata (from OfferCreated event)
  offer_index INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'settled'
  submitted_at TIMESTAMPTZ NOT NULL,

  -- Creation encrypted data
  encryption_key BYTEA NOT NULL,       -- [u8; 32] offeror's x25519 pubkey
  nonce BYTEA NOT NULL,                -- [u8; 16]
  ciphertexts BYTEA NOT NULL,          -- [[u8; 32]; 2] = 64 bytes

  -- Settlement encrypted data (null until settled)
  settlement_encryption_key BYTEA,
  settlement_nonce BYTEA,
  settlement_ciphertexts BYTEA,        -- [[u8; 32]; 3] = 96 bytes

  -- Indexing metadata
  created_signature TEXT NOT NULL,
  settled_signature TEXT,
  indexed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_offers_deal ON offers(deal_address);
CREATE INDEX idx_offers_status ON offers(status);
```

### raw_events (optional audit trail)

```sql
CREATE TABLE raw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature TEXT NOT NULL,
  slot BIGINT NOT NULL,
  block_time TIMESTAMPTZ,
  event_name TEXT NOT NULL,
  raw_data BYTEA NOT NULL,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(signature, event_name)
);

CREATE INDEX idx_raw_events_slot ON raw_events(slot);
CREATE INDEX idx_raw_events_event_name ON raw_events(event_name);
```

---

## 4. Frontend Types

### Database Row Types (from Supabase)

```typescript
// Generated via `supabase gen types typescript`
interface DealRow {
  address: string;
  base_mint: string;
  quote_mint: string;
  expires_at: string;        // ISO timestamp
  allow_partial: boolean;
  status: 'open' | 'executed' | 'expired';
  created_at: string;
  settled_at: string | null;
  encryption_key: string;    // base64-encoded (Supabase BYTEA default)
  nonce: string;             // base64-encoded
  ciphertexts: string;       // base64-encoded
  settlement_encryption_key: string | null;
  settlement_nonce: string | null;
  settlement_ciphertexts: string | null;
}

interface OfferRow {
  address: string;
  deal_address: string;
  offer_index: number;
  status: 'open' | 'settled';
  submitted_at: string;
  encryption_key: string;    // base64-encoded
  nonce: string;             // base64-encoded
  ciphertexts: string;       // base64-encoded
  settlement_encryption_key: string | null;
  settlement_nonce: string | null;
  settlement_ciphertexts: string | null;
}
```

### Decrypted Blobs

```typescript
// DealCreated ciphertexts (2 fields)
interface DecryptedDealCreation {
  amount: bigint;      // u64 - base token amount (raw, no decimals)
  price: bigint;       // u128 X64.64 - needs fromX64Price() conversion
}

// OfferCreated ciphertexts (2 fields)
interface DecryptedOfferCreation {
  price: bigint;       // u128 X64.64
  amount: bigint;      // u64 - base token amount
}

// DealSettled ciphertexts (3 fields)
interface DecryptedDealSettlement {
  totalFilled: bigint;      // u64 - total base filled
  creatorReceives: bigint;  // u64 - quote tokens to receive
  creatorRefund: bigint;    // u64 - base tokens refunded
}

// OfferSettled ciphertexts (3 fields)
interface DecryptedOfferSettlement {
  outcome: number;         // u8 - see OfferOutcome enum
  executedAmt: bigint;     // u64 - base tokens executed
  refundAmt: bigint;       // u64 - quote tokens refunded
}
```

### Application Types (UI)

```typescript
// User's own deal (full visibility)
interface Deal {
  id: string;              // address
  baseMint: string;        // Token being offered
  quoteMint: string;       // Token accepted as payment
  amount: number;          // Decrypted, decimal-adjusted
  price: number;           // Decrypted, X64.64 converted
  total: number;           // amount * price
  status: 'open' | 'executed' | 'expired';
  isPartial: boolean;      // Was it partially filled? (from settlement)
  allowPartial: boolean;
  expiresAt: number;       // Unix timestamp
  createdAt: number;
  offerCount: number;
  settlement?: DecryptedDealSettlement;
}

// Other users' deals (public only)
interface MarketDeal {
  id: string;
  baseMint: string;
  quoteMint: string;
  expiresAt: number;
  createdAt: number;
  allowPartial: boolean;
  offerCount: number;
}

// User's own offer (full visibility)
interface Offer {
  id: string;              // address
  dealId: string;          // deal_address
  baseMint: string;        // From parent deal
  quoteMint: string;       // From parent deal
  amount: number;          // Decrypted
  yourPrice: number;       // Decrypted
  submittedAt: number;
  offerIndex: number;
  dealStatus: 'open' | 'executed' | 'expired';
  offerStatus: 'pending' | 'executed' | 'partial' | 'failed';  // pending = not yet settled
  settlement?: DecryptedOfferSettlement;
}
```

---

## 5. Field Mappings

### DealCreated Event → deals Table

| Event Field | DB Column | Transform |
|------------|-----------|-----------|
| `deal` | `address` | `.toBase58()` |
| `base_mint` | `base_mint` | `.toBase58()` |
| `quote_mint` | `quote_mint` | `.toBase58()` |
| `created_at` | `created_at` | Unix → ISO |
| `expires_at` | `expires_at` | Unix → ISO |
| `allow_partial` | `allow_partial` | direct |
| `encryption_key` | `encryption_key` | direct (BYTEA) |
| `nonce` | `nonce` | direct (BYTEA) |
| `ciphertexts` | `ciphertexts` | flatten (BYTEA) |
| (context) | `created_signature` | tx signature |
| - | `status` | default `'open'` |

### DealSettled Event → deals Table (UPDATE)

| Event Field | DB Column | Transform |
|------------|-----------|-----------|
| `deal` | (lookup key) | `.toBase58()` |
| `status` | `status` | 1→'executed', 2→'expired' |
| `settled_at` | `settled_at` | Unix → ISO |
| `encryption_key` | `settlement_encryption_key` | direct (BYTEA) |
| `nonce` | `settlement_nonce` | direct (BYTEA) |
| `ciphertexts` | `settlement_ciphertexts` | flatten (BYTEA) |
| (context) | `settled_signature` | tx signature |

### OfferCreated Event → offers Table

| Event Field | DB Column | Transform |
|------------|-----------|-----------|
| `offer` | `address` | `.toBase58()` |
| `deal` | `deal_address` | `.toBase58()` |
| `offer_index` | `offer_index` | direct |
| `submitted_at` | `submitted_at` | Unix → ISO |
| `encryption_key` | `encryption_key` | direct (BYTEA) |
| `nonce` | `nonce` | direct (BYTEA) |
| `ciphertexts` | `ciphertexts` | flatten (BYTEA) |
| (context) | `created_signature` | tx signature |
| - | `status` | default `'open'` |

### OfferSettled Event → offers Table (UPDATE)

| Event Field | DB Column | Transform |
|------------|-----------|-----------|
| `offer` | (lookup key) | `.toBase58()` |
| - | `status` | set to `'settled'` |
| `encryption_key` | `settlement_encryption_key` | direct (BYTEA) |
| `nonce` | `settlement_nonce` | direct (BYTEA) |
| `ciphertexts` | `settlement_ciphertexts` | flatten (BYTEA) |
| (context) | `settled_signature` | tx signature |

---

## 6. Open Questions / Gaps

### 1. Deal Type (buy/sell) - ✅ RESOLVED

~~The frontend has `type: 'buy' | 'sell'` but this is **not in DealAccount or events**.~~

**Decision:** Remove the buy/sell concept entirely. The OTC model only has **base/quote**:
- `base_mint` = token being offered by the deal creator
- `quote_mint` = token used to purchase the base

There is no "buy" vs "sell" - every deal is simply offering base tokens in exchange for quote tokens. The frontend types will be updated to remove `type: 'buy' | 'sell'` fields.

### 2. OfferOutcome Values - ✅ RESOLVED

`OfferSettled.ciphertexts[0]` is `outcome: u8`.

**Actual values (from `encrypted-ixs/src/lib.rs`):**
```rust
pub const EXECUTED: u8 = 0;   // Fully filled (executed_amt == offer.amount)
pub const PARTIAL: u8 = 1;    // Partially filled (0 < executed_amt < offer.amount)
pub const FAILED: u8 = 2;     // Nothing executed (price too low OR deal expired)
```

Note: FAILED covers both "rejected due to price" and "deal expired" since both result in `executed_amt == 0`.

### 3. Token Decimals - ✅ RESOLVED

Amounts in events are raw (no decimals). Frontend needs decimals for display.

**Decision:** Hardcode in frontend `tokens.ts` for now. Migrate to DB approach later if needed.

```typescript
// frontend/app/otc/_lib/tokens.ts
export const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', decimals: 6 },
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', decimals: 9 },
  // ... add tokens as needed
};

export function getTokenInfo(mint: string) {
  return TOKENS[mint] ?? { symbol: mint.slice(0, 4) + '...', decimals: 0 };
}
```

This is already covered by the "Add token registry + pair formatting" task in `vibes/today.md`.

### 4. Offer Count - ✅ RESOLVED

DealAccount has `num_offers` on-chain. DB needs count for queries.

**Decision:** Use COUNT query via Supabase join. Simplest approach, no sync logic.

```typescript
const { data } = await supabase
  .from('deals')
  .select('*, offers(count)')
  .eq('status', 'open');
```

Can denormalize later if performance becomes an issue.

### 5. Timestamp Fields in Events - ✅ RESOLVED (Implemented)

`DealAccount.created_at` and `OfferAccount.submitted_at` are set at callback time and now included in events.

**Implementation complete:**
- `DealCreated`: Added `created_at: i64`
- `OfferCreated`: Added `submitted_at: i64`

Changed files:
- `programs/otc/src/events.rs` - Added fields to both event structs
- `programs/otc/src/instructions/create_deal.rs` - Emits `created_at`
- `programs/otc/src/instructions/submit_offer.rs` - Emits `submitted_at`

### 6. Bytes Encoding Format - ✅ RESOLVED

**Decision:** Keep `BYTEA`. Supabase auto-encodes as base64 over the wire. Frontend decodes:

```typescript
// Supabase returns BYTEA as base64
function base64ToBytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

// Split ciphertexts into 32-byte chunks for decryption
function splitCiphertexts(bytes: Uint8Array, chunkSize = 32): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    chunks.push(bytes.slice(i, i + chunkSize));
  }
  return chunks;
}
```

We need byte manipulation for decryption anyway, so BYTEA is the cleanest approach.

---

## 7. Recommended Schema Additions

### To deals table

No additional columns needed. Offer count derived via COUNT query.

### To offers table

```sql
-- No additions needed currently
```

### Token registry table (future option)

Currently using frontend `tokens.ts` (see Question 3). If we need DB-based token registry later:

```sql
CREATE TABLE tokens (
  mint TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  decimals INT NOT NULL,
  is_stable BOOLEAN NOT NULL DEFAULT FALSE
);
```

---

## 8. Frontend Type Additions

```typescript
// Token registry
interface TokenInfo {
  mint: string;
  symbol: string;
  decimals: number;
  isStable: boolean;
}

// Offer outcome enum (from encrypted-ixs)
enum OfferOutcome {
  EXECUTED = 0,  // Fully filled
  PARTIAL = 1,   // Partially filled
  FAILED = 2,    // Nothing executed (price too low or deal expired)
}

// Status enums (matching on-chain)
enum DealStatus {
  OPEN = 0,
  EXECUTED = 1,
  EXPIRED = 2,
}

enum OfferStatus {
  OPEN = 0,
  SETTLED = 1,
}
```

---

## 9. Summary

| Layer | Source of Truth | Key Insight |
|-------|-----------------|-------------|
| On-chain accounts | Rust structs | 3 encrypted fields each, MXE-encrypted |
| Events | Rust events | 2 encrypted on creation, 3 on settlement |
| Database | Supabase | Stores encrypted blobs, never decrypts |
| Frontend | TypeScript | Decrypts client-side for own data |

**Key flows:**
1. **Create Deal:** Frontend encrypts → Solana/Arcium → Event → Indexer → Supabase
2. **View Market:** Supabase (public fields only) → Frontend
3. **View Own Data:** Supabase (encrypted) → Frontend decrypts → Display

---

## 10. Next Steps

All open questions resolved. Ready to proceed:

1. ~~**Program changes:** Add `created_at` to `DealCreated` and `submitted_at` to `OfferCreated` events~~ ✅
2. **Supabase setup:** Create project and apply schema from Section 3
3. **Generate types:** `supabase gen types typescript`
4. **Frontend tasks:** Remove buy/sell, add token registry (see `vibes/today.md`)
5. **Indexer:** Implement using schema and field mappings from this document
