# Private OTC Trading System — Data Structures

## Overview

This document describes the encrypted state required for a privacy-preserving OTC trading desk built on Solana + Arcium. All private fields are encrypted and only accessible to authorized parties or computed within MPC.

**Platform notes:**
- All amounts are `u64` (SPL token max supply)
- Addresses are Solana `pubkey`
- Arcium handles MPC computation with async callbacks

**Terminology:**
- A **pair** consists of `base_mint` and `quote_mint` (e.g., META/USDC)
- `base_mint` = the token being bought or sold
- `quote_mint` = the token used for pricing and payment
- `price` = quote per unit of base (e.g., 444 USDC per META)
- `BUY` = creator buys base, pays quote
- `SELL` = creator sells base, receives quote

---

## Visibility Levels

| Level | Description |
|-------|-------------|
| `public` | Visible to anyone querying the system |
| `creator` | Visible only to the deal creator |
| `offeror` | Visible only to the offer submitter |
| `system` | Only accessible within MPC computation |

---

## Core Entities

### Deal

Created when a user requests a quote.

```
Deal {
  // Public (for discoverability)
  id:             string        [public]
  base_mint:      pubkey        [public]     // token being bought/sold
  quote_mint:     pubkey        [public]     // token used for pricing/payment
  side:           enum          [public]     // BUY or SELL (base asset)
  expires_at:     timestamp     [public]
  is_partial:     bool          [public]     // flips true on first valid offer
  status:         enum          [public]     // OPEN, EXECUTED, EXPIRED
  
  // Creator-only
  creator:        pubkey        [creator]
  allow_partial:  bool          [creator]    // if true, execute partial fills at expiry
  amount:         u64           [creator]    // amount of base asset
  price:          u64           [creator]    // price threshold per unit
  total:          u64           [creator]    // computed: amount × price
  created_at:     timestamp     [creator]
  
  // System-only (for MPC computations)
  fill_amount:    u64           [system]     // sum of passing offer amounts
  num_offers:     u32           [system]     // counter, incremented on each offer submission
}
```

**Notes:**
- `is_partial` is the only fill signal exposed publicly — prevents amount inference
- `price` is the threshold: for BUY deals, offers ≤ price pass; for SELL deals, offers ≥ price pass
- `num_offers` is a counter incremented atomically on each offer submission; offer IDs are derived as `deal_id + "_" + index`

---

### Offer

Submitted by market makers against a deal. Offer IDs are derived as `deal_id + "_" + offer_index`.

```
Offer {
  // Derived identifier (not stored, computed as deal_id + "_" + offer_index)
  deal_id:        string        [system]     // which deal this targets
  offer_index:    u32           [system]     // assigned atomically on submission (FIFO sequence)
  
  // Offeror-only
  offeror:        pubkey        [offeror]
  price:          u64           [offeror]    // offeror's price per unit
  amount:         u64           [offeror]    // amount willing to fill
  submitted_at:   timestamp     [offeror]
  
  // System-only (computed, revealed after deal concludes)
  passed:         bool          [system]     // did price meet threshold?
  executed_amt:   u64           [system]     // actual amount executed (may be < amount if last in FIFO)
}
```

**Notes:**
- `passed` is computed as: `(deal.side == BUY && offer.price <= deal.price) || (deal.side == SELL && offer.price >= deal.price)`
- `outcome` is not stored — it's derived at settlement from `executed_amt`:
  - `executed_amt == amount` → PASSED
  - `executed_amt > 0` → PARTIAL
  - `executed_amt == 0` → FAILED
- Offeror never learns deal's actual price — only whether they passed

---

## Escrow Model

Funds are locked on submission, released on resolution.

### On Deal Creation
```
Creator locks:
  - If side == BUY:  lock `total` of quote asset (e.g., USDC)
  - If side == SELL: lock `amount` of base asset (e.g., META)
```

### On Offer Submission
```
Offeror locks:
  - If deal.side == BUY:  lock `offer.amount` of base asset (selling to creator)
  - If deal.side == SELL: lock `offer.amount × offer.price` of quote asset (buying from creator)
```

### On Execution
```
For each passing offer (FIFO until deal filled):
  - Transfer base asset:  offeror → creator (for BUY) or creator → offeror (for SELL)
  - Transfer quote asset: creator → offeror (for BUY) or offeror → creator (for SELL)
  - Price used is always creator's price (offeror gets better-or-equal)
  - If last offer partially filled: only transfer pro-rata amounts

Refunds:
  - Passing offerors: refund any excess locked (if partial fill)
  - Failed offerors: full refund of locked funds
  - Creator: refund unused portion (if partial execution)
```

### On Expiry (no execution)
```
If !allow_partial OR fill_amount == 0:
  - Creator: full refund
  - All offerors: full refund
```

---

## State Transitions

```
Deal Lifecycle:
  OPEN → EXECUTED    (auto when fill_amount >= amount)
  OPEN → EXECUTED    (at expiry, if allow_partial && fill_amount > 0)
  OPEN → EXPIRED     (at expiry, if !allow_partial OR fill_amount == 0)

Offer Lifecycle:
  PENDING → PASSED   (deal executed, offer met threshold, fully filled)
  PENDING → PARTIAL  (deal executed, offer met threshold, last in FIFO queue, partially filled)
  PENDING → FAILED   (deal concluded, offer didn't pass threshold OR FIFO queue didn't reach it)
```

**Key rules:**
- No cancellation by anyone — deals and offers are immutable once submitted
- Fill order is FIFO among passing offers
- Last offer in queue can be partially filled if it exceeds remaining deal capacity
- Deals auto-execute the moment `fill_amount >= amount`
- At expiry: if `allow_partial` is true and there are any valid fills, execute with what's available

---

## Privacy Guarantees

1. **Creator identity**: Never revealed to offerors, even post-execution
2. **Offeror identity**: Never revealed to creator or other offerors, even post-execution
3. **Deal price**: Never revealed to offerors (they only learn pass/fail)
4. **Offer prices**: Never revealed to creator (they only see aggregate fill status)
5. **Fill amounts**: Only `is_partial` bool is public; exact amounts stay private to respective parties

---

## Events & Indexing

Given deals are short-lived (max 48 hours), the total event volume remains small enough for clients to brute-force decrypt all events. This eliminates the need for tagging schemes or client-side state.

### Events

Emitted by the MPC and picked up by an external indexer.

```
DealCreated {
  deal_id:        string        [public]
  base_mint:      pubkey        [public]
  quote_mint:     pubkey        [public]
  side:           enum          [public]     // BUY or SELL
  expires_at:     timestamp     [public]
  allow_partial:  bool          [public]
  encrypted_blob: bytes         [public]     // encrypted to creator's pubkey
}

OfferCreated {
  deal_id:        string        [public]
  offer_index:    u32           [public]     // authoritative FIFO sequence, assigned atomically in MPC
  encrypted_blob: bytes         [public]     // encrypted to offeror's pubkey
}

DealSettled {
  deal_id:        string        [public]
  status:         enum          [public]     // EXECUTED or EXPIRED
  settled_at:     timestamp     [public]
  encrypted_blob: bytes         [public]     // encrypted to creator's pubkey
}

DealPartiallyFilled {
  deal_id:        string        [public]     // emitted once, when first valid offer lands
}

OfferSettled {
  deal_id:        string        [public]
  offer_index:    u32           [public]
  encrypted_blob: bytes         [public]     // encrypted to offeror's pubkey
}
```

### Encrypted Payloads

```
DealCreated.encrypted_blob (decryptable by creator):
{
  creator:        pubkey       // verification field
  amount:         u64
  price:          u64
  total:          u64
  created_at:     timestamp
}

OfferCreated.encrypted_blob (decryptable by offeror):
{
  offeror:        pubkey
  price:          u64
  amount:         u64
  submitted_at:   timestamp
}

DealSettled.encrypted_blob (decryptable by creator):
{
  creator:        pubkey        // verification field
  total_filled:   u64           // how much actually executed
}

OfferSettled.encrypted_blob (decryptable by offeror):
{
  offeror:        pubkey       // verification field
  outcome:        enum          // PASSED, PARTIAL, FAILED
  executed_amt:   u64           // 0 if FAILED, ≤ amount otherwise
  refund_amt:     u64           // locked funds returned
}
```

### Indexer Requirements

- Store events from a rolling window: 48 hours + settlement buffer (~72 hours total)
- Serve all events on request (no filtering required)
- Prune events older than the window
- No decryption capability — just stores and serves opaque blobs

### Client Discovery Flow

**Finding your deals (as creator):**
1. Fetch all `DealCreated` events from the rolling window
2. Attempt to decrypt each `encrypted_blob` with your private key
3. Parse the first 32 bytes as `creator` pubkey
4. If it matches your pubkey → it's your deal; otherwise skip

**Finding your offers (as offeror):**
1. Fetch all `OfferCreated` events from the rolling window
2. Attempt to decrypt each `encrypted_blob` with your private key
3. Parse the first 32 bytes as `offeror` pubkey
4. If it matches your pubkey → it's your offer; otherwise skip

**Checking outcomes:**
1. Fetch `DealSettled` events, decrypt blob to verify `creator` pubkey matches yours
2. Matching blobs contain your deal's `total_filled`
3. Fetch all `OfferSettled` events from the rolling window
4. Attempt to decrypt each `encrypted_blob`, verify `offeror` pubkey matches yours
5. Matching blobs contain your offer outcomes

**Why pubkey verification works:**

The recipient's pubkey (already present in the payload) doubles as a decryption verification mechanism. Decrypting with the wrong key produces garbage — the probability of garbage matching your exact 32-byte pubkey is 2^-256.

**Security note:** Including a known field (pubkey) in the plaintext is safe because Rescue cipher with unique nonces per encryption provides IND-CPA security. Each (key, nonce) pair produces a unique keystream, so knowing plaintext + ciphertext for one encryption reveals nothing about the key or other ciphertexts. Arcium increments nonces after each operation, ensuring no reuse.

### Scalability Notes

Assuming worst case of 10,000 events in 72 hours:
- ~10,000 decrypt attempts × 0.1ms = ~1 second total
- Completely acceptable for client-side processing
- If volume grows significantly, can add tagging (see Aztec's note discovery) without changing the core model

---

## Derived Views

These are computed client-side by decrypting events from the indexer, not stored entities.

### OpenMarketView (public)

Assembled from `DealCreated` events where `status == OPEN`:

```
[
  { deal_id, base_mint, quote_mint, side, expires_at, is_partial }
]
```

Minimal info for the "Open Market" tab.

---

### MyDealsView (per creator)

Assembled by decrypting `DealCreated` blobs, enriched with `DealSettled` when available:

```
[
  {
    deal_id, base_mint, quote_mint, side, amount, price, total,
    expires_at, status, is_partial, allow_partial
  }
]
```

---

### MyOffersView (per offeror)

Assembled by decrypting `OfferCreated` blobs, enriched with `OfferSettled` when available:

```
[
  {
    offer_id, deal_id, base_mint, quote_mint, side,
    my_price, my_amount, submitted_at,
    deal_status,    // OPEN, EXECUTED, EXPIRED
    outcome         // PENDING, PASSED, FAILED, PARTIAL
  }
]
```

`outcome` transitions from PENDING only when `deal_status` leaves OPEN.
