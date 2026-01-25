# Frontend Integration - Implementation Overview

**Date:** 2026-01-24
**Status:** In progress (Phases 1-3.5, 6 complete)
**Reference:** `vibes/frontend/004-solana-anchor-integration-plan.md`

---

## Executive Summary

The frontend is currently a fully-functional UI with **mock data only**. This document outlines the concrete steps to wire it up to:
1. **Solana blockchain** via wallet adapters and Anchor
2. **Arcium MPC** for encrypted deal/offer creation
3. **Supabase** for reading indexed data with real-time updates

---

## Current State

### What Exists

| Component | Location | Status |
|-----------|----------|--------|
| Page layout | `page.tsx` | Complete |
| CreateDealForm | `_components/CreateDealForm.tsx` | UI complete, mock submit |
| MakeOfferForm | `_components/MakeOfferForm.tsx` | UI complete, mock submit |
| DealsTable | `_components/DealsTable.tsx` | Works with mock data |
| MarketTable | `_components/MarketTable.tsx` | Works with mock data |
| OffersTable | `_components/OffersTable.tsx` | Works with mock data |
| Token registry | `_lib/tokens.ts` | Complete (mint-first) |
| Types | `_lib/types.ts` | Complete |
| URL state | `_hooks/useUrlState.ts` | Complete |

### What's Missing

| Component | Purpose |
|-----------|---------|
| ~~Wallet connection~~ | ~~Connect Phantom/Solflare~~ ✅ |
| ~~Key derivation~~ | ~~Derive controller + encryption keys from wallet signatures~~ ✅ |
| ~~Anchor program~~ | ~~Create deals and submit offers on-chain~~ ✅ |
| ~~Supabase client~~ | ~~Read deals/offers from database~~ ✅ |
| ~~Decryption utils~~ | ~~Decrypt user's own data from Supabase~~ ✅ |
| ~~Data hooks~~ | ~~Replace mock data with live Supabase queries~~ ✅ |
| Create deal hook | Send create_deal transaction |
| Submit offer hook | Send submit_offer transaction |
| Wire up | Connect hooks to UI components |

---

## Implementation Phases

### Phase 1: Dependencies & Wallet Connection ✅ COMPLETE
**Effort: Small**

1. **Install dependencies** in `frontend/package.json`:
   ```json
   {
     "@solana/web3.js": "^1.95.4",
     "@solana/wallet-adapter-base": "^0.9.23",
     "@solana/wallet-adapter-react": "^0.15.39",
     "@solana/wallet-adapter-react-ui": "^0.9.39",
     "@solana/wallet-adapter-wallets": "^0.19.37",
     "@supabase/supabase-js": "^2.90.0",
     "@noble/hashes": "^1.7.1",
     "@noble/curves": "^1.9.5",
     "bs58": "^5.0.0"
   }
   ```

   > **Note:** `@coral-xyz/anchor`, `@arcium-hq/client`, and `@solana/spl-token` are
   > already in root `package.json` and will be hoisted. The noble packages must stay
   > on v1.x (not v2.x) for compatibility with `@arcium-hq/client@0.5.4`.

2. **Create `_providers/SolanaProvider.tsx`**:
   - ConnectionProvider with RPC endpoint
   - WalletProvider with Phantom + Solflare adapters
   - WalletModalProvider for connection UI

3. **Create `_components/WalletButton.tsx`**:
   - Wrapper around WalletMultiButton
   - Custom styling to match design system

4. **Update `Navbar.tsx`**:
   - Replace placeholder with real WalletButton

5. **Add CSS overrides** in `globals.css`:
   - Style wallet adapter modal to match dark theme

6. **Create `app/otc/layout.tsx`**:
   - Wrap page with SolanaProvider

**Files to create:**
- `_providers/SolanaProvider.tsx`
- `_components/WalletButton.tsx`
- `app/otc/layout.tsx`

**Files to modify:**
- `frontend/package.json`
- `app/globals.css`
- `_components/Navbar.tsx`

---

### Phase 2: Key Derivation System ✅ COMPLETE
**Effort: Small**

1. **Create `_lib/encryption.ts`**:
   - `deriveKeys()` - derive controller + encryption keypairs from wallet signatures
   - `createCipher()` - create RescueCipher for encryption/decryption
   - `encryptDealInput()` - encrypt amount + price for deal creation
   - `encryptOfferInput()` - encrypt price + amount for offer submission
   - `toX64Price()` / `fromX64Price()` - X64.64 fixed-point conversion

2. **Create `_hooks/useDerivedKeys.ts`**:
   - State for derived keys
   - `deriveKeysFromWallet()` - prompts wallet to sign messages
   - `clearKeys()` - clears on disconnect
   - Auto-clear on wallet disconnect

3. **Create `_providers/DerivedKeysProvider.tsx`**:
   - Context wrapper for key state
   - Makes derived keys available to all components

**Files to create:**
- `_lib/encryption.ts`
- `_hooks/useDerivedKeys.ts`
- `_providers/DerivedKeysProvider.tsx`

---

### Phase 3: OTC Program Integration ✅ COMPLETE
**Effort: Medium**

1. **Update `_lib/constants.ts`**:
   - Add `OTC_PROGRAM_ID`
   - Add `CLUSTER_OFFSET`
   - Add `CIPHERTEXT_OFFSET`, `CIPHERTEXT_SIZE`
   - Add `COMP_DEF_NAMES` for computation definitions

2. **Create `_lib/accounts.ts`**:
   - `getDealAddress()` - derive deal PDA
   - `getOfferAddress()` - derive offer PDA

3. **Copy IDL files**:
   - Copy `target/idl/otc.json` to `_lib/idl/otc.json`
   - Create `_lib/idl/otc.ts` for type re-exports

4. **Create `_providers/OtcProvider.tsx`**:
   - Create Anchor Program instance
   - Fetch MXE public key with retry logic (10 attempts, 1s delay)
   - Provide Arcium account address helpers
   - Exports: `useOtc()`, `useOtcProgram()`, `useMxePublicKey()`

5. **Update `.env.local`**:
   - Add `NEXT_PUBLIC_OTC_PROGRAM_ID`
   - Add `NEXT_PUBLIC_CLUSTER_OFFSET`

**Files created:**
- `_lib/accounts.ts`
- `_lib/idl/otc.json`
- `_lib/idl/otc.ts`
- `_providers/OtcProvider.tsx`

**Files modified:**
- `_lib/constants.ts`
- `.env.local`
- `app/otc/layout.tsx` (added OtcProvider to hierarchy)

---

### Phase 3.5: Supabase Integration ✅ COMPLETE
**Effort: Small**

**Key Discovery:** The shared `@otc/supabase` package (in `packages/supabase/`) already provides everything needed:
- `createAnonClient()` - frontend-safe client using `NEXT_PUBLIC_*` env vars
- `TypedSupabaseClient` - fully typed Supabase client
- Generated types: `DealRow`, `OfferRow`, `DealStatus`, `OfferStatus`
- Local dev defaults (falls back to `http://127.0.0.1:54321`)

**No need to create `_lib/supabase.ts` or `_lib/database.types.ts`** - just import from `@otc/supabase`.

1. **Create `_providers/SupabaseProvider.tsx`**: ✅
   - Uses `createAnonClient()` from `@otc/supabase`
   - Context wrapper with `useSupabase()` hook
   - Client created once via `useMemo` (stable reference)

2. **Update `app/otc/layout.tsx`**: ✅
   - Added SupabaseProvider to hierarchy
   - Order: SolanaProvider → SupabaseProvider → OtcProvider → DerivedKeysProvider

3. **Add environment variables** to `.env.local`: ✅
   ```
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
   ```

**Files created:**
- `_providers/SupabaseProvider.tsx`

**Files modified:**
- `.env.local`
- `app/otc/layout.tsx`

---

### Phase 4: Deal Creation Hook
**Effort: Medium**

1. **Create `_hooks/useCreateDeal.ts`**:
   - Takes: baseMint, quoteMint, amount, price, expiresAt, allowPartial
   - Encrypts amount + price with RescueCipher
   - Generates ephemeral create_key
   - Builds and sends Anchor transaction
   - Returns: dealAddress, signature

2. **Modify `_components/CreateDealForm.tsx`**:
   - Import `useCreateDeal`, `useDerivedKeys`, `useWallet`
   - Handle key derivation flow (sign → derive → submit)
   - Show loading/error states
   - Call real `createDeal()` on submit

**Files to create:**
- `_hooks/useCreateDeal.ts`

**Files to modify:**
- `_components/CreateDealForm.tsx`

---

### Phase 5: Offer Submission Hook
**Effort: Medium**

1. **Create `_hooks/useSubmitOffer.ts`**:
   - Takes: dealAddress, price, amount
   - Encrypts price + amount with RescueCipher
   - Generates ephemeral create_key
   - Builds and sends Anchor transaction
   - Returns: offerAddress, signature

2. **Modify `_components/MakeOfferForm.tsx`**:
   - Import `useSubmitOffer`, `useDerivedKeys`, `useWallet`
   - Handle key derivation flow
   - Show loading/error states
   - Call real `submitOffer()` on submit

**Files to create:**
- `_hooks/useSubmitOffer.ts`

**Files to modify:**
- `_components/MakeOfferForm.tsx`

---

### Phase 6: Data Reading Hooks (Supabase) ✅ COMPLETE
**Effort: Medium-Large**

#### Type Imports

All database types come from `@otc/supabase`:

```typescript
import type {
  DealRow,
  OfferRow,
  DealStatus,
  OfferStatus,
} from "@otc/supabase";
```

#### Database Field Mappings (snake_case → camelCase)

| Database Field | Frontend Type Field |
|---------------|---------------------|
| `base_mint` | `baseMint` |
| `quote_mint` | `quoteMint` |
| `allow_partial` | `allowPartial` |
| `encryption_key` | `encryptionKey` |
| `created_at` | `createdAt` |
| `expires_at` | `expiresAt` |
| `deal_address` | `dealAddress` |
| `offer_index` | `offerIndex` |
| `submitted_at` | `submittedAt` |

#### Implementation Steps

1. **Create `_lib/decryption.ts`**: ✅
   - `hexToBytes()` / `bytesToHex()` - encoding helpers
   - `isOwnedByUser()` - check if encryption_key matches user's pubkey
   - `decryptDealData()` - decrypt amount + price from deal
   - `decryptOfferData()` - decrypt price + amount from offer
   - ~~`decryptDealSettlement()` - decrypt settlement data~~ (deferred - not needed for open deals)
   - ~~`decryptOfferSettlement()` - decrypt outcome + executed amount~~ (deferred - not needed for open deals)

2. **Create `_hooks/useMarketDeals.ts`**: ✅
   - Fetch all open deals from Supabase (public fields only)
   - ~~Subscribe to Realtime for INSERT/UPDATE events~~ (TODO - deferred)
   - No decryption needed
   - Returns: `{ marketDeals, isLoading, error, refetch }`

3. **Create `_hooks/useMyDeals.ts`**: ✅
   - Fetch deals WHERE `encryption_key === user's pubkey`
   - Decrypt amount + price for each
   - ~~Subscribe to Realtime for updates~~ (TODO - deferred)
   - Returns: `{ deals, isLoading, error, refetch }`

4. **Create `_hooks/useMyOffers.ts`**: ✅
   - Fetch offers with deal join from Supabase
   - Filter by `encryption_key === user's pubkey`
   - Decrypt price + amount for each
   - ~~Subscribe to Realtime for updates~~ (TODO - deferred)
   - Returns: `{ offers, isLoading, error, refetch }`

5. ~~**Create `_hooks/useOffersForDeal.ts`**~~: (deferred - can add when needed)
   - Count offers for a specific deal
   - Subscribe to Realtime for new offers
   - Returns: `{ offerCount, isLoading }`

**Files created:**
- `_lib/decryption.ts` ✅
- `_hooks/useMarketDeals.ts` ✅
- `_hooks/useMyDeals.ts` ✅
- `_hooks/useMyOffers.ts` ✅

**Deferred:**
- `_hooks/useOffersForDeal.ts` - not needed yet
- Supabase Realtime subscriptions - TODO in hooks
- Settlement decryption - only needed for deal completion screen

**Documentation:**
- `vibes/frontend/007-encrypted-data-flow.md` - explains ciphertexts vs settlement_ciphertexts

---

### Phase 7: Wire Up Data Flow
**Effort: Small**

1. **Provider hierarchy already complete** ✅:
   ```
   SolanaProvider
     └── SupabaseProvider
           └── OtcProvider
                 └── DerivedKeysProvider
                       └── children
   ```

2. **Update `page.tsx`**:
   - Replace `useState` with hooks:
     - `MOCK_DEALS` → `useMyDeals()`
     - `MOCK_MARKET_DEALS` → `useMarketDeals()`
     - `MOCK_OFFERS` → `useMyOffers()`
   - Add loading states
   - Remove mock data imports

3. **Update table components**:
   - Add loading skeleton UI
   - Handle empty states

**Files to modify:**
- `app/otc/layout.tsx`
- `app/otc/page.tsx`
- `_components/DealsTable.tsx`
- `_components/MarketTable.tsx`
- `_components/OffersTable.tsx`

---

### Phase 8: Error Handling & UX Polish
**Effort: Small**

1. **Create `_components/TransactionStatus.tsx`**:
   - Toast-style notifications for tx status
   - Pending → Confirmed → Error states

2. **Create `_components/KeyDerivationPrompt.tsx`**:
   - Explains what the user is signing
   - Sign / Cancel buttons

3. **Update form components**:
   - Better error messages
   - Disable buttons during loading
   - Success feedback

**Files to create:**
- `_components/TransactionStatus.tsx`
- `_components/KeyDerivationPrompt.tsx`

**Files to modify:**
- `_components/CreateDealForm.tsx`
- `_components/MakeOfferForm.tsx`

---

## File Summary

### Files Created (Phases 1-3.5, 6)

**Providers (4):** ✅
- `_providers/SolanaProvider.tsx` ✅
- `_providers/OtcProvider.tsx` ✅
- `_providers/DerivedKeysProvider.tsx` ✅
- `_providers/SupabaseProvider.tsx` ✅

**Hooks (4):** ✅
- `_hooks/useDerivedKeys.ts` ✅
- `_hooks/useMarketDeals.ts` ✅
- `_hooks/useMyDeals.ts` ✅
- `_hooks/useMyOffers.ts` ✅

**Utilities (3):** ✅
- `_lib/encryption.ts` ✅
- `_lib/accounts.ts` ✅
- `_lib/decryption.ts` ✅

**IDL (2):** ✅
- `_lib/idl/otc.json` ✅
- `_lib/idl/otc.ts` ✅

**Components (1):** ✅
- `_components/WalletButton.tsx` ✅

### Files Still to Create

**Hooks (2):**
- `_hooks/useCreateDeal.ts`
- `_hooks/useSubmitOffer.ts`

**Components (1):**
- `_components/TransactionStatus.tsx`

**Deferred (not needed yet):**
- `_hooks/useOffersForDeal.ts` - offer counting per deal

> **Note:** `_lib/supabase.ts` and `_lib/database.types.ts` are NOT needed - use `@otc/supabase` package instead.

### Files Modified (Phases 1-3.5) ✅

- `frontend/package.json` - added dependencies ✅
- `app/globals.css` - wallet adapter styles ✅
- `app/otc/layout.tsx` - added providers (Solana, Supabase, OTC, DerivedKeys) ✅
- `_lib/constants.ts` - added program constants ✅
- `_components/Navbar.tsx` - added WalletButton ✅
- `.env.local` - added program ID, cluster offset, Supabase URL/key ✅

### Files Still to Modify

- `app/otc/page.tsx` - wire up hooks
- `_components/CreateDealForm.tsx` - wire up useCreateDeal
- `_components/MakeOfferForm.tsx` - wire up useSubmitOffer
- `_components/DealsTable.tsx` - loading states
- `_components/MarketTable.tsx` - loading states
- `_components/OffersTable.tsx` - loading states

---

## Implementation Order

```
Phase 1: Dependencies & Wallet ✅ ──┐
                                    ├──► Phase 2: Key Derivation ✅ ──┐
Phase 3.5: Supabase Setup ✅ ───────┤                                 │
                                    │                                 │
Phase 3: OTC Program ✅ ────────────┴─────────────────────────────────┤
                                                                      │
                                 ┌────────────────────────────────────┘
                                 │
                                 ├──► Phase 4: Create Deal
                                 │
                                 ├──► Phase 5: Submit Offer
                                 │
                                 └──► Phase 6: Data Hooks ✅
                                              │
                                              ▼
                                      Phase 7: Wire Up
                                              │
                                              ▼
                                      Phase 8: UX Polish
```

**Recommended execution:**
1. ~~Do Phase 1 + 3.5 + 3 together (infrastructure)~~ ✅
2. ~~Do Phase 2 (key derivation)~~ ✅
3. ~~Do Phase 6 (data hooks)~~ ✅
4. Do Phase 4 + 5 (mutations)
5. Do Phase 7 (wire up)
6. Do Phase 8 (polish)

---

## Environment Setup

### Local Development

```bash
# Terminal 1: Supabase
cd supabase && supabase start

# Terminal 2: Solana + Arcium (for testing mutations)
./kill-validator.sh && arcium test --skip-test

# Terminal 3: Indexer
yarn workspace @otc/indexer start

# Terminal 4: Frontend (user runs this themselves)
# yarn dev
```

### Environment Variables

Create `frontend/.env.local`:
```bash
# Solana
NEXT_PUBLIC_RPC_URL=http://localhost:8899
NEXT_PUBLIC_OTC_PROGRAM_ID=<from-arcium-build>

# Supabase (from `supabase status`)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

---

## Testing Checklist

### Phase 1: Wallet Connection ✅
- [x] Phantom wallet detected
- [x] Can connect wallet
- [x] Can disconnect wallet
- [x] Address shown in Navbar
- [x] Auto-reconnect on refresh

### Phase 2: Key Derivation ✅
- [x] Prompts for signature when needed
- [x] Signs both messages successfully
- [x] Keys persist during session
- [x] Keys clear on disconnect

### Phase 3: OTC Program ✅
- [x] Anchor program loads
- [x] MXE public key fetched (with retry)
- [x] Arcium account helpers work
- [x] No console errors

### Phase 3.5: Supabase ✅
- [x] SupabaseProvider created with `@otc/supabase`
- [x] `useSupabase()` hook available
- [ ] Supabase client connects (verify with dev server)
- [ ] No console errors

### Phase 6: Data Hooks ✅
- [x] `useMarketDeals` hook created
- [x] `useMyDeals` hook created with decryption
- [x] `useMyOffers` hook created with decryption
- [x] `decryption.ts` utilities created
- [ ] Market deals load from Supabase (needs testing with live data)
- [ ] User's deals load and decrypt (needs testing with live data)
- [ ] User's offers load and decrypt (needs testing with live data)
- [ ] Realtime updates work (TODO - deferred)

### Phase 4: Deal Creation
- [ ] Form validates inputs
- [ ] Transaction submits
- [ ] Deal appears in Supabase (via indexer)
- [ ] Deal appears in "Your Deals" tab

### Phase 5: Offer Submission
- [ ] Form validates inputs
- [ ] Transaction submits
- [ ] Offer appears in Supabase (via indexer)
- [ ] Offer appears in "Your Offers" tab

### Phase 7: Integration
- [ ] Full flow: connect → derive → create deal → submit offer
- [ ] All tables show live data
- [ ] Realtime updates visible

---

## Risk Areas

### 1. Version Constraints
The `@arcium-hq/client@0.5.4` package pins specific versions:
- `@noble/curves@^1.9.5` and `@noble/hashes@^1.7.1` - **must use v1.x, NOT v2.x**
- `@solana/web3.js@^1.95.4` - **must use v1.x, NOT v2.x**
- `@coral-xyz/anchor@0.32.1` - exact version

Using incompatible versions will cause runtime errors.

### 2. Arcium Client in Browser
The `@arcium-hq/client` package uses Node.js crypto. May need polyfills:
```javascript
// next.config.js
webpack: (config) => {
  config.resolve.fallback = { crypto: false };
  return config;
}
```

### 3. IDL Import
Anchor IDL is JSON. May need to:
- Add `"resolveJsonModule": true` to tsconfig
- Or import with `require()`

### 4. MXE Key Timing
MXE public key may not be available immediately on localnet. The OtcProvider has retry logic for this.

### 5. Supabase Realtime Permissions
RLS must allow SELECT for anon role. Verify with:
```sql
SELECT * FROM deals;  -- Should work with anon key
```

---

## Quick Reference

### Key Files from Plan Doc
- Data model: `vibes/datamodel/000-initial-draft.md`
- Integration plan: `vibes/frontend/004-solana-anchor-integration-plan.md`
- Token registry: `frontend/app/otc/_lib/tokens.ts`

### Key Dependencies
- Anchor: `@coral-xyz/anchor@0.32.1` (in root package.json)
- Arcium: `@arcium-hq/client@0.5.4` (in root package.json)
- Wallet: `@solana/wallet-adapter-react@^0.15.39`
- Supabase: `@otc/supabase` (shared package with types + client factories)
- Noble: `@noble/curves@^1.9.5`, `@noble/hashes@^1.7.1` (v1.x required by arcium)

### Command Quick Reference
```bash
# Build program (regenerates IDL)
arcium build

# Run indexer
yarn workspace @otc/indexer start

# Run cranker (for settlements)
yarn workspace @otc/cranker start
```

> **Note:** No need to generate Supabase types - they're already in `@otc/supabase` package.

---

## Next Steps

1. ~~**Start with Phase 1**: Install dependencies and set up wallet connection~~ ✅
2. ~~**Phase 2**: Key derivation system (encryption.ts, useDerivedKeys, DerivedKeysProvider)~~ ✅
3. ~~**Phase 3**: OTC Program integration (OtcProvider, accounts.ts, IDL)~~ ✅
4. ~~**Phase 3.5**: Supabase integration (SupabaseProvider using `@otc/supabase`)~~ ✅
5. **Phase 4**: Deal creation hook (useCreateDeal)
6. **Phase 5**: Offer submission hook (useSubmitOffer)
7. ~~**Phase 6**: Data reading hooks (useMarketDeals, useMyDeals, useMyOffers, decryption.ts)~~ ✅
8. **Phase 7-8**: Wire up data flow and UX polish

Phases 1-3.5 and 6 complete. Ready for Phase 4 (Deal Creation) or Phase 7 (Wire Up).

**Phase 6 deferred items:**
- Supabase Realtime subscriptions (TODO in hooks)
- `useOffersForDeal` hook (not needed yet)
- Settlement decryption (only for deal completion screen)
