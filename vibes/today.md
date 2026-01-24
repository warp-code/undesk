# OTC Project Status - 2026-01-23

## Current State

| Component | Status | Details |
|-----------|--------|---------|
| **Solana Program** | Done | 4 OTC instructions + callbacks |
| **Encrypted Instructions** | Done | Arcis circuits for MPC |
| **Frontend UI** | Done (mock) | Full UI, mock data only |
| **Tests** | Done | All passing |
| **Indexer** | Not started | Architecture in `vibes/indexer/` |
| **Cranker** | Not started | Architecture in `vibes/cranker/` |
| **Frontend Integration** | Not started | Plan in `vibes/frontend/004-*` |

---

## Quick Tasks

### ~~Remove buy/sell concept from frontend~~ ✅

Done. Removed all `type: 'buy' | 'sell'` and `side` references. Renamed `MarketDeal.isPartial` → `allowPartial`. Changed `offerStatus: 'passed'` → `'executed'`.

### ~~Add timestamps to creation events~~ ✅

Done. Added `created_at: i64` to `DealCreated` and `submitted_at: i64` to `OfferCreated` events. Timestamps are emitted from the callback handlers.

---

### Add token registry + pair formatting

Create a token registry and derive display strings from mints:
- **First:** Determine source for initial token list (~200 most popular Solana tokens). Options:
  - Jupiter token list API
  - Solana token list repo
  - CoinGecko Solana tokens
- `frontend/app/otc/_lib/tokens.ts` - Token registry mapping mint addresses to symbols/decimals
- `formatPair(baseMint, quoteMint)` - Returns "META/USDC" style string for display
- Remove hardcoded `pair: string` fields from types - derive at render time

---

## Next Tasks

### ~~1. Fix Crank Encryption Validation~~ ✅

Done. Solved via design change: encryption pubkey is now read directly from account (`ctx.accounts.deal.encryption_pubkey`) instead of being passed as a parameter. No validation needed.

---

### ~~2. Define Complete Data Model~~ ✅

**Output:** `vibes/datamodel/000-initial-draft.md`

Complete. Covers on-chain accounts, events, database schema, frontend types, and field mappings. All open questions resolved.

---

### 3. Supabase Setup

- Create project
- Create schema (from data model)
- Enable Realtime
- Generate TypeScript types

---

### 4. Implement Indexer

**Create:** `indexer/` workspace

Captures on-chain events and stores in Supabase. Required before frontend integration.

Components:
- `parser.ts` - Anchor EventParser + IDL
- `adapters/rpc.ts` - RPC subscription
- `storage/supabase.ts` - Insert/upsert functions
- `handler.ts` - Route events to storage
- `index.ts` - Entry point
- `backfill.ts` - Historical backfill

Architecture: `vibes/indexer/000-indexer-architecture.md`

---

### 5. Frontend Integration (Large)

**8 phases** documented in `vibes/frontend/004-solana-anchor-integration-plan.md`

| Phase | Description |
|-------|-------------|
| 1 | Wallet connection (SolanaProvider, WalletButton) |
| 2 | Key derivation (encryption.ts, useDerivedKeys) |
| 3 | OTC Program (OtcProvider, accounts.ts) |
| 3.5 | Supabase integration (SupabaseProvider, useMarketDeals) |
| 4 | Deal creation (useCreateDeal) |
| 5 | Offer submission (useSubmitOffer) |
| 6 | User's offers (useMyOffers) |
| 7 | Data flow (wire up providers, replace mock data) |
| 8 | Error handling & UX |

---

### 6. Implement Cranker (Parallel with #5)

**Create:** `cranker/` workspace

Polls Supabase for expired deals, calls `crank_deal` and `crank_offer`.

Components:
- `queries.ts` - Supabase queries for crankable items
- `transactions.ts` - Build crank instructions
- `execute.ts` - Send + await finalization
- `cranker.ts` - Main loop
- `index.ts` - Entry point

Architecture: `vibes/cranker/000-cranker-architecture.md`

---

## Dependency Graph

```
1. Fix crank validation ✅
2. Define data model ✅
        │
        ▼
3. Supabase setup  ◄── You are here
        │
        ▼
4. Indexer
        │
   ┌────┴────┐
   │         │
   ▼         ▼
5. Frontend  6. Cranker
```

---

## Quick Links

- **Data model: `vibes/datamodel/000-initial-draft.md`**
- Instruction plan: `vibes/program/execution/001_instruction-plan.md`
- Frontend integration: `vibes/frontend/004-solana-anchor-integration-plan.md`
- Indexer architecture: `vibes/indexer/000-indexer-architecture.md`
- Cranker architecture: `vibes/cranker/000-cranker-architecture.md`
