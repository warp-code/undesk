# Denormalize Deal Mints onto Offers Table

## Problem

The `offers` table references `deals` via `deal_address`, but there's no foreign key constraint (intentionally, to handle out-of-order event indexing). This prevents Supabase from doing automatic joins.

Currently, `useMyOffers.ts` must perform **two queries**:
1. Fetch offers by user's encryption key
2. Fetch deals to get `base_mint` and `quote_mint`

This adds latency and complexity.

## Solution

Denormalize `base_mint` and `quote_mint` from `deals` onto the `offers` table. These values never change after deal creation, so there's no consistency risk.

---

## Files to Change

| File | Change Type | Priority |
|------|-------------|----------|
| `supabase/migrations/` | New migration | HIGH |
| `packages/supabase/src/generated.ts` | Auto-regenerate | AUTO |
| `packages/indexer/src/storage/supabase.ts` | Add mints to insert | HIGH |
| `frontend/app/otc/_hooks/useMyOffers.ts` | Simplify query | HIGH |

### No Changes Required
- `packages/indexer/src/types.ts` - Event types unchanged
- `packages/indexer/src/handler.ts` - Handler logic unchanged
- `packages/cranker/src/queries.ts` - Doesn't query mints
- `frontend/app/otc/_lib/types.ts` - Already has `baseMint`/`quoteMint`

---

## 1. Database Migration

Create `supabase/migrations/20260127000000_denormalize_offer_mints.sql`:

```sql
-- Add denormalized mint columns to offers table
ALTER TABLE offers
  ADD COLUMN base_mint TEXT,
  ADD COLUMN quote_mint TEXT;

-- Backfill existing offers from deals
UPDATE offers
SET
  base_mint = deals.base_mint,
  quote_mint = deals.quote_mint
FROM deals
WHERE offers.deal_address = deals.address;

-- Now make columns NOT NULL
ALTER TABLE offers
  ALTER COLUMN base_mint SET NOT NULL,
  ALTER COLUMN quote_mint SET NOT NULL;

-- Add index for potential filtering by mint
CREATE INDEX idx_offers_mints ON offers(base_mint, quote_mint);

-- Documentation
COMMENT ON COLUMN offers.base_mint IS 'Denormalized from deals.base_mint at indexing time';
COMMENT ON COLUMN offers.quote_mint IS 'Denormalized from deals.quote_mint at indexing time';
```

After applying:
```bash
yarn db:types
```

---

## 2. Indexer Changes

**File:** `packages/indexer/src/storage/supabase.ts`

In `upsertOfferCreated()`, fetch deal mints before inserting:

```typescript
async upsertOfferCreated(
  event: EventWithContext<OfferCreatedData>
): Promise<void> {
  const data = event.data;
  const address = pubkeyToBase58(data.offer);
  const dealAddress = pubkeyToBase58(data.deal);
  const slot = event.context.slot;

  // Fetch deal to get base_mint and quote_mint
  const { data: dealData, error: dealError } = await this.client
    .from("deals")
    .select("base_mint, quote_mint")
    .eq("address", dealAddress)
    .single();

  if (dealError || !dealData) {
    this.logger.error("Deal not found when indexing offer", {
      offerAddress: address,
      dealAddress,
      error: dealError?.message,
    });
    throw new Error(`Deal not found for offer: ${dealAddress}`);
  }

  const insert: OfferInsert = {
    address,
    deal_address: dealAddress,
    base_mint: dealData.base_mint,      // NEW
    quote_mint: dealData.quote_mint,    // NEW
    offer_index: data.offer_index,
    // ... rest unchanged
  };

  // ... rest of upsert logic
}
```

### Edge Case: Out-of-Order Events

If `OfferCreated` arrives before `DealCreated`:
- The deal won't exist in the database yet
- Current approach: fail with error, rely on retry/backfill
- Events from the same transaction should arrive together in practice

---

## 3. Frontend Changes

**File:** `frontend/app/otc/_hooks/useMyOffers.ts`

Simplify from two queries to one:

```typescript
// Before: Two queries
const { data: offersData } = await supabase
  .from("offers")
  .select("address, deal_address, ciphertexts, nonce, submitted_at, status")
  .eq("encryption_key", userPubKeyHex);

const dealAddresses = [...new Set(offersData.map((o) => o.deal_address))];
const { data: dealsData } = await supabase
  .from("deals")
  .select("address, base_mint, quote_mint, status")
  .in("address", dealAddresses);

const dealsMap = new Map(dealsData.map((d) => [d.address, d]));

// After: Single query
const { data: offersData } = await supabase
  .from("offers")
  .select("address, base_mint, quote_mint, ciphertexts, nonce, submitted_at, status")
  .eq("encryption_key", userPubKeyHex);

// Use directly: row.base_mint, row.quote_mint
```

**Note:** We still need `deal_address` for the `dealStatus` field. Options:
1. Also denormalize `deal_status` (but this changes over time)
2. Keep fetching deals just for status
3. Subscribe to deal status changes via realtime

For now, keep fetching deals for status, but remove the mint lookup.

---

## 4. Deployment Order

1. **Apply migration** - Adds columns, backfills existing data
2. **Regenerate types** - `yarn db:types`
3. **Deploy indexer** - Now writes mints on offer creation
4. **Deploy frontend** - Uses denormalized mints

---

## 5. Testing Checklist

- [ ] Migration applies cleanly on local Supabase
- [ ] Existing offers have mints populated (backfill worked)
- [ ] New offers get mints written by indexer
- [ ] Frontend fetches offers with mints in single query
- [ ] OffersTable displays correct token pairs
- [ ] `yarn db:types` produces correct types

---

## 6. Future Consideration

If we also want to avoid fetching deals for `dealStatus`:
- Add `deal_status` to offers table
- Update it when deal status changes (via trigger or indexer)
- More complex due to status being mutable

For now, fetching deal status separately is acceptable since it's a small query.
