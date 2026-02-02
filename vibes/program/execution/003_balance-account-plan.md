# Balance Account Implementation Plan

This document describes the implementation of user balance accounts with encrypted state, including initialization and top-up instructions, plus full indexer and frontend integration.

**References:**
- [002_vault-and-balance-plan.md](./002_vault-and-balance-plan.md) — Full vault/balance architecture (future)
- [001_deterministic-encryption-keys.md](../ideation/001_deterministic-encryption-keys.md) — Key derivation
- Existing patterns: `DealAccount`, `OfferAccount`, `CounterState`

---

## Scope

This phase implements **Balance accounts only** — no vaults, no SPL transfers yet.

| In Scope | Out of Scope (Phase 2) |
|----------|------------------------|
| `BalanceState` encrypted struct | `Vault` account + ATA |
| `BalanceAccount` structure | SPL token transfers |
| `top_up` instruction (init_if_needed + add amount) | `withdraw` instruction |
| `BalanceUpdated` event with encrypted blob | Deal/Offer integration |
| Indexer handler + migration | Committed amount logic |
| Frontend hook with live updates | |
| Tests | |

---

## Account Structure

### BalanceAccount (per user per mint)

```
┌─────────────────────────────────────────────────────────┐
│  Balance Account                                        │
├─────────────────────────────────────────────────────────┤
│  seeds: ["balance", controller, mint]                   │
│  bump: u8                                               │
│  controller: Pubkey              ← derived ed25519      │
│  encryption_pubkey: [u8; 32]     ← derived x25519       │
│  mint: Pubkey                                           │
│  nonce: [u8; 16]                 ← MXE encryption nonce │
│  ciphertexts: [[u8; 32]; 2]      ← Enc<Mxe, BalanceState> │
└─────────────────────────────────────────────────────────┘
```

**Rust definition:**

```rust
#[account]
#[derive(InitSpace)]
pub struct BalanceAccount {
    // === MXE-encrypted (raw bytes) - MUST BE FIRST for stable offsets ===
    pub nonce: [u8; 16],              // offset 8 (after discriminator)
    pub ciphertexts: [[u8; 32]; 2],   // offset 24

    // === Public (plaintext) ===
    pub controller: Pubkey,           // Derived ed25519 (signing authority)
    pub encryption_pubkey: [u8; 32],  // Derived x25519 (for event routing)
    pub mint: Pubkey,
    pub bump: u8,
}

// Size: 8 + 16 + 64 + 32 + 32 + 32 + 1 = 185 bytes

pub const BALANCE_CIPHERTEXT_OFFSET: u32 = 24;  // discriminator (8) + nonce (16)
pub const BALANCE_CIPHERTEXT_LENGTH: u32 = 64;  // 2 x 32 bytes
```

### BalanceState (encrypted, inside MPC)

```rust
#[derive(Copy, Clone)]
pub struct BalanceState {
    pub amount: u64,           // Total balance
    pub committed_amount: u64, // Portion locked in active deals/offers (always 0 for now)
}
```

**Available balance** = `amount - committed_amount`

For this phase, `committed_amount` will always be 0. Future deal/offer integration will use it.

### BalanceUpdatedBlob (encrypted, emitted in event)

```rust
#[derive(Copy, Clone)]
pub struct BalanceUpdatedBlob {
    pub amount: u64,           // New total balance
    pub committed_amount: u64, // Current committed amount
}
```

---

## Instructions

Single `top_up` instruction handles both account creation (via `init_if_needed`) and adding amounts. An `is_new` flag tells the MPC whether to start from zero or read existing state.

### top_up

**Purpose:** Initialize balance account if needed, then add amount to encrypted balance.

**Behavior:**
- If balance account doesn't exist → create it, MPC starts from zero state
- If balance account exists → MPC reads existing state and adds amount

**Flow:**
```
User                           Balance Account
  │                                  │
  │── top_up(amount) ───────────────►│
  │   (plaintext amount)             │
  │                                  │
  │                    ┌─────────────┴─────────────┐
  │                    │ init_if_needed            │
  │                    │ (create if new)           │
  │                    └─────────────┬─────────────┘
  │                                  │
  │                    ┌─────────────┴─────────────┐
  │                    │ MPC:                      │
  │                    │ if is_new: start from 0  │
  │                    │ else: read existing      │
  │                    │ add amount to balance    │
  │                    └─────────────┬─────────────┘
  │                                  │
  │◄─────────── BalanceUpdated ──────│ (encrypted: new amount)
```

**Accounts:**

```rust
#[derive(Accounts)]
#[instruction(controller: Pubkey)]
pub struct TopUp<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Derived ed25519 keypair (proves ownership)
    #[account(constraint = controller_signer.key() == controller)]
    pub controller_signer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = 8 + BalanceAccount::INIT_SPACE,
        seeds = [b"balance", controller.as_ref(), mint.key().as_ref()],
        bump,
    )]
    pub balance: Account<'info, BalanceAccount>,

    pub mint: Account<'info, Mint>,

    // Arcium accounts (queue_computation_accounts macro)
    // ...

    pub system_program: Program<'info, System>,
}
```

**Instruction Data:**

| Field | Type | Description |
|-------|------|-------------|
| `controller` | `Pubkey` | Derived ed25519 pubkey |
| `encryption_pubkey` | `[u8; 32]` | Derived x25519 pubkey |
| `computation_offset` | `u64` | Arcium computation offset |
| `nonce` | `u128` | Nonce for Shared output encryption |
| `amount` | `u64` | Amount to add (plaintext) |

**Handler:**

```rust
pub fn handler(
    ctx: Context<TopUp>,
    controller: Pubkey,
    encryption_pubkey: [u8; 32],
    computation_offset: u64,
    nonce: u128,
    amount: u64,
) -> Result<()> {
    let balance = &mut ctx.accounts.balance;

    // Detect if account was just created (controller will be default/zeroed)
    let is_new = balance.controller == Pubkey::default();

    if is_new {
        // Initialize plaintext fields for new account
        balance.controller = controller;
        balance.encryption_pubkey = encryption_pubkey;
        balance.mint = ctx.accounts.mint.key();
        balance.bump = ctx.bumps.balance;
        // nonce and ciphertexts stay zeroed - callback will set them
    } else {
        // Verify controller matches for existing account
        require!(
            balance.controller == controller,
            ErrorCode::ControllerMismatch
        );
    }

    // Get existing nonce (0 for new accounts)
    let existing_nonce = u128::from_le_bytes(balance.nonce);

    // Build args for MPC
    let args = ArgBuilder::new()
        // Enc<Mxe, &BalanceState> - existing state (garbage for new, valid for existing)
        .plaintext_u128(existing_nonce)
        .account(
            balance.key(),
            BALANCE_CIPHERTEXT_OFFSET,
            BALANCE_CIPHERTEXT_LENGTH,
        )
        // Shared marker for output
        .x25519_pubkey(encryption_pubkey)
        .plaintext_u128(nonce)
        // Plaintext amount to add
        .plaintext_u64(amount)
        // Is this a new account? (MPC will ignore garbage ciphertext if true)
        .plaintext_bool(is_new)
        .build();

    queue_computation(ctx.accounts, computation_offset, args, None, ...)?;
    Ok(())
}
```

**Encrypted instruction:**

```rust
#[instruction]
pub fn top_up(
    balance_state: Enc<Mxe, &BalanceState>,
    owner: Shared,
    amount: u64,
    is_new: bool,
) -> (Enc<Mxe, BalanceState>, Enc<Shared, BalanceUpdatedBlob>) {
    // If new account, start from zero; otherwise read existing state
    let state = if is_new {
        BalanceState {
            amount: 0,
            committed_amount: 0,
        }
    } else {
        *(balance_state.to_arcis())
    };

    let new_state = BalanceState {
        amount: state.amount + amount,
        committed_amount: state.committed_amount,
    };

    let blob = BalanceUpdatedBlob {
        amount: new_state.amount,
        committed_amount: new_state.committed_amount,
    };

    (balance_state.owner.from_arcis(new_state), owner.from_arcis(blob))
}
```

**Callback:**

```rust
#[arcium_callback(encrypted_ix = "top_up")]
pub fn callback_handler(
    ctx: Context<TopUpCallback>,
    output: SignedComputationOutputs<TopUpOutput>,
) -> Result<()> {
    // Output type: (Enc<Mxe, BalanceState>, Enc<Shared, BalanceUpdatedBlob>)
    let tuple_output = output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    )?;

    let mxe_state = &tuple_output.field_0;
    let shared_blob = &tuple_output.field_1;

    // Update balance with new encrypted state
    let balance = &mut ctx.accounts.balance;
    balance.nonce = mxe_state.nonce.to_le_bytes();
    balance.ciphertexts = mxe_state.ciphertexts;

    // Emit event with encrypted blob for indexer
    emit!(BalanceUpdated {
        balance: balance.key(),
        controller: balance.controller,
        mint: balance.mint,
        encryption_key: shared_blob.encryption_key,
        nonce: shared_blob.nonce.to_le_bytes(),
        ciphertexts: shared_blob.ciphertexts,
    });

    Ok(())
}
```

---

## Events

```rust
#[event]
pub struct BalanceUpdated {
    // Public metadata (for indexing)
    pub balance: Pubkey,
    pub controller: Pubkey,
    pub mint: Pubkey,

    // Encrypted blob (decryptable by owner only)
    pub encryption_key: [u8; 32],       // Owner's x25519 pubkey (echoed back)
    pub nonce: [u8; 16],
    pub ciphertexts: [[u8; 32]; 2],     // BalanceUpdatedBlob: amount (u64), committed_amount (u64)
}
```

---

## Indexer Integration

### Database Migration

**File:** `supabase/migrations/YYYYMMDDHHMMSS_add_balances.sql`

```sql
-- Balances table
CREATE TABLE balances (
  address TEXT PRIMARY KEY,              -- Balance account pubkey (base58)
  controller TEXT NOT NULL,              -- Controller pubkey (for filtering)
  mint TEXT NOT NULL,                    -- Token mint

  -- Latest encrypted state (from most recent BalanceUpdated event)
  encryption_key BYTEA NOT NULL,         -- [u8; 32] owner's x25519 pubkey
  nonce BYTEA NOT NULL,                  -- [u8; 16]
  ciphertexts BYTEA NOT NULL,            -- [[u8; 32]; 2] = 64 bytes (amount, committed_amount)

  -- Indexing metadata
  last_signature TEXT NOT NULL,          -- Most recent tx signature
  slot BIGINT NOT NULL,                  -- Slot of last update
  indexed_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(controller, mint)               -- One balance per controller per mint
);

-- Indexes for efficient queries
CREATE INDEX idx_balances_controller ON balances(controller);
CREATE INDEX idx_balances_mint ON balances(mint);
CREATE INDEX idx_balances_encryption_key ON balances(encryption_key);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE balances;

-- RLS policies (read-only for frontend)
ALTER TABLE balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "balances_select_public" ON balances
  FOR SELECT TO anon, authenticated USING (true);
```

### Event Handler

**File:** `packages/indexer/src/handler.ts` (add to existing)

```typescript
case "BalanceUpdated":
  await storage.upsertBalanceUpdated(event as EventWithContext<BalanceUpdatedData>);
  break;
```

### Storage Function

**File:** `packages/indexer/src/storage/supabase.ts` (add to existing)

```typescript
async upsertBalanceUpdated(event: EventWithContext<BalanceUpdatedData>): Promise<void> {
  const { data, context } = event;

  const { error } = await this.client
    .from("balances")
    .upsert({
      address: pubkeyToBase58(data.balance),
      controller: pubkeyToBase58(data.controller),
      mint: pubkeyToBase58(data.mint),
      encryption_key: bytesToBytea(data.encryption_key),
      nonce: bytesToBytea(data.nonce),
      ciphertexts: bytesToBytea(data.ciphertexts.flat()),
      last_signature: context.signature,
      slot: context.slot,
    }, { onConflict: 'address' });

  if (error) throw error;
}
```

### Types

**File:** `packages/indexer/src/types.ts` (add to existing)

```typescript
export type BalanceUpdatedData = {
  balance: PublicKey;
  controller: PublicKey;
  mint: PublicKey;
  encryption_key: number[];      // [u8; 32]
  nonce: number[];               // [u8; 16]
  ciphertexts: number[][];       // [[u8; 32]; 2]
};
```

---

## Frontend Integration

### Hook: useMyBalances

**File:** `frontend/app/otc/_hooks/useMyBalances.ts`

```typescript
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../_lib/supabase";
import { useDerivedKeysContext } from "../_contexts/DerivedKeysContext";
import { bytesToHex } from "../_lib/utils";
import { decryptBalanceBlob } from "../_lib/encryption";

export interface Balance {
  address: string;
  mint: string;
  amount: bigint;
  committedAmount: bigint;
}

export function useMyBalances() {
  const { derivedKeys } = useDerivedKeysContext();
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!derivedKeys) {
      setBalances([]);
      setLoading(false);
      return;
    }

    try {
      const userPubKeyHex = "\\x" + bytesToHex(derivedKeys.encryption.publicKey);

      const { data, error: fetchError } = await supabase
        .from("balances")
        .select("*")
        .eq("encryption_key", userPubKeyHex);

      if (fetchError) throw fetchError;

      // Decrypt each balance
      const decrypted = (data || []).map((row) => {
        const { amount, committedAmount } = decryptBalanceBlob(
          derivedKeys.encryption.privateKey,
          row.nonce,
          row.ciphertexts
        );

        return {
          address: row.address,
          mint: row.mint,
          amount,
          committedAmount,
        };
      });

      setBalances(decrypted);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [derivedKeys]);

  useEffect(() => {
    fetchBalances();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("my-balances-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "balances" },
        () => {
          fetchBalances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchBalances]);

  return { balances, loading, error, refetch: fetchBalances };
}
```

### Decryption Helper

**File:** `frontend/app/otc/_lib/encryption.ts` (add to existing)

```typescript
export function decryptBalanceBlob(
  privateKey: Uint8Array,
  nonce: Uint8Array,
  ciphertexts: Uint8Array
): { amount: bigint; committedAmount: bigint } {
  const mxePublicKey = getMxePublicKey(); // Get from context or cache
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);

  // Split ciphertexts into two 32-byte chunks
  const ct0 = ciphertexts.slice(0, 32);
  const ct1 = ciphertexts.slice(32, 64);

  const decrypted = cipher.decrypt([ct0, ct1], nonce);

  return {
    amount: decrypted[0],
    committedAmount: decrypted[1],
  };
}
```

---

## Files to Create/Modify

### New Files

| File | Contents |
|------|----------|
| `programs/otc/src/state/balance.rs` | `BalanceAccount` struct + constants |
| `programs/otc/src/instructions/top_up.rs` | `TopUp` accounts, handler, callback |
| `tests/balance.test.ts` | Balance tests |
| `supabase/migrations/YYYYMMDDHHMMSS_add_balances.sql` | Balances table |
| `frontend/app/otc/_hooks/useMyBalances.ts` | Frontend hook |

### Modified Files

| File | Changes |
|------|---------|
| `programs/otc/src/state/mod.rs` | Add `mod balance; pub use balance::*;` |
| `programs/otc/src/instructions/mod.rs` | Add `mod top_up; pub use top_up::*;` |
| `programs/otc/src/lib.rs` | Add 3 instructions: `top_up`, `init_top_up_comp_def`, `top_up_callback` |
| `programs/otc/src/events.rs` | Add `BalanceUpdated` event |
| `encrypted-ixs/src/lib.rs` | Add `BalanceState`, `BalanceUpdatedBlob` structs + `top_up` instruction |
| `packages/indexer/src/handler.ts` | Add `BalanceUpdated` case |
| `packages/indexer/src/storage/supabase.ts` | Add `upsertBalanceUpdated` function |
| `packages/indexer/src/types.ts` | Add `BalanceUpdatedData` type |
| `frontend/app/otc/_lib/encryption.ts` | Add `decryptBalanceBlob` helper |

---

## Test Plan

### Test: `balance.test.ts`

```typescript
describe("Balance", () => {
  it("creates a new balance with initial top-up", async () => {
    // 1. Derive controller + encryption keys
    // 2. Call top_up with amount=1000 (account doesn't exist yet)
    // 3. Wait for callback
    // 4. Fetch balance account
    // 5. Decrypt ciphertexts using x25519 shared secret
    // 6. Verify amount=1000, committed_amount=0
  });

  it("tops up an existing balance", async () => {
    // 1. top_up(1000) - creates account
    // 2. top_up(500) - adds to existing
    // 3. Wait for callback
    // 4. Decrypt and verify amount=1500
  });

  it("accumulates multiple top-ups", async () => {
    // 1. top_up(1000)
    // 2. top_up(500)
    // 3. top_up(250)
    // 4. Decrypt and verify amount=1750
  });

  it("fails when controller signer doesn't match", async () => {
    // 1. top_up with controller A (creates account)
    // 2. Try to top_up with controller B signing
    // 3. Expect ConstraintViolation error
  });

  it("supports multiple mints per controller", async () => {
    // 1. top_up mint A with 1000 (same controller)
    // 2. top_up mint B with 2000 (same controller)
    // 3. Verify both balances exist with correct amounts
  });

  it("emits BalanceUpdated event with encrypted blob", async () => {
    // 1. top_up(1000)
    // 2. Capture BalanceUpdated event
    // 3. Verify event has correct balance/controller/mint
    // 4. Decrypt blob and verify amount=1000
  });

  it("creates balance with zero amount", async () => {
    // 1. top_up(0) - creates account with zero balance
    // 2. Verify account exists with amount=0
    // 3. top_up(500) - adds to zero balance
    // 4. Verify amount=500
  });
});
```

---

## Implementation Order

1. **Encrypted structs** — `BalanceState`, `BalanceUpdatedBlob`, `top_up` in `encrypted-ixs/`
2. **Account struct** — `BalanceAccount` + constants in `programs/otc/src/state/`
3. **Events** — `BalanceUpdated` in `programs/otc/src/events.rs`
4. **top_up instruction** — Accounts, handler, callback
5. **Wire up in lib.rs** — Add 3 instruction handlers
6. **Tests** — Write and run `balance.test.ts`
7. **Migration** — Create balances table
8. **Indexer** — Add handler + storage function
9. **Frontend hook** — `useMyBalances` with realtime subscription

---

## Notes

- The `committed_amount` field exists but is unused in this phase. It will be used when deals/offers lock funds.
- No actual token transfers happen — this is just encrypted bookkeeping. Phase 2 will add vaults and SPL integration.
- The `is_new` flag tells the MPC whether to start from zero or read existing state. This avoids reading garbage data from freshly-created accounts.
- Controller signer is required — only the owner can top up their balance.
- The indexer uses a simple upsert on `address` — always overwrites with the latest event data.
