# Phase 7: Data Flow Implementation

## Overview

This document outlines the implementation plan for Phase 7 - replacing mock data with real Supabase data and completing the frontend integration.

---

## Mock Data Toggle

To support development without a running backend, we use an environment variable to toggle between mock and real data.

### Environment Variable

```bash
# .env.local
NEXT_PUBLIC_USE_MOCK_DATA=true   # Use mock data (no Supabase needed)
NEXT_PUBLIC_USE_MOCK_DATA=false  # Use real Supabase data (default)
```

### Implementation Pattern

In `page.tsx`, we always call the real hooks (React rules of hooks require unconditional calls), but choose which data to use based on the flag:

```typescript
import { MOCK_DEALS, MOCK_MARKET_DEALS, MOCK_OFFERS } from "./_lib/constants";
import { useMyDeals } from "./_hooks/useMyDeals";
import { useMyOffers } from "./_hooks/useMyOffers";
import { useMarketDeals } from "./_hooks/useMarketDeals";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

function OTCPageContent() {
  // Always call hooks (React rules - can't be conditional)
  const realDeals = useMyDeals();
  const realMarket = useMarketDeals();
  const realOffers = useMyOffers();

  // Choose which data to use based on flag
  const deals = USE_MOCK ? MOCK_DEALS : realDeals.deals;
  const marketDeals = USE_MOCK ? MOCK_MARKET_DEALS : realMarket.marketDeals;
  const offers = USE_MOCK ? MOCK_OFFERS : realOffers.offers;

  // Loading/error states only apply in real mode
  const isLoading = USE_MOCK ? false : (realDeals.isLoading || realMarket.isLoading || realOffers.isLoading);
  const dealsError = USE_MOCK ? null : realDeals.error;
  const marketError = USE_MOCK ? null : realMarket.error;
  const offersError = USE_MOCK ? null : realOffers.error;

  // Refetch functions (no-op in mock mode)
  const refetchDeals = USE_MOCK ? () => {} : realDeals.refetch;
  const refetchMarket = USE_MOCK ? () => {} : realMarket.refetch;
  const refetchOffers = USE_MOCK ? () => {} : realOffers.refetch;

  // ... rest of component
}
```

### Why This Works

1. **React rules satisfied** - Hooks are always called unconditionally
2. **Real hooks are resilient** - They handle missing wallet/keys gracefully (return empty arrays, set loading to false)
3. **No Supabase errors in mock mode** - Even if Supabase isn't running, the hooks won't crash (they just return empty data which we ignore)
4. **Single source of truth** - The `USE_MOCK` flag controls everything in one place
5. **Easy to toggle** - Just change the env var and restart dev server

### Keeping Mock Data

The mock data in `_lib/constants.ts` is preserved. Don't delete `MOCK_DEALS`, `MOCK_MARKET_DEALS`, `MOCK_OFFERS` - they're still imported and used when `USE_MOCK=true`.

---

## Current State Analysis

### What's Already Done ✅

**Providers (all exist and wired correctly):**
| Provider | File | Status |
|----------|------|--------|
| `SolanaProvider` | `_providers/SolanaProvider.tsx` | ✅ Active |
| `SupabaseProvider` | `_providers/SupabaseProvider.tsx` | ✅ Active |
| `OtcProvider` | `_providers/OtcProvider.tsx` | ✅ Active |
| `DerivedKeysProvider` | `_providers/DerivedKeysProvider.tsx` | ✅ Active |

**Provider hierarchy in `layout.tsx`:**
```tsx
<SolanaProvider>
  <SupabaseProvider>
    <OtcProvider>
      <DerivedKeysProvider>
        {children}
      </DerivedKeysProvider>
    </OtcProvider>
  </SupabaseProvider>
</SolanaProvider>
```

**Hooks (all exist):**
| Hook | File | Integrated? |
|------|------|-------------|
| `useMyDeals` | `_hooks/useMyDeals.ts` | ❌ No |
| `useMyOffers` | `_hooks/useMyOffers.ts` | ❌ No |
| `useMarketDeals` | `_hooks/useMarketDeals.ts` | ❌ No |
| `useCreateDeal` | `_hooks/useCreateDeal.ts` | ✅ Yes (CreateDealForm) |
| `useSubmitOffer` | `_hooks/useSubmitOffer.ts` | ✅ Yes (MakeOfferForm) |
| `useDerivedKeys` | `_hooks/useDerivedKeys.ts` | ✅ Yes (via provider) |
| `useUrlState` | `_hooks/useUrlState.ts` | ✅ Yes (page.tsx) |

**Components using real hooks:**
- `CreateDealForm.tsx` - uses `useCreateDeal()`, `useDerivedKeysContext()`
- `MakeOfferForm.tsx` - uses `useSubmitOffer()`, `useDerivedKeysContext()`

### What Needs To Be Done

**Mock data still in use (in `page.tsx`):**
```typescript
// Lines 5, 22-24 in page.tsx
import { MOCK_DEALS, MOCK_MARKET_DEALS, MOCK_OFFERS } from "./_lib/constants";

const [deals, setDeals] = useState<Deal[]>(MOCK_DEALS);
const [marketDeals] = useState<MarketDeal[]>(MOCK_MARKET_DEALS);
const [offers] = useState<Offer[]>(MOCK_OFFERS);
```

**Components receiving mock data via props:**
- `DealsTable` - receives `deals` from page.tsx state
- `MarketTable` - receives `marketDeals` from page.tsx state
- `OffersTable` - receives `offers` from page.tsx state

---

## Implementation Tasks

### Task 7.1: Add Data Hooks with Mock Toggle

**File:** `frontend/app/otc/page.tsx`

**Changes:**

1. **Keep mock imports, add hook imports:**
```typescript
// KEEP these imports:
import { MOCK_DEALS, MOCK_MARKET_DEALS, MOCK_OFFERS } from "./_lib/constants";

// ADD these imports:
import { useMyDeals } from "./_hooks/useMyDeals";
import { useMyOffers } from "./_hooks/useMyOffers";
import { useMarketDeals } from "./_hooks/useMarketDeals";
```

2. **Add mock toggle flag:**
```typescript
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
```

3. **Replace useState with hooks + toggle pattern:**
```typescript
// OLD (delete):
const [deals, setDeals] = useState<Deal[]>(MOCK_DEALS);
const [marketDeals] = useState<MarketDeal[]>(MOCK_MARKET_DEALS);
const [offers] = useState<Offer[]>(MOCK_OFFERS);

// NEW - call hooks unconditionally (React rules):
const realDeals = useMyDeals();
const realMarket = useMarketDeals();
const realOffers = useMyOffers();

// Choose data source based on flag:
const deals = USE_MOCK ? MOCK_DEALS : realDeals.deals;
const marketDeals = USE_MOCK ? MOCK_MARKET_DEALS : realMarket.marketDeals;
const offers = USE_MOCK ? MOCK_OFFERS : realOffers.offers;
```

4. **Add conditional loading/error/refetch:**
```typescript
const dealsLoading = USE_MOCK ? false : realDeals.isLoading;
const marketLoading = USE_MOCK ? false : realMarket.isLoading;
const offersLoading = USE_MOCK ? false : realOffers.isLoading;

const dealsError = USE_MOCK ? null : realDeals.error;
const marketError = USE_MOCK ? null : realMarket.error;
const offersError = USE_MOCK ? null : realOffers.error;

const refetchDeals = USE_MOCK ? () => {} : realDeals.refetch;
const refetchMarket = USE_MOCK ? () => {} : realMarket.refetch;
const refetchOffers = USE_MOCK ? () => {} : realOffers.refetch;
```

---

### Task 7.2: Handle Wallet/Key States

The data hooks (`useMyDeals`, `useMyOffers`) require:
1. Wallet connected (from `SolanaProvider`)
2. Keys derived (from `DerivedKeysProvider`)
3. MXE public key loaded (from `OtcProvider`)

**In mock mode, skip these checks** (data is always available).

**Add state checks to page.tsx:**

```typescript
import { useWallet } from "@solana/wallet-adapter-react";
import { useDerivedKeysContext } from "./_providers/DerivedKeysProvider";
import { useMxePublicKey } from "./_providers/OtcProvider";

function OTCPageContent() {
  const { connected } = useWallet();
  const { hasDerivedKeys, deriveKeysFromWallet, isDerivingKeys } = useDerivedKeysContext();
  const mxePublicKey = useMxePublicKey();

  // In mock mode, always allow viewing data
  // In real mode, need wallet + keys for private data
  const canViewPrivateData = USE_MOCK || (connected && hasDerivedKeys && mxePublicKey);

  // Market tab is always available (public data only)
  const canViewMarket = true;

  // ...
}
```

**Conditional rendering per tab:**

```typescript
// In the tab content rendering:
// Note: canViewPrivateData is true in mock mode (USE_MOCK || ...)

{state.view === "deals" && (
  canViewPrivateData ? (
    <DealsTable deals={deals} onDealSelect={handleDealSelect} />
  ) : (
    <ConnectPrompt
      connected={connected}
      hasDerivedKeys={hasDerivedKeys}
      onDeriveKeys={deriveKeysFromWallet}
      isDerivingKeys={isDerivingKeys}
    />
  )
)}

{state.view === "offers" && (
  canViewPrivateData ? (
    <OffersTable offers={offers} />
  ) : (
    <ConnectPrompt {...} />
  )
)}

{state.view === "market" && (
  <MarketTable
    deals={marketDeals}
    filteredDeals={filteredMarketDeals}
    baseMintFilter={baseMintFilter}
    onFilterChange={setBaseMintFilter}
    onDealSelect={handleDealSelect}
  />
)}
```

---

### Task 7.3: Create ConnectPrompt Component

**File:** `frontend/app/otc/_components/ConnectPrompt.tsx`

A simple component to prompt users to connect wallet or derive keys.

```typescript
interface ConnectPromptProps {
  connected: boolean;
  hasDerivedKeys: boolean;
  onDeriveKeys: () => Promise<void>;
  isDerivingKeys: boolean;
}

export function ConnectPrompt({
  connected,
  hasDerivedKeys,
  onDeriveKeys,
  isDerivingKeys
}: ConnectPromptProps) {
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-[var(--muted)] mb-4">
          Connect your wallet to view your deals and offers
        </p>
        {/* WalletMultiButton is already in navbar */}
      </div>
    );
  }

  if (!hasDerivedKeys) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-[var(--muted)] mb-4">
          Sign with your wallet to derive encryption keys
        </p>
        <button
          onClick={onDeriveKeys}
          disabled={isDerivingKeys}
          className="px-4 py-2 bg-[var(--primary)] text-black rounded-lg font-medium"
        >
          {isDerivingKeys ? "Signing..." : "Derive Keys"}
        </button>
      </div>
    );
  }

  return null;
}
```

---

### Task 7.4: Add Loading States

**In page.tsx, show loading indicators:**

```typescript
// Add loading component
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="animate-spin h-8 w-8 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
    </div>
  );
}

// In tab content:
{state.view === "deals" && (
  dealsLoading ? (
    <LoadingSpinner />
  ) : canViewPrivateData ? (
    <DealsTable deals={deals} onDealSelect={handleDealSelect} />
  ) : (
    <ConnectPrompt {...} />
  )
)}
```

---

### Task 7.5: Add Error Handling

```typescript
function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-red-400 text-center">
        <p className="font-medium">Error loading data</p>
        <p className="text-sm text-[var(--muted)] mt-1">{message}</p>
      </div>
    </div>
  );
}

// In tab content:
{state.view === "deals" && (
  dealsError ? (
    <ErrorMessage message={dealsError} />
  ) : dealsLoading ? (
    <LoadingSpinner />
  ) : canViewPrivateData ? (
    <DealsTable deals={deals} onDealSelect={handleDealSelect} />
  ) : (
    <ConnectPrompt {...} />
  )
)}
```

---

### Task 7.6: Handle Empty States

The table components should handle empty arrays gracefully. Check if they already do, otherwise add:

```typescript
// In DealsTable.tsx
if (deals.length === 0) {
  return (
    <div className="flex items-center justify-center py-16 text-[var(--muted)]">
      No deals yet. Create your first deal!
    </div>
  );
}

// In OffersTable.tsx
if (offers.length === 0) {
  return (
    <div className="flex items-center justify-center py-16 text-[var(--muted)]">
      No offers yet. Browse the market to find deals!
    </div>
  );
}

// In MarketTable.tsx
if (filteredDeals.length === 0) {
  return (
    <div className="flex items-center justify-center py-16 text-[var(--muted)]">
      No open deals in the market
    </div>
  );
}
```

---

### Task 7.7: Add Realtime Subscriptions

Since the indexer may not immediately pick up on-chain changes, we rely on Supabase Realtime for live updates:

**In useMarketDeals.ts:**
```typescript
useEffect(() => {
  const channel = supabase
    .channel('market-deals')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'deals' },
      () => refetch()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [supabase, refetch]);
```

This ensures the UI stays in sync with on-chain state without relying on immediate indexer updates.

---

## Data Flow Summary

### After Implementation

```
┌─────────────────────────────────────────────────────────────────┐
│                         page.tsx                                 │
│                                                                  │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ useMyDeals()    │ │ useMarketDeals()│ │ useMyOffers()   │   │
│  │                 │ │                 │ │                 │   │
│  │ • Fetches from  │ │ • Fetches all   │ │ • Fetches from  │   │
│  │   Supabase      │ │   open deals    │ │   Supabase      │   │
│  │ • Filters by    │ │ • Public data   │ │ • Filters by    │   │
│  │   user's key    │ │   only          │ │   user's key    │   │
│  │ • Decrypts      │ │ • No decryption │ │ • Decrypts      │   │
│  │   amount/price  │ │                 │ │   amount/price  │   │
│  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘   │
│           │                   │                   │             │
│           ▼                   ▼                   ▼             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │  DealsTable     │ │  MarketTable    │ │  OffersTable    │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Hook Dependencies

```
useMyDeals() requires:
  ├── useSupabase() → SupabaseProvider
  ├── useDerivedKeysContext() → DerivedKeysProvider
  └── useMxePublicKey() → OtcProvider

useMyOffers() requires:
  ├── useSupabase() → SupabaseProvider
  ├── useDerivedKeysContext() → DerivedKeysProvider
  └── useMxePublicKey() → OtcProvider

useMarketDeals() requires:
  └── useSupabase() → SupabaseProvider (only)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `page.tsx` | Replace mock useState with hooks, add loading/error/empty states |
| `_components/ConnectPrompt.tsx` | Create new component |
| `_components/DealsTable.tsx` | Add empty state handling (if not present) |
| `_components/OffersTable.tsx` | Add empty state handling (if not present) |
| `_components/MarketTable.tsx` | Add empty state handling (if not present) |
| `_hooks/useMyDeals.ts` | Add realtime subscription |
| `_hooks/useMyOffers.ts` | Add realtime subscription |
| `_hooks/useMarketDeals.ts` | Add realtime subscription |

---

## Mock Data (Preserved)

The mock data in `_lib/constants.ts` is intentionally kept for development:

| Export | Purpose |
|--------|---------|
| `MOCK_DEALS` | User's deals with decrypted amounts/prices |
| `MOCK_MARKET_DEALS` | Public market deals (no prices) |
| `MOCK_OFFERS` | User's submitted offers |

To use mock data, set `NEXT_PUBLIC_USE_MOCK_DATA=true` in `.env.local`.

---

## Testing Checklist

### Mock Mode (`NEXT_PUBLIC_USE_MOCK_DATA=true`)
- [ ] All tabs show mock data immediately (no loading)
- [ ] No Supabase/wallet errors in console
- [ ] Create deal form works (submits to chain, doesn't affect mock display)
- [ ] UI is fully functional for development

### Real Mode (`NEXT_PUBLIC_USE_MOCK_DATA=false`)
- [ ] Wallet not connected → shows connect prompt on Deals/Offers tabs
- [ ] Wallet connected but keys not derived → shows derive keys prompt
- [ ] Keys derived → fetches and displays real data
- [ ] Market tab → works without wallet (public data)
- [ ] Empty state → shows appropriate message
- [ ] Loading state → shows spinner
- [ ] Error state → shows error message
- [ ] Create deal → realtime subscription updates deals table (may have delay)
- [ ] Submit offer → realtime subscription updates offers table (may have delay)
- [ ] Deal details view → works with real data

---

## Environment Requirements

```bash
# .env.local

# Mock mode (no backend needed)
NEXT_PUBLIC_USE_MOCK_DATA=true

# Real mode (requires Supabase + Solana)
NEXT_PUBLIC_USE_MOCK_DATA=false  # or just omit this line
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8899
```

The Supabase hooks fall back to local defaults if env vars not set. Mock mode skips all real data fetching.

---

## Implementation Order

1. **Task 7.1** - Replace mock data with hooks (core change)
2. **Task 7.3** - Create ConnectPrompt component
3. **Task 7.2** - Add wallet/key state checks
4. **Task 7.4** - Add loading states
5. **Task 7.5** - Add error handling
6. **Task 7.6** - Add empty states to tables
7. **Task 7.7** - Add realtime subscriptions

---

## Notes

- The infrastructure is complete - this is mostly wiring
- All encryption/decryption logic is already in the hooks
- Provider hierarchy is already correct in layout.tsx
- Table components are purely presentational - just need correct data
