# Vault & Encrypted Balance Implementation Plan

This document describes the implementation of centralized program vaults with encrypted balances, including commitment tracking for active escrows.

**References:**
- [003_token-vaults-and-balances.md](../ideation/003_token-vaults-and-balances.md) — Original vault/balance architecture
- [000_data-structures.md](../ideation/000_data-structures.md) — Deal and Offer structures
- [001_instruction-plan.md](./001_instruction-plan.md) — Instruction plan (to be extended)

---

## Design Decision: Committed Balances

Rather than moving funds from a balance account into deal/offer accounts on submission, we track **committed amounts** within the balance itself.

```
┌─────────────────────────────────────────────────────────┐
│  Balance Account                                        │
├─────────────────────────────────────────────────────────┤
│  seeds: ["balance", controller, mint]                   │
│  bump: u8                                               │
│  controller: Pubkey              ← derived ed25519      │
│  encryption_pubkey: [u8; 32]     ← derived x25519       │
│  mint: Pubkey                                           │
│  nonce: [u8; 16]                                        │
│  encrypted_balance: [u8; N]      ← Enc<Mxe, BalanceState> │
└─────────────────────────────────────────────────────────┘

BalanceState (encrypted):
{
  amount: u64,           // Total balance in vault
  committed_amount: u64, // Portion locked in active deals/offers
}

Available balance = amount - committed_amount
```

### Why Committed Amounts?

1. **Single source of truth** — User's funds live in one place per mint
2. **Capital efficiency** — No funds "stuck" in individual deal/offer accounts
3. **Simpler settlement** — Adjust numbers in MPC, no SPL transfers between accounts
4. **Atomic operations** — Commit/release happens in the same MPC call as deal/offer logic

### Balance Operations

| Operation | Effect on `amount` | Effect on `committed_amount` |
|-----------|-------------------|------------------------------|
| Deposit | +N | — |
| Withdraw | -N | — |
| Create deal (lock) | — | +N |
| Submit offer (lock) | — | +N |
| Crank (execute) | -N (to counterparty) | -N |
| Crank (refund) | — | -N |

---

## Account Structures

### Vault (per mint)

```rust
#[account]
pub struct Vault {
    pub bump: u8,
    pub mint: Pubkey,
}

// Seeds: ["vault", mint]
// Size: 8 + 1 + 32 = 41 bytes
```

The vault PDA owns an associated token account (ATA) that holds pooled tokens.

### Balance (per user per mint)

```rust
#[account]
pub struct Balance {
    pub bump: u8,
    pub controller: Pubkey,        // Derived ed25519 (owner/signer)
    pub encryption_pubkey: [u8; 32], // Derived x25519 (for events)
    pub mint: Pubkey,
    pub nonce: [u8; 16],
    pub encrypted_state: [u8; 48], // Enc<Mxe, BalanceState> (two u64s + padding)
}

// Seeds: ["balance", controller, mint]
// Size: 8 + 1 + 32 + 32 + 32 + 16 + 48 = 169 bytes
```

### BalanceState (encrypted, inside MPC)

```rust
#[derive(Copy, Clone)]
pub struct BalanceState {
    pub amount: u64,
    pub committed_amount: u64,
}
```

---

## Instructions Overview

### Vault Management

| Instruction | Purpose |
|-------------|---------|
| `initialize_vault` | Create vault PDA + ATA for a mint (permissionless, once per mint) |

### Balance Management

| Instruction | Purpose | MPC? |
|-------------|---------|------|
| `initialize_balance` | Create balance account for user+mint | No |
| `deposit` | SPL transfer to vault, credit encrypted balance | Yes |
| `withdraw` | Verify available balance, debit, SPL transfer out | Yes |

### Deal/Offer Integration

Existing instructions from `001_instruction-plan.md` will be modified to:
1. Accept balance account as input
2. Read/update `committed_amount` in MPC
3. Verify `amount - committed_amount >= required_lock`

---

## Instruction Details

### 1. initialize_vault

**Purpose:** Create a vault for a token mint. Permissionless, idempotent.

**Accounts:**
- `payer` — Signer, pays for account creation
- `vault` — PDA `["vault", mint]`, to be initialized
- `vault_ata` — ATA owned by vault PDA
- `mint` — Token mint
- `token_program`, `associated_token_program`, `system_program`

**Actions:**
1. Initialize vault PDA
2. Create ATA owned by vault PDA

**No MPC needed** — purely on-chain account setup.

---

### 2. initialize_balance

**Purpose:** Create a balance account for a user+mint combination.

**Accounts:**
- `payer` — Signer, pays for account creation
- `controller` — Signer, derived ed25519 pubkey
- `balance` — PDA `["balance", controller, mint]`, to be initialized
- `mint` — Token mint
- `system_program`

**Instruction Data:**
- `encryption_pubkey: [u8; 32]` — User's derived x25519 pubkey

**Actions:**
1. Initialize balance PDA with zero encrypted state
2. Store controller, encryption_pubkey, mint

**No MPC needed** — encrypted state initialized to zeros (MPC will handle first deposit).

---

### 3. deposit

**Purpose:** Transfer SPL tokens to vault, credit user's encrypted balance.

**Flow:**
```
User Wallet                 Vault ATA              Balance Account
    │                           │                        │
    │── SPL transfer ──────────►│                        │
    │   (plaintext amount)      │                        │
    │                           │                        │
    │── queue_deposit() ───────────────────────────────►│
    │                           │      ┌───────────────┐ │
    │                           │      │ MPC: add amt  │ │
    │                           │      │ to balance    │ │
    │                           │      └───────────────┘ │
    │                           │                        │
    │◄────────────────────────────── DepositEvent ──────│
```

**Accounts:**
- `payer` — Signer
- `controller` — Signer (derived ed25519)
- `user_ata` — User's token account (source)
- `vault` — Vault PDA
- `vault_ata` — Vault's token account (destination)
- `balance` — User's balance account (mutable)
- `mint` — Token mint
- Standard Arcium accounts
- `token_program`

**Instruction Data:**
- `amount: u64` — Deposit amount (plaintext, visible on-chain)
- `computation_offset: u64`

**Actions:**
1. Transfer `amount` from user_ata to vault_ata (SPL transfer)
2. Queue MPC computation to add `amount` to encrypted balance

**Encrypted Instruction: `deposit`**
```rust
#[instruction]
pub fn deposit(
    balance_state: Enc<Mxe, &BalanceState>,
    amount: u64,  // Plaintext (already public from SPL transfer)
) -> Enc<Mxe, BalanceState> {
    let state = *(balance_state.to_arcis());

    let new_state = BalanceState {
        amount: state.amount + amount,
        committed_amount: state.committed_amount,
    };

    balance_state.owner.from_arcis(new_state)
}
```

---

### 4. withdraw

**Purpose:** Verify available balance in MPC, debit, transfer SPL tokens out.

**Flow:**
```
Balance Account             Vault ATA              User Wallet
    │                           │                        │
    │◄── queue_withdraw() ──────│                        │
    │    (encrypted amount)     │                        │
    │                           │                        │
    │  ┌───────────────────┐    │                        │
    │  │ MPC: verify avail │    │                        │
    │  │ >= withdraw_amt   │    │                        │
    │  │ debit balance     │    │                        │
    │  └───────────────────┘    │                        │
    │                           │                        │
    │── callback ──────────────►│── SPL transfer ───────►│
    │   (approved_amount)       │   (to destination)     │
```

**Accounts:**
- `payer` — Signer
- `controller` — Signer (derived ed25519, proves ownership)
- `balance` — User's balance account (mutable)
- `vault` — Vault PDA
- `vault_ata` — Vault's token account (source)
- `destination_ata` — Recipient's token account
- `mint` — Token mint
- Standard Arcium accounts
- `token_program`

**Instruction Data:**
- `computation_offset: u64`
- `nonce: u128`
- `encrypted_amount: [u8; 32]` — Shared-encrypted withdrawal amount

**Actions:**
1. Queue MPC computation to verify and debit
2. Callback performs SPL transfer if approved

**Encrypted Instruction: `withdraw`**
```rust
#[derive(Copy, Clone)]
pub struct WithdrawInput {
    amount: u64,
}

#[derive(Copy, Clone)]
pub struct WithdrawOutput {
    approved: bool,
    amount: u64,  // Plaintext output for callback to transfer
}

#[instruction]
pub fn withdraw(
    balance_state: Enc<Mxe, &BalanceState>,
    input: Enc<Shared, WithdrawInput>,
    _caller: Shared,  // For nonce
) -> (Enc<Mxe, BalanceState>, WithdrawOutput) {
    let state = *(balance_state.to_arcis());
    let withdraw = input.to_arcis();

    let available = state.amount - state.committed_amount;
    let approved = withdraw.amount <= available;

    let new_state = if approved {
        BalanceState {
            amount: state.amount - withdraw.amount,
            committed_amount: state.committed_amount,
        }
    } else {
        state  // No change if rejected
    };

    let output = WithdrawOutput {
        approved,
        amount: if approved { withdraw.amount } else { 0 },
    };

    (balance_state.owner.from_arcis(new_state), output)
}
```

**Callback:** If `output.approved`, transfer `output.amount` from vault_ata to destination_ata using vault PDA as signer.

---

## Integration with Deals/Offers

The existing deal/offer instructions will be modified to include balance accounts and update `committed_amount`.

### create_deal (modified)

**Additional accounts:**
- `creator_balance` — Creator's balance account for the locked asset

**MPC changes:**
```rust
// Inside create_deal MPC:
let balance = *(creator_balance_state.to_arcis());
let available = balance.amount - balance.committed_amount;

// For SELL deals: lock base asset
// For BUY deals: lock quote asset (amount * price)
let lock_amount = if side == SELL { deal_amount } else { total };

require!(available >= lock_amount, "Insufficient balance");

let new_balance = BalanceState {
    amount: balance.amount,
    committed_amount: balance.committed_amount + lock_amount,
};
```

### submit_offer (modified)

**Additional accounts:**
- `offeror_balance` — Offeror's balance account for the locked asset

**MPC changes:**
```rust
// Inside submit_offer MPC:
let balance = *(offeror_balance_state.to_arcis());
let available = balance.amount - balance.committed_amount;

// For BUY deals (offeror sells base): lock base asset
// For SELL deals (offeror buys base): lock quote asset
let lock_amount = if deal_side == BUY { offer_amount } else { offer_amount * offer_price };

require!(available >= lock_amount, "Insufficient balance");

let new_balance = BalanceState {
    amount: balance.amount,
    committed_amount: balance.committed_amount + lock_amount,
};
```

### crank_deal / crank_offer (modified)

**Additional accounts:**
- `creator_base_balance` — Creator's balance for base asset
- `creator_quote_balance` — Creator's balance for quote asset
- (similar for offeror in crank_offer)

**MPC changes:**
```rust
// Inside crank MPC:
// 1. Release committed amounts
// 2. Transfer executed amounts between balances
// 3. Refund unused portions

// Example for successful BUY deal execution:
// Creator: committed_quote -= executed_total, amount_quote -= executed_total, amount_base += executed_base
// Offeror: committed_base -= offer_amount, amount_base -= executed_base, amount_quote += executed_total
```

---

## Implementation Order

### Phase 1: Vault & Balance Infrastructure
1. `Vault` account structure
2. `Balance` account structure
3. `initialize_vault` instruction
4. `initialize_balance` instruction
5. `deposit` instruction + MPC
6. `withdraw` instruction + MPC

### Phase 2: Deal/Offer Integration
7. Modify `create_deal` to accept balance, update committed_amount
8. Modify `submit_offer` to accept balance, update committed_amount
9. Modify `crank_deal` to settle balances
10. Modify `crank_offer` to settle balances

### Phase 3: Testing
11. Unit tests for deposit/withdraw
12. Integration tests for full deal flow with balances
13. Edge cases: insufficient balance, partial fills, expired deals

---

## Open Questions

1. **First deposit initialization**: Should `deposit` auto-initialize the balance account if it doesn't exist, or require separate `initialize_balance` call?

2. **Withdrawal destination**: Should withdrawals only go to the controller's ATA, or allow arbitrary destinations?

3. **Multiple balances in one MPC call**: Can we read/write multiple balance accounts in a single encrypted instruction (for settlement)?

4. **Balance closure**: When can users close balance accounts? Need to verify both `amount == 0` and `committed_amount == 0`.
