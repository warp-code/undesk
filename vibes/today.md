# OTC Project Status - 2026-01-24

## Current State

| Component | Status | Details |
|-----------|--------|---------|
| **Solana Program** | Done | 4 OTC instructions + callbacks |
| **Encrypted Instructions** | Done | Arcis circuits for MPC |
| **Frontend UI** | Done (mock) | Full UI, mock data only |
| **Tests** | Done | All passing |
| **Indexer** | Done | `packages/indexer/` with .env defaults |
| **Cranker** | Done | `packages/cranker/` with .env defaults |
| **Frontend Integration** | In progress | Phases 1-3 done, see `vibes/frontend/004-*` |

---

## Quick Tasks

### ~~Remove buy/sell concept from frontend~~ ✅

Done. Removed all `type: 'buy' | 'sell'` and `side` references. Renamed `MarketDeal.isPartial` → `allowPartial`. Changed `offerStatus: 'passed'` → `'executed'`.

### ~~Add timestamps to creation events~~ ✅

Done. Added `created_at: i64` to `DealCreated` and `submitted_at: i64` to `OfferCreated` events. Timestamps are emitted from the callback handlers.

---

### ~~Add token registry + pair formatting~~ ✅

Done. Created `frontend/app/otc/_lib/tokens.ts` with:
- `TOKEN_REGISTRY` - Mint → symbol/decimals/name mapping (~20 popular tokens)
- `SUPPORTED_MINTS` / `MINTS` - UI dropdown tokens (SOL, USDC, ETH, META)
- `getTokenSymbol()`, `formatPair()`, `getTokenInfo()` helpers
- Mint-first refactor: all components now use mint addresses as source of truth

See: `vibes/frontend/005-mint-first-refactor-resolved.md`

---

### ~~Add `settled_at` to OfferSettled event~~ ✅

Done. Added `settled_at: i64` to `OfferSettled` event for consistency with `DealSettled`. Timestamp emitted via `Clock::get()?.unix_timestamp` in callback.

---

## Next Tasks

### ~~1. Fix Crank Encryption Validation~~ ✅

Done. Solved via design change: encryption pubkey is now read directly from account (`ctx.accounts.deal.encryption_pubkey`) instead of being passed as a parameter. No validation needed.

---

### ~~2. Define Complete Data Model~~ ✅

**Output:** `vibes/datamodel/000-initial-draft.md`

Complete. Covers on-chain accounts, events, database schema, frontend types, and field mappings. All open questions resolved.

---

### ~~3. Supabase Setup~~ ✅

Done. Local Supabase running with:
- `deals`, `offers`, `raw_events` tables
- All indexes including `encryption_key` for "my deals/offers" queries
- RLS enabled (anon: read-only, service_role: full access)
- Realtime enabled for `deals` and `offers`

Migrations: `supabase/migrations/`

---

### ~~4. Implement Indexer~~ ✅

Done. `packages/indexer/` with:
- `parser.ts` - Anchor BorshCoder event parsing
- `adapters/rpc.ts` - Real-time log subscription
- `storage/supabase.ts` - Upserts with slot-based idempotency
- `handler.ts` - Routes events to storage
- `index.ts` - Entry point (`yarn start`)
- `backfill.ts` - Historical backfill (`yarn backfill`)
- `.env` support with localnet defaults

---

### 5. Frontend Integration (Large)

**8 phases** documented in `vibes/frontend/004-solana-anchor-integration-plan.md`

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Wallet connection (SolanaProvider, WalletButton) | ✅ |
| 2 | Key derivation (encryption.ts, useDerivedKeys) | ✅ |
| 3 | OTC Program (OtcProvider, accounts.ts) | ✅ |
| 3.5 | Supabase integration (SupabaseProvider, useMarketDeals) | |
| 4 | Deal creation (useCreateDeal) | |
| 5 | Offer submission (useSubmitOffer) | |
| 6 | User's offers (useMyOffers) | |
| 7 | Data flow (wire up providers, replace mock data) | |
| 8 | Error handling & UX | |

---

### ~~6. Implement Cranker~~ ✅

Done. `packages/cranker/` with:
- `queries.ts` - Supabase queries for expired deals + open offers on settled deals
- `transactions.ts` - Build crank instruction accounts using `@arcium-hq/client`
- `execute.ts` - Send tx + `awaitComputationFinalization`
- `cranker.ts` - Main polling loop (deals first, then offers)
- `index.ts` - Entry point with graceful shutdown
- `.env` support with localnet defaults

Run: `yarn workspace @otc/cranker start`

---

## Dependency Graph

```
1. Fix crank validation ✅
2. Define data model ✅
        │
        ▼
3. Supabase setup ✅
        │
        ▼
4. Indexer ✅
        │
   ┌────┴────┐
   │         │
   ▼         ▼
5. Frontend  6. Cranker ✅
   (phases 1-3 ✅)
   ◄── You are here
```

---

## Quick Links

- **Data model: `vibes/datamodel/000-initial-draft.md`**
- Instruction plan: `vibes/program/execution/001_instruction-plan.md`
- Frontend integration: `vibes/frontend/004-solana-anchor-integration-plan.md`
- Indexer architecture: `vibes/indexer/000-indexer-architecture.md`
- Cranker architecture: `vibes/cranker/000-cranker-architecture.md`
