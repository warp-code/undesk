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

## Next Tasks

### 1. Fix Crank Encryption Validation (Small)

**Files:** `crank_deal.rs`, `crank_offer.rs`, `error.rs`

Add validation that `creator_encryption_pubkey == deal.encryption_pubkey` (and same for offers). Prevents malicious crankers from encrypting settlements to wrong keys.

See: `vibes/program/execution/002_validate-crank-encryption-pubkey.md`

---

### 2. Define Complete Data Model

**Output:** `vibes/data-model.md`

Before building indexer/Supabase/cranker, establish the authoritative data model:

- **On-chain accounts:** DealAccount, OfferAccount (what's stored in Solana)
- **Events:** DealCreated, OfferCreated, DealSettled, OfferSettled (what the program emits)
- **Database schema:** How events map to Supabase tables
- **Frontend types:** What the UI needs (public vs decrypted views)
- **Field mappings:** On-chain → Event → DB → Frontend

This consolidates scattered definitions from:
- `programs/otc/src/state/` (Rust account structs)
- `programs/otc/src/events.rs` (Rust event structs)
- `vibes/indexer/000-indexer-architecture.md` (DB schema draft)
- `vibes/frontend/004-*` (TypeScript types)

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
1. Fix crank validation
        │
        ▼
2. Define data model  ◄── Foundation for everything below
        │
        ▼
3. Supabase setup
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

- Instruction plan: `vibes/program/execution/001_instruction-plan.md`
- Frontend integration: `vibes/frontend/004-solana-anchor-integration-plan.md`
- Indexer architecture: `vibes/indexer/000-indexer-architecture.md`
- Cranker architecture: `vibes/cranker/000-cranker-architecture.md`
- Crank validation fix: `vibes/program/execution/002_validate-crank-encryption-pubkey.md`
