# Balance Integration with Deal/Offer Structures

This document describes the integration of encrypted balances with the existing deal/offer submission and settlement (crank) instructions, including the fix for the crank_offer quote calculation bug.

**References:**
- [003_balance-account-plan.md](./003_balance-account-plan.md) - Balance account implementation
- [002_vault-and-balance-plan.md](./002_vault-and-balance-plan.md) - Vault/balance architecture
- [001_instruction-plan.md](./001_instruction-plan.md) - Original instruction plan

---

## Executive Summary

This phase integrates the `committed_amount` tracking in `BalanceState` with deal/offer lifecycle:

| Instruction | Balance Impact |
|-------------|----------------|
| `create_deal` | Lock creator's BASE tokens (amount) |
| `submit_offer` | Lock offeror's QUOTE tokens (max commitment: `offer.amount * deal.price`) |
| `crank_deal` | Release/settle creator's BASE commitment |
| `crank_offer` | Release/settle offeror's QUOTE commitment |

### Design Principle: Privacy-Preserving Commitments

**Key insight:** The offeror should NOT learn at submission time how much of their offer will execute. This preserves privacy about the deal's remaining capacity.

**Commitment strategy:**
- At `submit_offer`: Lock the **maximum possible** quote commitment (`offer.amount * deal.price`)
- At `crank_offer`: Settle based on actual execution, refund the difference

This means the offeror only learns their actual execution amount after the deal settles.

### Critical Bug Fix: crank_offer refund calculation

**Current (incorrect):**
```rust
let refund_amt = offer.amount - executed_amt;  // BASE units!
```

**Problem:** The offeror committed QUOTE tokens (not base tokens), so the refund must be calculated in QUOTE units using the deal's price.

**Fix:** Pass the deal's encrypted state to `crank_offer` so the MPC can:
1. Read the deal's price
2. Derive `quote_committed = (offer.amount * deal.price) >> 64` (max commitment)
3. Calculate `quote_executed = (executed_amt * deal.price) >> 64`
4. Calculate `quote_refund = quote_committed - quote_executed`

---

## Account Data Flows

### What Each Party Commits

```
DEAL CREATOR (selling BASE for QUOTE):
  - Commits: BASE tokens (deal.amount)
  - Balance affected: creator_base_balance
  - On settlement:
    - Receives: QUOTE tokens (filled * price)
    - Refunded: BASE tokens (deal.amount - filled)

OFFEROR (buying BASE with QUOTE):
  - Commits: QUOTE tokens (offer.amount * deal.price) ← MAX commitment
  - Balance affected: offeror_quote_balance
  - On settlement:
    - Receives: BASE tokens (executed_amt)
    - Refunded: QUOTE tokens (quote_committed - quote_executed)
```

### Why Offeror Commits Maximum Quote Amount

The offeror is BUYING base tokens, so they pay in quote. The commitment design:

1. **At submission:** Lock the MAX possible quote = `offer.amount * deal.price`
   - This is the worst-case commitment if the entire offer executes
   - The offeror does NOT learn `amt_to_execute` (preserves privacy about deal capacity)

2. **At settlement:** Refund the difference
   - `quote_executed = executed_amt * deal.price`
   - `quote_refund = quote_committed - quote_executed`

**Why not commit based on `amt_to_execute`?**
- If we revealed `amt_to_execute` or `quote_committed` at submission, the offeror could infer the deal's remaining capacity
- By always committing the max, the offeror only learns their actual execution after the deal settles
- This is analogous to how the deal creator doesn't know which offers will fill until settlement

---

## Modified Encrypted Instructions

### 1. create_deal (with balance commitment)

**Current signature:**
```rust
pub fn create_deal(
    deal_data: Enc<Shared, DealInput>,
) -> (Enc<Mxe, DealState>, Enc<Shared, DealCreatedBlob>)
```

**New signature:**
```rust
pub fn create_deal(
    deal_data: Enc<Shared, DealInput>,
    creator_balance: Enc<Mxe, &BalanceState>,
    creator: Shared,
) -> (
    Enc<Mxe, DealState>,
    Enc<Mxe, BalanceState>,
    Enc<Shared, DealCreatedBlob>,
    Enc<Shared, BalanceUpdatedBlob>,
)
```

**Logic:**
```rust
#[instruction]
pub fn create_deal(
    deal_data: Enc<Shared, DealInput>,
    creator_balance: Enc<Mxe, &BalanceState>,
    creator: Shared,
) -> (
    Enc<Mxe, DealState>,
    Enc<Mxe, BalanceState>,
    Enc<Shared, DealCreatedBlob>,
    Enc<Shared, BalanceUpdatedBlob>,
) {
    let input = deal_data.to_arcis();
    let balance = *(creator_balance.to_arcis());

    // Validate sufficient available balance
    let available = balance.amount - balance.committed_amount;
    // Note: Arcis doesn't support runtime panics, so validation happens differently
    // The MPC will abort if balance is insufficient (implementation detail)

    // Lock commitment
    let new_balance = BalanceState {
        amount: balance.amount,
        committed_amount: balance.committed_amount + input.amount,
    };

    // Create deal state
    let deal_state = DealState {
        amount: input.amount,
        price: input.price,
        fill_amount: 0,
    };

    let deal_blob = DealCreatedBlob {
        amount: input.amount,
        price: input.price,
    };

    let balance_blob = BalanceUpdatedBlob {
        amount: new_balance.amount,
        committed_amount: new_balance.committed_amount,
    };

    (
        Mxe::get().from_arcis(deal_state),
        creator_balance.owner.from_arcis(new_balance),
        deal_data.owner.from_arcis(deal_blob),
        creator.from_arcis(balance_blob),
    )
}
```

---

### 2. submit_offer (with balance commitment)

**Current signature:**
```rust
pub fn submit_offer(
    deal_state: Enc<Mxe, &DealState>,
    offer_data: Enc<Shared, OfferInput>,
) -> (Enc<Mxe, DealState>, Enc<Mxe, OfferState>, Enc<Shared, OfferCreatedBlob>)
```

**New signature:**
```rust
pub fn submit_offer(
    deal_state: Enc<Mxe, &DealState>,
    offer_data: Enc<Shared, OfferInput>,
    offeror_balance: Enc<Mxe, &BalanceState>,
    offeror: Shared,
) -> (
    Enc<Mxe, DealState>,
    Enc<Mxe, OfferState>,
    Enc<Mxe, BalanceState>,
    Enc<Shared, OfferCreatedBlob>,
    Enc<Shared, BalanceUpdatedBlob>,
)
```

**Logic:**
```rust
#[instruction]
pub fn submit_offer(
    deal_state: Enc<Mxe, &DealState>,
    offer_data: Enc<Shared, OfferInput>,
    offeror_balance: Enc<Mxe, &BalanceState>,
    offeror: Shared,
) -> (
    Enc<Mxe, DealState>,
    Enc<Mxe, OfferState>,
    Enc<Mxe, BalanceState>,
    Enc<Shared, OfferCreatedBlob>,
    Enc<Shared, BalanceUpdatedBlob>,
) {
    let deal = *(deal_state.to_arcis());
    let offer = offer_data.to_arcis();
    let balance = *(offeror_balance.to_arcis());

    // Price comparison and fill calculation
    let remaining = deal.amount - deal.fill_amount;
    let amt_to_execute = if offer.price >= deal.price {
        if offer.amount < remaining { offer.amount } else { remaining }
    } else {
        0
    };

    // Calculate MAX quote commitment using DEAL'S price (not offer price)
    // This is the FULL offer amount, not amt_to_execute (privacy: don't reveal execution)
    // X64.64 fixed-point: (amount * price) >> 64
    let quote_to_commit = ((offer.amount as u128 * deal.price) >> 64) as u64;

    // Validate sufficient available balance
    let available = balance.amount - balance.committed_amount;
    // MPC aborts if available < quote_to_commit

    // Lock MAX commitment (will be adjusted at settlement)
    let new_balance = BalanceState {
        amount: balance.amount,
        committed_amount: balance.committed_amount + quote_to_commit,
    };

    // Update deal fill amount
    let updated_deal = DealState {
        amount: deal.amount,
        price: deal.price,
        fill_amount: deal.fill_amount + amt_to_execute,
    };

    let offer_state = OfferState {
        price: offer.price,
        amount: offer.amount,
        amt_to_execute,
    };

    // OfferCreatedBlob: only echo back what the offeror submitted
    // Do NOT include amt_to_execute or quote_committed (privacy)
    let offer_blob = OfferCreatedBlob {
        price: offer.price,
        amount: offer.amount,
    };

    let balance_blob = BalanceUpdatedBlob {
        amount: new_balance.amount,
        committed_amount: new_balance.committed_amount,
    };

    (
        Mxe::get().from_arcis(updated_deal),
        Mxe::get().from_arcis(offer_state),
        offeror_balance.owner.from_arcis(new_balance),
        offer_data.owner.from_arcis(offer_blob),
        offeror.from_arcis(balance_blob),
    )
}
```

**OfferState struct (unchanged):**
```rust
#[derive(Copy, Clone)]
pub struct OfferState {
    /// X64.64 fixed-point price
    price: u128,
    /// Amount of base asset to buy
    amount: u64,
    /// Amount to execute (computed at submission)
    amt_to_execute: u64,
}
```

**OfferCreatedBlob struct (UNCHANGED from current - no new fields):**
```rust
#[derive(Copy, Clone)]
pub struct OfferCreatedBlob {
    /// X64.64 fixed-point price
    price: u128,
    /// Amount of base asset to buy
    amount: u64,
}
```

Note: The offeror does NOT learn `amt_to_execute` or `quote_committed` at submission time. They only learn their actual execution after the deal settles via `crank_offer`. The quote commitment is derived at settlement from `offer.amount * deal.price`.

---

### 3. crank_deal (with balance settlement)

**Current signature:**
```rust
pub fn crank_deal(
    deal_state: Enc<Mxe, &DealState>,
    creator: Shared,
    is_expired: bool,
    allow_partial: bool,
) -> (Enc<Shared, DealSettledBlob>, u8)
```

**New signature:**
```rust
pub fn crank_deal(
    deal_state: Enc<Mxe, &DealState>,
    creator_balance: Enc<Mxe, &BalanceState>,
    creator: Shared,
    is_expired: bool,
    allow_partial: bool,
) -> (
    Enc<Mxe, BalanceState>,
    Enc<Shared, DealSettledBlob>,
    Enc<Shared, BalanceUpdatedBlob>,
    u8,
)
```

**Logic:**
```rust
#[instruction]
pub fn crank_deal(
    deal_state: Enc<Mxe, &DealState>,
    creator_balance: Enc<Mxe, &BalanceState>,
    creator: Shared,
    is_expired: bool,
    allow_partial: bool,
) -> (
    Enc<Mxe, BalanceState>,
    Enc<Shared, DealSettledBlob>,
    Enc<Shared, BalanceUpdatedBlob>,
    u8,
) {
    let deal = *(deal_state.to_arcis());
    let balance = *(creator_balance.to_arcis());

    let fully_filled = deal.fill_amount >= deal.amount;
    let can_settle = is_expired || fully_filled;
    let deal_executes = fully_filled || (allow_partial && deal.fill_amount > 0);

    let total_filled = if can_settle && deal_executes {
        deal.fill_amount
    } else {
        0
    };

    let unfilled = deal.amount - total_filled;

    // Calculate settlement amounts
    let creator_receives = ((total_filled as u128 * deal.price) >> 64) as u64;
    let creator_refund = if can_settle { unfilled } else { 0 };

    // Update balance: release commitment, refund unfilled
    let new_balance = if can_settle {
        BalanceState {
            // Refund unfilled base tokens to available
            amount: balance.amount + creator_refund,
            // Release entire commitment (filled was "spent", unfilled refunded)
            committed_amount: balance.committed_amount - deal.amount,
        }
    } else {
        balance  // No change if can't settle
    };

    let deal_blob = DealSettledBlob {
        total_filled,
        creator_receives,
        creator_refund,
    };

    let balance_blob = BalanceUpdatedBlob {
        amount: new_balance.amount,
        committed_amount: new_balance.committed_amount,
    };

    let status: u8 = if !can_settle { 0 }
                     else if deal_executes { 1 }
                     else { 2 };

    (
        creator_balance.owner.from_arcis(new_balance),
        creator.from_arcis(deal_blob),
        creator.from_arcis(balance_blob),
        status.reveal(),
    )
}
```

---

### 4. crank_offer (with balance settlement - CRITICAL FIX)

**Current signature:**
```rust
pub fn crank_offer(
    offer_state: Enc<Mxe, &OfferState>,
    offeror: Shared,
    deal_success: bool,
) -> Enc<Shared, OfferSettledBlob>
```

**Problem:** Cannot calculate quote refund without knowing the deal's price.

**New signature (includes deal state):**
```rust
pub fn crank_offer(
    deal_state: Enc<Mxe, &DealState>,
    offer_state: Enc<Mxe, &OfferState>,
    offeror_balance: Enc<Mxe, &BalanceState>,
    offeror: Shared,
    deal_success: bool,
) -> (
    Enc<Mxe, BalanceState>,
    Enc<Shared, OfferSettledBlob>,
    Enc<Shared, BalanceUpdatedBlob>,
)
```

**Logic (FIXED):**
```rust
#[instruction]
pub fn crank_offer(
    deal_state: Enc<Mxe, &DealState>,
    offer_state: Enc<Mxe, &OfferState>,
    offeror_balance: Enc<Mxe, &BalanceState>,
    offeror: Shared,
    deal_success: bool,
) -> (
    Enc<Mxe, BalanceState>,
    Enc<Shared, OfferSettledBlob>,
    Enc<Shared, BalanceUpdatedBlob>,
) {
    let deal = *(deal_state.to_arcis());
    let offer = *(offer_state.to_arcis());
    let balance = *(offeror_balance.to_arcis());

    // Determine executed amount based on deal outcome
    let executed_amt = if deal_success {
        offer.amt_to_execute
    } else {
        0  // Deal failed, nothing executes
    };

    // Calculate quote amounts using deal's price
    // This is the FIX: we use the deal's price, not just base units

    // quote_committed = MAX commitment (offer.amount, not amt_to_execute)
    // This matches what was locked at submit_offer time
    let quote_committed = ((offer.amount as u128 * deal.price) >> 64) as u64;
    let quote_executed = ((executed_amt as u128 * deal.price) >> 64) as u64;

    // Quote refund = committed - executed
    let quote_refund = quote_committed - quote_executed;

    // Update balance: release commitment, refund unexecuted quote
    let new_balance = BalanceState {
        // Refund unexecuted quote tokens to available
        amount: balance.amount + quote_refund,
        // Release entire quote commitment
        committed_amount: balance.committed_amount - quote_committed,
    };

    // Outcome based on base execution (for event)
    let outcome: u8 = if executed_amt == 0 { 2 }          // FAILED
                      else if executed_amt < offer.amount { 1 }  // PARTIAL
                      else { 0 };                          // EXECUTED

    let offer_blob = OfferSettledBlob {
        outcome,
        executed_amt,           // Base tokens received
        quote_paid: quote_executed,   // Quote tokens paid (NEW)
        quote_refund,           // Quote tokens refunded (FIXED)
    };

    let balance_blob = BalanceUpdatedBlob {
        amount: new_balance.amount,
        committed_amount: new_balance.committed_amount,
    };

    (
        offeror_balance.owner.from_arcis(new_balance),
        offeror.from_arcis(offer_blob),
        offeror.from_arcis(balance_blob),
    )
}
```

**Updated OfferSettledBlob:**
```rust
#[derive(Copy, Clone)]
pub struct OfferSettledBlob {
    /// Outcome: EXECUTED(0), PARTIAL(1), FAILED(2)
    outcome: u8,
    /// Amount of base asset bought
    executed_amt: u64,
    /// Quote tokens paid for executed base
    quote_paid: u64,     // NEW
    /// Quote tokens refunded (was incorrectly in base units before)
    quote_refund: u64,   // RENAMED from refund_amt
}
```

---

## On-Chain Instruction Changes

### 1. create_deal.rs

**New accounts:**
```rust
#[queue_computation_accounts("create_deal", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, controller: Pubkey)]
pub struct CreateDeal<'info> {
    // ... existing accounts ...

    /// Creator's base token balance (for commitment)
    #[account(
        mut,
        seeds = [b"balance", controller.as_ref(), base_mint.key().as_ref()],
        bump,
        constraint = creator_balance.controller == controller @ ErrorCode::ControllerMismatch,
    )]
    pub creator_balance: Account<'info, BalanceAccount>,

    // ... rest of accounts ...
}
```

**Updated ArgBuilder:**
```rust
let args = ArgBuilder::new()
    // Enc<Shared, DealInput>
    .x25519_pubkey(encryption_pubkey)
    .plaintext_u128(nonce)
    .encrypted_u64(encrypted_amount)
    .encrypted_u128(encrypted_price)
    // Enc<Mxe, &BalanceState> (creator's base balance)
    .plaintext_u128(creator_balance_nonce)
    .account(creator_balance_key, BALANCE_CIPHERTEXT_OFFSET, BALANCE_CIPHERTEXT_LENGTH)
    // Shared marker for balance blob
    .x25519_pubkey(encryption_pubkey)
    .plaintext_u128(balance_blob_nonce)
    .build();
```

**Callback updates:**
- Store updated balance state
- Emit BalanceUpdated event along with DealCreated

---

### 2. submit_offer.rs

**New accounts:**
```rust
#[queue_computation_accounts("submit_offer", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, controller: Pubkey)]
pub struct SubmitOffer<'info> {
    // ... existing accounts ...

    /// Offeror's quote token balance (for commitment)
    /// Must use deal's quote_mint
    #[account(
        mut,
        seeds = [b"balance", controller.as_ref(), deal.quote_mint.as_ref()],
        bump,
        constraint = offeror_balance.controller == controller @ ErrorCode::ControllerMismatch,
    )]
    pub offeror_balance: Account<'info, BalanceAccount>,

    // ... rest of accounts ...
}
```

**Updated ArgBuilder:**
```rust
let args = ArgBuilder::new()
    // Enc<Mxe, &DealState>
    .plaintext_u128(deal_nonce)
    .account(deal_key, DEAL_CIPHERTEXT_OFFSET, DEAL_CIPHERTEXT_LENGTH)
    // Enc<Shared, OfferInput>
    .x25519_pubkey(encryption_pubkey)
    .plaintext_u128(nonce)
    .encrypted_u128(encrypted_price)
    .encrypted_u64(encrypted_amount)
    // Enc<Mxe, &BalanceState> (offeror's quote balance)
    .plaintext_u128(offeror_balance_nonce)
    .account(offeror_balance_key, BALANCE_CIPHERTEXT_OFFSET, BALANCE_CIPHERTEXT_LENGTH)
    // Shared marker for balance blob
    .x25519_pubkey(encryption_pubkey)
    .plaintext_u128(balance_blob_nonce)
    .build();
```

---

### 3. crank_deal.rs

**New accounts:**
```rust
#[queue_computation_accounts("crank_deal", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CrankDeal<'info> {
    // ... existing accounts ...

    /// Creator's base token balance (for settlement)
    #[account(
        mut,
        seeds = [b"balance", deal.controller.as_ref(), deal.base_mint.as_ref()],
        bump,
    )]
    pub creator_balance: Account<'info, BalanceAccount>,

    // ... rest of accounts ...
}
```

**Updated ArgBuilder:**
```rust
let args = ArgBuilder::new()
    // Enc<Mxe, &DealState>
    .plaintext_u128(deal_nonce)
    .account(deal_key, DEAL_CIPHERTEXT_OFFSET, DEAL_CIPHERTEXT_LENGTH)
    // Enc<Mxe, &BalanceState> (creator's base balance)
    .plaintext_u128(creator_balance_nonce)
    .account(creator_balance_key, BALANCE_CIPHERTEXT_OFFSET, BALANCE_CIPHERTEXT_LENGTH)
    // Shared marker for creator
    .x25519_pubkey(ctx.accounts.deal.encryption_pubkey)
    .plaintext_u128(creator_nonce)
    // Plaintext booleans
    .plaintext_bool(is_expired)
    .plaintext_bool(allow_partial)
    .build();
```

---

### 4. crank_offer.rs (CRITICAL)

**New accounts:**
```rust
#[queue_computation_accounts("crank_offer", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct CrankOffer<'info> {
    // ... existing accounts ...

    /// Deal account (need encrypted state for price)
    #[account(
        constraint = offer.deal == deal.key() @ ErrorCode::DealMismatch,
    )]
    pub deal: Box<Account<'info, DealAccount>>,

    /// Offeror's quote token balance (for settlement)
    #[account(
        mut,
        seeds = [b"balance", offer.controller.as_ref(), deal.quote_mint.as_ref()],
        bump,
    )]
    pub offeror_balance: Account<'info, BalanceAccount>,

    // ... rest of accounts ...
}
```

**Updated ArgBuilder (now includes deal state):**
```rust
let args = ArgBuilder::new()
    // Enc<Mxe, &DealState> - NEEDED FOR PRICE CALCULATION
    .plaintext_u128(deal_nonce)
    .account(deal_key, DEAL_CIPHERTEXT_OFFSET, DEAL_CIPHERTEXT_LENGTH)
    // Enc<Mxe, &OfferState>
    .plaintext_u128(offer_nonce)
    .account(offer_key, OFFER_CIPHERTEXT_OFFSET, OFFER_CIPHERTEXT_LENGTH)
    // Enc<Mxe, &BalanceState> (offeror's quote balance)
    .plaintext_u128(offeror_balance_nonce)
    .account(offeror_balance_key, BALANCE_CIPHERTEXT_OFFSET, BALANCE_CIPHERTEXT_LENGTH)
    // Shared marker for offeror
    .x25519_pubkey(ctx.accounts.offer.encryption_pubkey)
    .plaintext_u128(offeror_nonce)
    // Plaintext bool
    .plaintext_bool(deal_success)
    .build();
```

---

## Account Structure Updates

### OfferAccount (unchanged)

No changes needed to `OfferAccount`. The existing 3-field structure remains:

```rust
pub const OFFER_CIPHERTEXT_OFFSET: u32 = 24;  // discriminator (8) + nonce (16)
pub const OFFER_CIPHERTEXT_LENGTH: u32 = 96;  // 3 x 32 bytes (unchanged)

#[account]
#[derive(InitSpace)]
pub struct OfferAccount {
    // === MXE-encrypted (raw bytes) - MUST BE FIRST ===
    pub nonce: [u8; 16],
    pub ciphertexts: [[u8; 32]; 3],   // Unchanged: price, amount, amt_to_execute

    // === Public (plaintext) ===
    pub create_key: Pubkey,
    pub controller: Pubkey,
    pub encryption_pubkey: [u8; 32],
    pub deal: Pubkey,
    pub submitted_at: i64,
    pub offer_index: u32,
    pub status: u8,
    pub bump: u8,
}
```

### OfferState (unchanged)

```rust
#[derive(Copy, Clone)]
pub struct OfferState {
    /// X64.64 fixed-point price (max willing to pay)
    price: u128,
    /// Amount of base asset to buy
    amount: u64,
    /// Amount to execute (computed at submission)
    amt_to_execute: u64,
}
```

`quote_committed` is derived at settlement: `(offer.amount * deal.price) >> 64` (MAX commitment)

### OfferCreatedBlob (UNCHANGED)

```rust
#[derive(Copy, Clone)]
pub struct OfferCreatedBlob {
    /// X64.64 fixed-point price
    price: u128,
    /// Amount of base asset to buy
    amount: u64,
}
```

**Privacy rationale:** The `OfferCreatedBlob` only echoes back what the offeror submitted (price and amount). It does NOT include `amt_to_execute` or `quote_committed` because:
1. Revealing `amt_to_execute` would leak information about the deal's remaining capacity
2. The offeror learns their actual execution only after settlement via `OfferSettledBlob`
3. The MAX quote commitment (`offer.amount * deal.price`) is locked, with excess refunded at settlement

### OfferSettledBlob (updated)

```rust
#[derive(Copy, Clone)]
pub struct OfferSettledBlob {
    outcome: u8,
    executed_amt: u64,        // Base tokens received
    quote_paid: u64,          // NEW - Quote tokens paid
    quote_refund: u64,        // FIXED - Now in quote units
}
```

---

## Cranker Updates

### packages/cranker/src/transactions.ts

**Update buildCrankDealAccounts:**
```typescript
export function buildCrankDealAccounts(
  programId: PublicKey,
  payer: PublicKey,
  deal: PublicKey,
  dealController: PublicKey,  // NEW
  baseMint: PublicKey,        // NEW
  computationOffset: anchor.BN,
  clusterOffset: number
): Record<string, PublicKey> {
  // Derive creator's base balance PDA
  const creatorBalance = PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), dealController.toBuffer(), baseMint.toBuffer()],
    programId
  )[0];

  return {
    payer,
    deal,
    creatorBalance,  // NEW
    // ... arcium accounts ...
  };
}
```

**Update buildCrankOfferAccounts:**
```typescript
export function buildCrankOfferAccounts(
  programId: PublicKey,
  payer: PublicKey,
  deal: PublicKey,
  offer: PublicKey,
  offerController: PublicKey,  // NEW
  quoteMint: PublicKey,        // NEW
  computationOffset: anchor.BN,
  clusterOffset: number
): Record<string, PublicKey> {
  // Derive offeror's quote balance PDA
  const offerorBalance = PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), offerController.toBuffer(), quoteMint.toBuffer()],
    programId
  )[0];

  return {
    payer,
    deal,
    offer,
    offerorBalance,  // NEW
    // ... arcium accounts ...
  };
}
```

### packages/cranker/src/execute.ts

**Update executeCrankDeal:**
```typescript
export async function executeCrankDeal(
  provider: anchor.AnchorProvider,
  program: Program<Otc>,
  payer: Keypair,
  dealAddress: string,
  clusterOffset: number
): Promise<CrankResult> {
  const deal = new PublicKey(dealAddress);

  // Fetch deal to get controller and base_mint
  const dealAccount = await program.account.dealAccount.fetch(deal);

  const accounts = buildCrankDealAccounts(
    program.programId,
    payer.publicKey,
    deal,
    dealAccount.controller,  // NEW
    dealAccount.baseMint,    // NEW
    computationOffset,
    clusterOffset
  );

  // ... rest of execution ...
}
```

**Update executeCrankOffer:**
```typescript
export async function executeCrankOffer(
  provider: anchor.AnchorProvider,
  program: Program<Otc>,
  payer: Keypair,
  offerAddress: string,
  dealAddress: string,
  clusterOffset: number
): Promise<CrankResult> {
  const offer = new PublicKey(offerAddress);
  const deal = new PublicKey(dealAddress);

  // Fetch offer to get controller
  const offerAccount = await program.account.offerAccount.fetch(offer);
  // Fetch deal to get quote_mint
  const dealAccount = await program.account.dealAccount.fetch(deal);

  const accounts = buildCrankOfferAccounts(
    program.programId,
    payer.publicKey,
    deal,
    offer,
    offerAccount.controller,  // NEW
    dealAccount.quoteMint,    // NEW
    computationOffset,
    clusterOffset
  );

  // ... rest of execution ...
}
```

---

## Test Plan

### Test File: `tests/balance-integration.test.ts`

```typescript
describe("Balance Integration", () => {
  // Setup: Create mints, fund balances via top_up

  describe("create_deal with balance", () => {
    it("locks creator base balance when creating deal", async () => {
      // 1. top_up creator's base balance with 5000
      // 2. create_deal for 1000 base
      // 3. Verify balance: amount=5000, committed=1000
      // 4. Decrypt DealCreated blob, verify amount
      // 5. Decrypt BalanceUpdated blob, verify committed increased
    });

    it("fails if insufficient balance", async () => {
      // 1. top_up creator's base balance with 500
      // 2. Try create_deal for 1000 base
      // 3. Expect MPC to abort (or appropriate error)
    });
  });

  describe("submit_offer with balance", () => {
    it("locks MAX quote balance when submitting offer", async () => {
      // 1. Create deal: 1000 base @ 2.0 price
      // 2. top_up offeror's quote balance with 3000
      // 3. submit_offer for 500 base @ 2.0 price
      // 4. Expected quote commitment: 500 * 2.0 = 1000 (MAX, not amt_to_execute)
      // 5. Verify balance: amount=3000, committed=1000
      // 6. Verify OfferCreatedBlob does NOT contain amt_to_execute or quote_committed
    });

    it("uses deal price (not offer price) for MAX commitment", async () => {
      // 1. Create deal: 1000 base @ 2.0 price
      // 2. top_up offeror's quote balance with 3000
      // 3. submit_offer for 500 base @ 3.0 price (higher than deal)
      // 4. Expected quote commitment: 500 * 2.0 = 1000 (uses deal price!)
      // 5. Verify balance reflects 1000 committed, not 1500
    });

    it("commits full offer amount even if deal has limited capacity", async () => {
      // 1. Create deal: 200 base @ 2.0 price
      // 2. top_up offeror's quote balance with 3000
      // 3. submit_offer for 500 base @ 2.0 price
      // 4. Expected quote commitment: 500 * 2.0 = 1000 (full offer, not 200)
      // 5. amt_to_execute internally = 200, but offeror doesn't know
      // 6. Verify balance: committed=1000 (not 400)
    });
  });

  describe("crank_deal with balance", () => {
    it("releases creator commitment on full execution", async () => {
      // 1. Create deal: 1000 base, balance: amount=5000, committed=1000
      // 2. Submit filling offer
      // 3. Crank deal
      // 4. Verify: amount=5000, committed=0 (1000 was "spent" to offeror)
    });

    it("refunds unfilled base on partial execution", async () => {
      // 1. Create deal: 1000 base, allow_partial=true
      // 2. Submit offer for 600 base
      // 3. Crank deal (expired)
      // 4. Verify: 400 base refunded to amount, commitment released
    });

    it("refunds all base on failed deal (no fills)", async () => {
      // 1. Create deal: 1000 base, allow_partial=false
      // 2. No offers or price-mismatched offers
      // 3. Crank deal (expired)
      // 4. Verify: full 1000 base refunded, commitment=0
    });
  });

  describe("crank_offer with balance (CRITICAL)", () => {
    it("refunds quote tokens (not base) on full execution", async () => {
      // 1. Create deal: 1000 base @ 2.0
      // 2. Submit offer: 1000 base, MAX quote_committed = 1000 * 2.0 = 2000
      // 3. Crank deal (fully filled)
      // 4. Crank offer
      // 5. Verify: quote_executed = 2000, quote_refund = 0 (all quote used)
      // 6. Verify: executed_amt = 1000 (base received)
    });

    it("refunds excess quote on partial execution (deal capacity limited)", async () => {
      // 1. Create deal: 500 base @ 2.0
      // 2. Submit offer: 1000 base
      //    MAX quote_committed = 1000 * 2.0 = 2000 (full offer amount!)
      //    But only 500 base can execute (deal capacity)
      // 3. Crank deal (deal fully filled at 500)
      // 4. Crank offer
      // 5. Verify: quote_executed = 500 * 2.0 = 1000
      // 6. Verify: quote_refund = 2000 - 1000 = 1000 (excess refunded)
      // 7. Verify: executed_amt = 500 (base received)
    });

    it("refunds all quote on deal failure", async () => {
      // 1. Create deal: 1000 base @ 2.0, allow_partial=false
      // 2. Submit offer: 500 base (doesn't fill deal completely)
      //    MAX quote_committed = 500 * 2.0 = 1000
      // 3. Crank deal (expired, no execution due to allow_partial=false)
      // 4. Crank offer with deal_success=false
      // 5. Verify: quote_refund = 1000 (full refund)
      // 6. Verify: quote_executed = 0
      // 7. Verify: executed_amt = 0
    });

    it("correctly calculates quote using deal price", async () => {
      // 1. Create deal: 1000 base @ 2.0
      // 2. Submit offer: 500 base @ 3.0 (higher price)
      // 3. At submission: MAX quote_committed = 500 * 2.0 = 1000 (deal price!)
      // 4. Crank deal
      // 5. Crank offer
      // 6. Verify all math uses 2.0, not 3.0
    });

    it("offeror only learns execution details at settlement", async () => {
      // 1. Create deal: 300 base @ 2.0
      // 2. Submit offer: 500 base @ 2.0
      // 3. Verify: OfferCreatedBlob has NO amt_to_execute or quote_committed
      // 4. Crank deal
      // 5. Crank offer
      // 6. Verify: OfferSettledBlob reveals executed_amt=300, quote_paid, quote_refund
      // 7. This is the FIRST time offeror learns actual execution
    });
  });

  describe("edge cases", () => {
    it("handles zero execution amount", async () => {
      // Offer price below deal price
    });

    it("handles multiple offers with different fill amounts", async () => {
      // First offer takes some, second offer gets less
    });
  });
});
```

---

## Implementation Checklist

### Phase 1: Encrypted Struct Updates (`encrypted-ixs/src/lib.rs`)
- [ ] `OfferCreatedBlob` stays UNCHANGED (2 fields: price, amount) - privacy: don't reveal execution
- [ ] Update `OfferSettledBlob` to include `quote_paid` and rename `refund_amt` to `quote_refund` (3 → 4 fields)

Note: `OfferState` and `OfferAccount` remain unchanged (3 fields). `quote_committed` is derived from `offer.amount * deal.price` (MAX commitment) at settlement time.

### Phase 2: Encrypted Instructions
- [ ] Modify `create_deal` to accept balance reference, lock commitment
- [ ] Modify `submit_offer` to accept balance reference, calculate and lock quote commitment
- [ ] Modify `crank_deal` to accept balance reference, settle commitment
- [ ] Modify `crank_offer` to accept deal + balance reference, use deal price for quote calculation

### Phase 3: On-Chain Instructions
- [ ] Update `CreateDeal` accounts to include `creator_balance`
- [ ] Update `create_deal` handler to pass balance to ArgBuilder
- [ ] Update `CreateDealCallback` to handle balance state output
- [ ] Update `SubmitOffer` accounts to include `offeror_balance`
- [ ] Update `submit_offer` handler to pass balance to ArgBuilder
- [ ] Update `SubmitOfferCallback` to handle balance state output
- [ ] Update `CrankDeal` accounts to include `creator_balance`
- [ ] Update `crank_deal` handler to pass balance to ArgBuilder
- [ ] Update `CrankDealCallback` to handle balance state output
- [ ] Update `CrankOffer` accounts to include `offeror_balance`
- [ ] Update `crank_offer` handler to pass deal + balance to ArgBuilder
- [ ] Update `CrankOfferCallback` to handle balance state output

### Phase 4: Cranker
- [ ] Update `buildCrankDealAccounts` to derive and include creator balance
- [ ] Update `buildCrankOfferAccounts` to derive and include offeror balance
- [ ] Update `executeCrankDeal` to fetch deal for controller/mint
- [ ] Update `executeCrankOffer` to fetch offer/deal for controller/mint

### Phase 5: Tests
- [ ] Create `balance-integration.test.ts`
- [ ] Test create_deal balance locking
- [ ] Test submit_offer quote commitment calculation
- [ ] Test crank_deal balance settlement
- [ ] Test crank_offer quote refund calculation (critical fix)
- [ ] Test edge cases

### Phase 6: Event & Indexer Updates
- [ ] `OfferCreated` event: UNCHANGED (ciphertexts stays `[[u8; 32]; 2]`)
- [ ] Update `OfferSettled` event: ciphertexts `[[u8; 32]; 3]` → `[[u8; 32]; 4]`
- [ ] Update `events.rs` doc comments to reflect new OfferSettledBlob fields
- [ ] Update indexer types comments (storage is already flexible with `number[][]`)

### Phase 7: Frontend Updates
- [ ] `OfferCreatedBlob` decryption: UNCHANGED (still 2 fields - no execution info shown)
- [ ] Update `OfferSettledBlob` decryption to handle 4 fields (breaking change: field order/meaning changed)
- [ ] Display `quote_paid` and `quote_refund` from `OfferSettled` events

---

## Event Structure Updates

### OfferCreated Event (UNCHANGED)

**Current (`programs/otc/src/events.rs`) - NO CHANGES NEEDED:**
```rust
#[event]
pub struct OfferCreated {
    pub deal: Pubkey,
    pub offer: Pubkey,
    pub offer_index: u32,
    pub submitted_at: i64,
    pub encryption_key: [u8; 32],
    pub nonce: [u8; 16],
    /// Encrypted OfferCreatedBlob: price (u128), amount (u64)
    pub ciphertexts: [[u8; 32]; 2],  // UNCHANGED - privacy: don't reveal execution info
}
```

**Why unchanged:** The offeror should not learn `amt_to_execute` or `quote_committed` at submission time. They only submitted price and amount, and that's all they get back.

### OfferSettled Event (updated)

**Current:**
```rust
#[event]
pub struct OfferSettled {
    pub deal: Pubkey,
    pub offer: Pubkey,
    pub offer_index: u32,
    pub settled_at: i64,
    pub encryption_key: [u8; 32],
    pub nonce: [u8; 16],
    /// Encrypted OfferSettledBlob: outcome (u8), executed_amt (u64), refund_amt (u64)
    pub ciphertexts: [[u8; 32]; 3],
}
```

**Updated:**
```rust
#[event]
pub struct OfferSettled {
    pub deal: Pubkey,
    pub offer: Pubkey,
    pub offer_index: u32,
    pub settled_at: i64,
    pub encryption_key: [u8; 32],
    pub nonce: [u8; 16],
    /// Encrypted OfferSettledBlob: outcome (u8), executed_amt (u64), quote_paid (u64), quote_refund (u64)
    pub ciphertexts: [[u8; 32]; 4],  // Was 3, now 4
}
```

### Indexer Type Updates

The indexer uses `number[][]` for ciphertexts, which is flexible and handles any array size. Only the doc comments need updating for `OfferSettled`:

**`packages/indexer/src/types.ts`:**
```typescript
/**
 * OfferCreated event data (UNCHANGED)
 */
export type OfferCreatedData = {
  deal: PublicKey;
  offer: PublicKey;
  offer_index: number;
  submitted_at: BN;
  encryption_key: number[]; // [u8; 32]
  nonce: number[]; // [u8; 16]
  ciphertexts: number[][]; // [[u8; 32]; 2] - OfferCreatedBlob: price, amount (no execution info)
};

/**
 * OfferSettled event data (UPDATED)
 */
export type OfferSettledData = {
  deal: PublicKey;
  offer: PublicKey;
  offer_index: number;
  settled_at: BN;
  encryption_key: number[]; // [u8; 32]
  nonce: number[]; // [u8; 16]
  ciphertexts: number[][]; // [[u8; 32]; 4] - OfferSettledBlob: outcome, executed_amt, quote_paid, quote_refund
};
```

### Callback Handler Updates

**submit_offer_callback (UNCHANGED - still [[u8; 32]; 2]):**
```rust
emit!(OfferCreated {
    deal: deal.key(),
    offer: offer.key(),
    offer_index: offer.offer_index,
    submitted_at: offer.submitted_at,
    encryption_key: shared_blob.encryption_key,
    nonce: shared_blob.nonce.to_le_bytes(),
    ciphertexts: shared_blob.ciphertexts,  // [[u8; 32]; 2] - unchanged
});
```

**crank_offer_callback (UPDATED - now [[u8; 32]; 4]):**
```rust
emit!(OfferSettled {
    deal: offer.deal,
    offer: offer.key(),
    offer_index: offer.offer_index,
    settled_at: Clock::get()?.unix_timestamp,
    encryption_key: shared_blob.encryption_key,
    nonce: shared_blob.nonce.to_le_bytes(),
    ciphertexts: shared_blob.ciphertexts,  // Now [[u8; 32]; 4]
});
```

### Blob Field Order Reference

For frontend decryption, the exact field order in each blob:

| Blob | Field 0 | Field 1 | Field 2 | Field 3 |
|------|---------|---------|---------|---------|
| `DealCreatedBlob` | amount (u64) | price (u128) | - | - |
| `DealSettledBlob` | total_filled (u64) | creator_receives (u64) | creator_refund (u64) | - |
| `OfferCreatedBlob` | price (u128) | amount (u64) | - | - |
| `OfferSettledBlob` | outcome (u8) | executed_amt (u64) | quote_paid (u64) | quote_refund (u64) |
| `BalanceUpdatedBlob` | amount (u64) | committed_amount (u64) | - | - |

Note: `OfferCreatedBlob` intentionally has only 2 fields (privacy: don't reveal execution info at submission).

### Frontend Decryption Updates

**`OfferCreatedBlob` decryption (UNCHANGED - 2 fields):**
```typescript
const decrypted = cipher.decrypt(ciphertexts, nonce);
// Still just [price, amount] - no execution info revealed
const price = decrypted[0];
const amount = decrypted[1];
// Offeror does NOT learn amt_to_execute or quote_committed until settlement
```

**`OfferSettledBlob` decryption (now 4 fields):**
```typescript
const decrypted = cipher.decrypt(ciphertexts, nonce);
// Before: [outcome, executed_amt, refund_amt]
// After:  [outcome, executed_amt, quote_paid, quote_refund]
const outcome = decrypted[0];
const executedAmt = decrypted[1];
const quotePaid = decrypted[2];         // NEW (was refund_amt at this index)
const quoteRefund = decrypted[3];       // NEW (refund is now in quote units)
```

**Breaking change:** The old `refund_amt` (field 2) was in BASE units. The new `quote_refund` (field 3) is in QUOTE units. Existing frontend code parsing `OfferSettled` events will need updates.

---

## Notes

### Deriving quote_committed

We do NOT store `quote_committed` in `OfferState`. Instead, we derive the MAX commitment at settlement time:

```rust
// MAX commitment = offer.amount * deal.price (not amt_to_execute!)
let quote_committed = ((offer.amount as u128 * deal.price) >> 64) as u64;
```

This works because:
1. `offer.amount` is stored in OfferState (the full amount requested)
2. `deal.price` is stored in DealState (unchanged)
3. The calculation is deterministic (same result as at submission time)

**Why offer.amount (not amt_to_execute)?**
At submission, we lock the MAX possible quote commitment (`offer.amount * deal.price`). This is intentional:
- The offeror doesn't learn `amt_to_execute` at submission (privacy)
- We commit the maximum, then refund the difference at settlement
- At settlement: `quote_refund = quote_committed - quote_executed`

This keeps `OfferState` at 3 fields and preserves privacy about deal capacity.

### Callback Account Ordering

When updating callbacks with multiple accounts, ensure the `CallbackAccount` array order matches what the callback handler expects. The generated callback context will have accounts in the order specified.

### Event Emission

Each instruction now emits both domain events (DealCreated, OfferCreated, etc.) and BalanceUpdated events. The indexer should handle both and correlate them by transaction signature if needed.

### Migration Consideration

Since `OfferState` structure is unchanged (still 3 fields), existing offers remain compatible. The balance integration is additive:
- Old offers without balance accounts can still be cranked (balance updates skipped)
- New offers created after upgrade will have balance commitment tracking

For a clean cutover, consider requiring all open offers to be settled before enabling balance integration.

### Privacy Model Summary

The balance integration preserves privacy about deal capacity:

| When | What Offeror Knows | What's Hidden |
|------|-------------------|---------------|
| Before submission | Deal exists, expiry, mints | Deal amount, price, fill status |
| At submission | Their submitted price/amount | `amt_to_execute`, how much will actually fill |
| After submission | MAX quote locked (can infer from balance update) | Which portion will execute |
| At settlement | Full execution details (executed_amt, quote_paid, quote_refund) | Nothing - all revealed |

**Key insight:** By committing the MAX (full offer amount * deal price) and only revealing execution at settlement, we prevent offerors from learning about the deal's remaining capacity until the deal settles. This is analogous to sealed-bid auctions where bids are revealed only after bidding closes.
