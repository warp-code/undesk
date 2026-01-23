# Private OTC — Instruction Plan

This document outlines all instructions (encrypted and unencrypted) needed to implement the OTC system based on the account structures defined in `000_solana-arcium-implementation.md`.

---

## Overview

The system uses **greedy FIFO with auto-settlement on submission**:
- When an offer is submitted, MPC immediately computes `amt_to_execute`
- Anyone can crank anytime; automatic crank only at expiry

Each operation involves:
1. **Solana instruction** — Initializes accounts, queues computation
2. **Encrypted instruction** — Performs confidential logic in MPC
3. **Callback instruction** — Receives encrypted outputs, emits events

Additionally, we need **init_comp_def** instructions to register each computation definition before first use.

**Note:** Token transfers are deferred until we decide on a private transfer protocol. The MXE computes the amounts; the transfer mechanism is separate.

---

## Price Representation

Prices use **X64.64 fixed-point** format (128 bits total):
- Upper 64 bits: integer part
- Lower 64 bits: fractional part
- Stored as `u128` on-chain and in MPC

```rust
// Example: price of 1.5 = 1.5 * 2^64
const PRICE_ONE: u128 = 1u128 << 64;  // 1.0
let price_1_5: u128 = PRICE_ONE + (PRICE_ONE >> 1);  // 1.5
```

---

## 1. Create Deal

**Purpose:** Creator establishes a new OTC deal with encrypted parameters (amount, price).

### Flow
```
Creator → create_deal instruction → MPC executes create_deal circuit
                                  → callback stores encrypted state
                                  → emits DealCreated event (sealed to creator)
```

### Solana Instructions

#### `init_create_deal_comp_def`
Registers the `create_deal` computation definition. Called once per program deployment.

#### `create_deal`
**Accounts:**
- `payer` — Signer, pays for account creation
- `create_key` — Ephemeral signer for PDA uniqueness (prevents front-running)
- `deal` — PDA `["deal", create_key]`, initialized with plaintext fields
- `base_mint`, `quote_mint` — Token mints
- Standard Arcium accounts (mxe, mempool, computation, comp_def, cluster, pool, clock)

**Instruction Data:**
- `computation_offset: u64`
- `controller: Pubkey` — Derived ed25519 pubkey for signing authority
- `encryption_pubkey: [u8; 32]` — Creator's x25519 pubkey (for input decryption and output encryption)
- `nonce: u128`
- `expires_at: i64`
- `allow_partial: bool`
- `encrypted_amount: [u8; 32]` — Shared-encrypted (u64)
- `encrypted_price: [u8; 64]` — Shared-encrypted (u128, X64.64)

**Actions:**
1. Initialize `DealAccount` with plaintext fields
2. Build ArgBuilder with Shared marker + encrypted inputs
3. Queue computation with callback

#### `create_deal_callback`
**Accounts:**
- Standard callback accounts
- `deal` — Mutable, receives encrypted state

**Actions:**
1. Verify output signature
2. Store `Enc<Mxe, DealState>` ciphertexts in deal account
3. Set `deal.created_at = Clock::get().unix_timestamp` (plaintext, set at callback time)
4. Emit `DealCreated` event with sealed blob for creator

### Encrypted Instruction: `create_deal`

```rust
#[derive(Copy, Clone)]
pub struct DealInput {
    amount: u64,    // Base asset amount
    price: u128,    // X64.64 fixed-point price
}

#[derive(Copy, Clone)]
pub struct DealState {
    amount: u64,
    price: u128,
    fill_amount: u64,  // Running total of amt_to_execute across offers
}

#[derive(Copy, Clone)]
pub struct DealCreatedBlob {
    amount: u64,
    price: u128,
}

#[instruction]
pub fn create_deal(
    deal_data: Enc<Shared, DealInput>,
    creator: Shared,
) -> (Enc<Mxe, DealState>, Enc<Shared, DealCreatedBlob>) {
    let input = deal_data.to_arcis();

    let state = DealState {
        amount: input.amount,
        price: input.price,
        fill_amount: 0,
    };

    let blob = DealCreatedBlob {
        amount: input.amount,
        price: input.price,
    };

    (Mxe::get().from_arcis(state), creator.from_arcis(blob))
}
```

---

## 2. Submit Offer

**Purpose:** Offeror submits an offer to an existing deal. MPC compares prices and immediately computes `amt_to_execute` via greedy FIFO. This is "auto-settlement" — the fill amount is determined at submission time.

### Flow
```
Offeror → submit_offer instruction → MPC loads deal state
                                   → compares prices (FIFO)
                                   → computes amt_to_execute
                                   → updates deal.fill_amount
                                   → callback stores both states
                                   → emits OfferCreated event (sealed to offeror)
```

### Solana Instructions

#### `init_submit_offer_comp_def`
Registers the `submit_offer` computation definition.

#### `submit_offer`
**Accounts:**
- `payer` — Signer
- `create_key` — Ephemeral signer for offer PDA
- `deal` — Existing deal account (mutable for num_offers, encrypted state update)
- `offer` — PDA `["offer", deal, create_key]`, initialized
- Standard Arcium accounts

**Instruction Data:**
- `computation_offset: u64`
- `controller: Pubkey`
- `encryption_pubkey: [u8; 32]` — Offeror's x25519 pubkey (for input decryption and output encryption)
- `nonce: u128`
- `encrypted_price: [u8; 64]` — Shared-encrypted (u128, X64.64)
- `encrypted_amount: [u8; 32]` — Shared-encrypted (u64)

**Constraints:**
- `deal.status == OPEN`
- `deal.expires_at > Clock::get().unix_timestamp`

**Actions:**
1. Initialize `OfferAccount` with plaintext fields
2. Increment `deal.num_offers`
3. Set `offer.offer_index = deal.num_offers - 1`
4. Build ArgBuilder with deal state reference + offer input
5. Queue computation with callback

#### `submit_offer_callback`
**Accounts:**
- Standard callback accounts
- `deal` — Mutable, receives updated encrypted state
- `offer` — Mutable, receives encrypted offer state

**Actions:**
1. Verify output signature
2. Update deal's encrypted state (fill_amount changed)
3. Store offer's encrypted state (including amt_to_execute)
4. Set `offer.submitted_at = Clock::get().unix_timestamp` (plaintext, set at callback time)
5. Emit `OfferCreated` event with sealed blob for offeror

### Encrypted Instruction: `submit_offer`

```rust
#[derive(Copy, Clone)]
pub struct OfferInput {
    price: u128,    // X64.64 fixed-point
    amount: u64,
}

#[derive(Copy, Clone)]
pub struct OfferState {
    price: u128,
    amount: u64,
    amt_to_execute: u64,  // Computed immediately via FIFO
}

#[derive(Copy, Clone)]
pub struct OfferCreatedBlob {
    price: u128,
    amount: u64,
}

#[instruction]
pub fn submit_offer(
    deal_state: Enc<Mxe, &DealState>,
    offer_data: Enc<Shared, OfferInput>,
    offeror: Shared,
) -> (Enc<Mxe, DealState>, Enc<Mxe, OfferState>, Enc<Shared, OfferCreatedBlob>) {
    let deal = *(deal_state.to_arcis());
    let offer = offer_data.to_arcis();

    // Price comparison: offeror must be willing to pay at least creator's minimum
    let price_passes = offer.price >= deal.price;

    // Greedy FIFO: compute amt_to_execute immediately
    let remaining = deal.amount - deal.fill_amount;
    let amt_to_execute = if price_passes {
        min(offer.amount, remaining)
    } else {
        0
    };

    // Update deal state
    let new_deal = DealState {
        amount: deal.amount,
        price: deal.price,
        fill_amount: deal.fill_amount + amt_to_execute,
    };

    // Create offer state (amt_to_execute is now fixed)
    let offer_state = OfferState {
        price: offer.price,
        amount: offer.amount,
        amt_to_execute,
    };

    // Confirmation blob for offeror
    let blob = OfferCreatedBlob {
        price: offer.price,
        amount: offer.amount,
    };

    (
        deal_state.owner.from_arcis(new_deal),
        Mxe::get().from_arcis(offer_state),
        offeror.from_arcis(blob),
    )
}
```

**Key insight:** `amt_to_execute` is computed and stored at submission time. The offer's fate is already determined — the crank just computes final amounts and emits settlement events.

---

## 3. Crank

**Purpose:** Finalize deals and offers by computing final amounts and emitting settlement events.

**Trigger conditions:**
- After expiry: anyone can call (permissionless)
- Before expiry: only deal controller can call, but MPC will reject unless fully filled

**Architecture:** Deals and offers have independent encrypted states. They're connected through application logic (offer.deal pubkey), not shared encrypted state. However, `crank_deal` must be called first to determine the deal outcome before any offers can be cranked.

### Flow
```
1. Crank → crank_deal instruction → MPC reads deal state
                                  → determines success based on fill_amount
                                  → computes creator's amounts
                                  → emits DealSettled event
                                  → sets deal.status = EXECUTED | EXPIRED

2. Crank → crank_offer instruction (per offer) → reads deal.status (plaintext)
                                                → MPC reads offer state
                                                → computes offeror's amounts
                                                → emits OfferSettled event
```

---

### 3a. Crank Deal

**Purpose:** Settle the deal creator's side. Reads only the deal's encrypted state.

#### `init_crank_deal_comp_def`
Registers the computation definition.

#### `crank_deal`
**Accounts:**
- `payer` — Signer
- `deal` — The deal (mutable for status)
- Standard Arcium accounts

**Instruction Data:**
- `computation_offset: u64`
- `creator_encryption_pubkey: [u8; 32]`
- `creator_nonce: u128`

**Constraints:**
- `deal.status == OPEN`
- Either: `deal.expires_at <= now` OR caller is deal controller

**Actions:**
1. Build ArgBuilder with deal state reference + creator's Shared marker + plaintext flags
2. Queue computation with callback

#### `crank_deal_callback`
**Accounts:**
- Standard callback accounts
- `deal` — For status update

**Actions:**
1. Verify output
2. Check status from MPC output:
   - If `OPEN (0)`: no-op (early crank rejected, deal not fully filled)
   - If `EXECUTED (1)` or `EXPIRED (2)`: update `deal.status` and emit `DealSettled` event

### Encrypted Instruction: `crank_deal`

```rust
#[derive(Copy, Clone)]
pub struct DealSettledBlob {
    total_filled: u64,
    creator_receives: u64,
    creator_refund: u64,
}

#[instruction]
pub fn crank_deal(
    deal_state: Enc<Mxe, &DealState>,
    creator: Shared,
    is_expired: bool,
    allow_partial: bool,
) -> (Enc<Shared, DealSettledBlob>, u8) {
    let deal = *(deal_state.to_arcis());

    let fully_filled = deal.fill_amount >= deal.amount;

    // Early crank requires full fill — if not, no-op
    if !is_expired && !fully_filled {
        return (creator.from_arcis(DealSettledBlob::default()), 0); // OPEN = no change
    }

    // Determine outcome
    let deal_executes = fully_filled || (allow_partial && deal.fill_amount > 0);
    let total_filled = if deal_executes { deal.fill_amount } else { 0 };
    let unfilled = deal.amount - total_filled;

    // Creator sells base, receives quote
    let creator_receives = ((total_filled as u128 * deal.price) >> 64) as u64;
    let creator_refund = unfilled;

    let blob = DealSettledBlob {
        total_filled,
        creator_receives,
        creator_refund,
    };

    // Status: EXECUTED (1) or EXPIRED (2)
    let status = if deal_executes { 1 } else { 2 };

    (creator.from_arcis(blob), status)
}
```

---

### 3b. Crank Offer

**Purpose:** Settle a single offer. Reads only the offer's encrypted state.

#### `init_crank_offer_comp_def`
Registers the computation definition.

#### `crank_offer`
**Accounts:**
- `payer` — Signer (permissionless crank)
- `deal` — The deal (read-only, for expiry/status checks)
- `offer` — The offer to crank (mutable for status)
- Standard Arcium accounts

**Instruction Data:**
- `computation_offset: u64`
- `offeror_encryption_pubkey: [u8; 32]` — For sealing OfferSettled blob
- `offeror_nonce: u128`

**Constraints:**
- `deal.status != OPEN` (deal must be finalized via `crank_deal` first)
- `offer.status != SETTLED` (prevent double-crank)

**Actions:**
1. Derive `deal_success` from `deal.status`:
   - `EXECUTED` → `true`
   - `EXPIRED` → `false`
2. Build ArgBuilder with:
   - Offer state reference (only the offer, not the deal's encrypted state)
   - Offeror's Shared marker
   - Plaintext: `deal_success`
3. Queue computation with callback

#### `crank_offer_callback`
**Accounts:**
- Standard callback accounts
- `offer` — For status update

**Actions:**
1. Verify output signature
2. Mark `offer.status = SETTLED`
3. Emit `OfferSettled` event with sealed blob

### Encrypted Instruction: `crank_offer`

```rust
#[derive(Copy, Clone)]
pub struct OfferSettledBlob {
    outcome: u8,          // EXECUTED(0), PARTIAL(1), FAILED(2)
    executed_amt: u64,
    refund_amt: u64,
}

#[instruction]
pub fn crank_offer(
    offer_state: Enc<Mxe, &OfferState>,
    offeror: Shared,
    deal_success: bool,  // Plaintext: derived from deal.status (EXECUTED → true, EXPIRED → false)
) -> Enc<Shared, OfferSettledBlob> {
    let offer = *(offer_state.to_arcis());

    // If deal failed, nothing executes
    let executed_amt = if deal_success {
        offer.amt_to_execute
    } else {
        0
    };

    let refund_amt = offer.amount - executed_amt;

    let outcome = if executed_amt == 0 {
        2  // FAILED
    } else if executed_amt < offer.amount {
        1  // PARTIAL
    } else {
        0  // EXECUTED (full)
    };

    let blob = OfferSettledBlob {
        outcome,
        executed_amt,
        refund_amt,
    };

    offeror.from_arcis(blob)
}
```

**Note:** `deal_success` is derived from `deal.status`, which is set by `crank_deal`. The offer's encrypted instruction doesn't need to read the deal's encrypted state — it only needs to know whether the deal succeeded or failed.

---

## Summary: All Instructions

| # | Instruction | Type | Purpose |
|---|-------------|------|---------|
| 1 | `init_create_deal_comp_def` | Init | Register create_deal computation |
| 2 | `create_deal` | Queue | Creator submits deal parameters |
| 3 | `create_deal_callback` | Callback | Store deal state, emit DealCreated |
| 4 | `init_submit_offer_comp_def` | Init | Register submit_offer computation |
| 5 | `submit_offer` | Queue | Offeror submits offer, FIFO computed |
| 6 | `submit_offer_callback` | Callback | Store offer state (with amt_to_execute), emit OfferCreated |
| 7 | `init_crank_deal_comp_def` | Init | Register crank_deal computation |
| 8 | `crank_deal` | Queue | Settle creator's side |
| 9 | `crank_deal_callback` | Callback | Update status, emit DealSettled |
| 10 | `init_crank_offer_comp_def` | Init | Register crank_offer computation |
| 11 | `crank_offer` | Queue | Settle single offer |
| 12 | `crank_offer_callback` | Callback | Update status, emit OfferSettled |

---

## Encrypted Instructions Summary

| # | Instruction | Inputs | Outputs |
|---|-------------|--------|---------|
| 1 | `create_deal` | `Enc<Shared, DealInput>`, `Shared` | `Enc<Mxe, DealState>`, `Enc<Shared, DealCreatedBlob>` |
| 2 | `submit_offer` | `Enc<Mxe, &DealState>`, `Enc<Shared, OfferInput>`, `Shared` | `Enc<Mxe, DealState>`, `Enc<Mxe, OfferState>`, `Enc<Shared, OfferCreatedBlob>` |
| 3 | `crank_deal` | `Enc<Mxe, &DealState>`, `Shared`, `bool`, `bool` | `Enc<Shared, DealSettledBlob>`, `u8` |
| 4 | `crank_offer` | `Enc<Mxe, &OfferState>`, `Shared`, `bool` | `Enc<Shared, OfferSettledBlob>` |

---

## State Transitions

```
Deal:
  OPEN (0) → OPEN (0)      early crank rejected (not fully filled)
  OPEN (0) → EXECUTED (1)  fully filled, or partial fill at expiry (if allowed)
  OPEN (0) → EXPIRED (2)   expired with no fill, or partial not allowed

Offer:
  OPEN (0) → SETTLED (1)   when crank_offer completes
```

---

## Crank Ordering

**`crank_deal` must be called before any `crank_offer`.**

The deal's `fill_amount` is encrypted, so only `crank_deal` (via MPC) can determine whether the deal succeeded. It then sets `deal.status` to `EXECUTED` or `EXPIRED` in plaintext.

`crank_offer` derives `deal_success` from `deal.status`:
- `deal.status == EXECUTED` → `deal_success = true`
- `deal.status == EXPIRED` → `deal_success = false`

The Solana `crank_offer` instruction must enforce:
- `deal.status != OPEN` (deal must be finalized first)

---

## Open Implementation Questions

1. **Token transfers**: Deferred until we decide on a private transfer protocol. The MXE computes the amounts; the transfer mechanism is separate.

2. **Account closure**: When can we close offer/deal accounts and reclaim rent?

3. **Crank authorization**: Currently permissionless after expiry. Should owner be able to crank early even before expiry if deal is filled?

4. **Event indexing**: Events contain sealed blobs. Should we also emit plaintext metadata for public indexers?
