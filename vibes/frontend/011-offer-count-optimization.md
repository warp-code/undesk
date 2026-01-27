# Offer Count Optimization

## Current Implementation

In `useMarketDeals.ts`, we fetch offer counts by:
1. Fetching all open deals
2. Fetching all offers for those deals
3. Counting offers per deal client-side

```typescript
const { data: offersData } = await supabase
  .from("offers")
  .select("deal_address")
  .in("deal_address", dealAddresses);

// Count offers per deal
for (const offer of offersData ?? []) {
  offerCountMap[offer.deal_address] =
    (offerCountMap[offer.deal_address] || 0) + 1;
}
```

## Problem

This approach doesn't scale well:
- Fetches all offer rows just to count them
- Client-side counting is inefficient
- Each realtime update triggers a full refetch of all offers

## Recommended Optimizations

### Option 1: Database View with Aggregation

Create a Postgres view that pre-aggregates offer counts:

```sql
CREATE VIEW deals_with_offer_count AS
SELECT
  d.*,
  COUNT(o.address) as offer_count
FROM deals d
LEFT JOIN offers o ON o.deal_address = d.address
GROUP BY d.address;
```

Then query the view directly from Supabase.

### Option 2: Supabase RPC Function

Create a Postgres function that returns deals with counts:

```sql
CREATE OR REPLACE FUNCTION get_open_deals_with_offer_count()
RETURNS TABLE (
  address text,
  base_mint text,
  quote_mint text,
  allow_partial boolean,
  expires_at timestamptz,
  created_at timestamptz,
  status text,
  offer_count bigint
) AS $$
  SELECT
    d.address,
    d.base_mint,
    d.quote_mint,
    d.allow_partial,
    d.expires_at,
    d.created_at,
    d.status,
    COUNT(o.address)::bigint as offer_count
  FROM deals d
  LEFT JOIN offers o ON o.deal_address = d.address
  WHERE d.status = 'open'
  GROUP BY d.address
  ORDER BY d.created_at DESC;
$$ LANGUAGE sql;
```

Call via `supabase.rpc('get_open_deals_with_offer_count')`.

### Option 3: Denormalized Counter

Add an `offer_count` column to the `deals` table and update it via database triggers when offers are inserted/deleted.

```sql
ALTER TABLE deals ADD COLUMN offer_count integer DEFAULT 0;

CREATE OR REPLACE FUNCTION update_deal_offer_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE deals SET offer_count = offer_count + 1 WHERE address = NEW.deal_address;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE deals SET offer_count = offer_count - 1 WHERE address = OLD.deal_address;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER offers_count_trigger
AFTER INSERT OR DELETE ON offers
FOR EACH ROW EXECUTE FUNCTION update_deal_offer_count();
```

This is the most performant option for read-heavy workloads.

## Priority

Medium - Current implementation works but will degrade with scale. Should be addressed before production launch with significant user volume.
