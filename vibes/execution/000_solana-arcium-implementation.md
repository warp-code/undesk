# Private OTC — Solana + Arcium Implementation

This document maps the spec from `data-structures.md` to concrete Solana account structures and Arcium MPC operations.

---

## Arcium Encryption Model

### Two Encryption Modes

| Mode | Type | Who Can Decrypt | Use Case |
|------|------|-----------------|----------|
| **MXE** | `Enc<Mxe, T>` | Only MPC cluster | Operational state for computations |
| **Shared** | `Enc<Shared, T>` | Client + MPC | User inputs, user-facing outputs |

### Storage Format

Each encrypted field becomes a **32-byte ciphertext**, regardless of underlying type:
- `u8`, `u64`, `u128`, `bool` → 32 bytes each
- `[u8; 32]` (Pubkey as array) → 32 × 32 = 1024 bytes ❌
- `(u128, u128)` (Pubkey as two halves) → 2 × 32 = 64 bytes ✓

**On-chain storage is just bytes**. The struct interpretation is defined by the Arcis circuit.

```rust
// On-chain account stores raw bytes
pub nonce: u128,
pub ciphertexts: [u8; N],  // N = field_count × 32

// Arcis circuit defines the struct layout
struct MyEncryptedData {
    field_a: u64,   // ciphertexts[0..32]
    field_b: u128,  // ciphertexts[32..64]
    // ...
}
```

### Re-encryption (Sealing)

MPC can re-encrypt data from MXE-encrypted to Shared-encrypted for a specific user:

```rust
#[instruction]
pub fn create_deal(
    deal_data: Enc<Shared, DealInput>,  // Creator's encrypted input
    creator: Shared,                     // Marker with creator's x25519 pubkey
) -> (Enc<Mxe, DealState>, Enc<Shared, DealCreatedBlob>) {
    let input = deal_data.to_arcis();

    // Store as MXE-encrypted (for future MPC operations)
    // Note: Mxe::get() returns the MXE owner, so from_arcis produces Enc<Mxe, T>
    let state = Mxe::get().from_arcis(DealState { ... });

    // Re-encrypt confirmation to creator's key (for event)
    // Note: creator is Shared, so from_arcis produces Enc<Shared, T>
    let blob = creator.from_arcis(DealCreatedBlob { ... });

    (state, blob)
}
```

---

## Encryption Flow

### Deal Creation
```
Creator                         MPC                           On-chain
   |                             |                               |
   |-- x25519 pubkey ----------->|                               |
   |-- Enc<Shared, DealInput> -->|                               |
   |                             |                               |
   |                             |-- decrypt input               |
   |                             |-- store Enc<Mxe, DealState> ->| (account)
   |                             |-- seal to creator's key       |
   |                             |-- emit event ----------------->| (log)
   |                             |                               |
   |<-- DealCreated event (encrypted_blob) ----------------------|
   |-- decrypt blob with x25519 private key                      |
```

### Offer Submission
```
Offeror                         MPC                           On-chain
   |                             |                               |
   |-- x25519 pubkey ----------->|                               |
   |-- Enc<Shared, OfferInput> ->|                               |
   |                             |                               |
   |                             |-- decrypt input               |
   |                             |-- load Enc<Mxe, DealState> <--| (account)
   |                             |-- compare prices (MPC)        |
   |                             |-- update fill_amount if pass  |
   |                             |-- store Enc<Mxe, OfferState> ->|
   |                             |-- seal to offeror's key       |
   |                             |-- emit event ----------------->|
   |                             |                               |
   |<-- OfferCreated event (encrypted_blob) ---------------------|
```

### Settlement
```
Crank                           MPC                           On-chain
   |                             |                               |
   |-- trigger settlement ------>|                               |
   |                             |                               |
   |                             |-- load deal + all offers <----|
   |                             |-- (FIFO already computed at submission)
   |                             |-- for each offer:             |
   |                             |     execute transfer if amt_to_execute > 0
   |                             |     seal result to offeror    |
   |                             |     emit OfferSettled         |
   |                             |-- seal summary to creator     |
   |                             |-- emit DealSettled            |
```

**Settlement triggers:**
1. **Immediate** — When `deal.fill_amount >= deal.amount` (detected at offer submission)
2. **At expiry** — Crank calls settle; if `allow_partial && fill_amount > 0`, execute; else refund all

---

## Account Structures

### DealAccount

PDA seeds: `["deal", create_key.key()]`

```rust
pub struct DealAccount {
    // === Public (plaintext) ===
    pub create_key: Pubkey,       // Ephemeral signer (prevents front-running, enables pre-funding)
    pub encryption_pubkey: [u8; 32], // Creator's x25519 pubkey (for event routing)
    pub base_mint: Pubkey,        // Token being bought/sold
    pub quote_mint: Pubkey,       // Token used for pricing/payment
    pub side: u8,                 // BUY = 0, SELL = 1
    pub expires_at: i64,          // Unix timestamp
    pub status: u8,               // OPEN = 0, EXECUTED = 1, EXPIRED = 2
    pub allow_partial: bool,      // Execute partial fills at expiry?
    pub num_offers: u32,          // Counter, incremented by MPC at offer submission
    pub bump: u8,

    // === MXE-encrypted (raw bytes) ===
    pub nonce: u128,              // 16 bytes
    pub ciphertexts: [u8; 128],   // 4 fields × 32 bytes
}
```

**Encrypted fields** (interpreted by Arcis circuit):
```rust
struct EncryptedDealState {
    // Operational data
    amount: u64,                  // Base asset amount
    price: u64,                   // Threshold price
    fill_amount: u64,             // Running sum of amt_to_execute across offers

    // Settlement tracking
    num_settled: u32,             // Incremented as each offer is settled
}
// Total: 4 ciphertexts × 32 bytes = 128 bytes
```

**Account closure:** When `num_settled == num_offers` and creator is settled, deal account can be closed.

---

### OfferAccount

PDA seeds: `["offer", deal.key(), create_key.key()]`

```rust
pub struct OfferAccount {
    // === Public ===
    pub create_key: Pubkey,       // Ephemeral signer (prevents front-running, enables pre-funding)
    pub encryption_pubkey: [u8; 32], // Offeror's x25519 pubkey (for event routing)
    pub deal: Pubkey,
    pub offer_index: u32,         // FIFO sequence, assigned by MPC (not in PDA seeds)
    pub bump: u8,

    // === MXE-encrypted ===
    pub nonce: u128,              // 16 bytes
    pub ciphertexts: [u8; 96],    // 3 fields × 32 bytes
}
```

**Encrypted fields**:
```rust
struct EncryptedOfferState {
    // Offer data
    price: u64,                   // Offeror's price
    amount: u64,                  // Amount willing to fill
    amt_to_execute: u64,          // Amount that will actually execute
}
// Total: 3 ciphertexts × 32 bytes = 96 bytes
```

**Field lifecycle:**
- `price`, `amount` — Set at submission
- `amt_to_execute` — Computed at submission via greedy FIFO:

```
remaining = deal.amount - deal.fill_amount

if price_passes:
    amt_to_execute = min(offer.amount, remaining)
    deal.fill_amount += amt_to_execute
else:
    amt_to_execute = 0
```

**Interpretation:**
- `amt_to_execute == 0` → Offer won't execute (price failed OR deal already filled)
- `amt_to_execute == amount` → Full fill
- `0 < amt_to_execute < amount` → Partial fill (offer arrived when deal nearly full)

---

## Events

Events carry **Shared-encrypted blobs** that only the intended recipient can decrypt.

### DealCreated
```rust
#[event]
pub struct DealCreated {
    // Public metadata (for indexing)
    pub deal: Pubkey,
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub side: u8,
    pub expires_at: i64,
    pub allow_partial: bool,

    // Encrypted to creator's x25519 key
    pub encrypted_blob: Vec<u8>,
}
```

**Blob contents** (decryptable by creator):
```rust
struct DealCreatedBlob {
    creator: Pubkey,              // Verification field
    amount: u64,
    price: u64,
    total: u64,                   // amount × price
    created_at: i64,
}
```

---

### OfferCreated
```rust
#[event]
pub struct OfferCreated {
    pub deal: Pubkey,
    pub offer: Pubkey,
    pub offer_index: u32,

    // Encrypted to offeror's x25519 key
    pub encrypted_blob: Vec<u8>,
}
```

**Blob contents**:
```rust
struct OfferCreatedBlob {
    offeror: Pubkey,              // Verification field
    price: u64,
    amount: u64,
    submitted_at: i64,
}
```

---

### DealSettled
```rust
#[event]
pub struct DealSettled {
    pub deal: Pubkey,
    pub status: u8,               // EXECUTED or EXPIRED
    pub settled_at: i64,

    pub encrypted_blob: Vec<u8>,  // -> creator
}
```

**Blob contents** (decryptable by creator):
```rust
struct DealSettledBlob {
    creator: Pubkey,              // Verification field
    total_filled: u64,            // Actual amount executed
    refund_amt: u64,              // Creator's escrowed funds returned
}
```

---

### OfferSettled
```rust
#[event]
pub struct OfferSettled {
    pub deal: Pubkey,
    pub offer: Pubkey,
    pub offer_index: u32,

    pub encrypted_blob: Vec<u8>,  // -> offeror
}
```

**Blob contents** (decryptable by offeror):
```rust
struct OfferSettledBlob {
    offeror: Pubkey,              // Verification field
    outcome: u8,                  // PASSED = 0, PARTIAL = 1, FAILED = 2
    executed_amt: u64,            // Amount that was executed
    refund_amt: u64,              // Offeror's escrowed funds returned
}
```

---

## Client Decryption

Clients filter events by comparing `encryption_key` to their own x25519 pubkey:

```typescript
// Fetch all DealCreated events from rolling window
const events = await fetchDealCreatedEvents();

// Derive my x25519 keypair from wallet signature (see ideation/001)
const { privateKey, publicKey } = await getEncryptionKeypair(wallet);

for (const event of events) {
    // Filter by encryption_key (no decryption needed for filtering)
    if (!arraysEqual(event.encryption_key, publicKey)) {
        continue; // Not our event
    }

    // This event is for us — decrypt it
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);
    const plaintext = cipher.decrypt(event.encrypted_blob, event.nonce);

    // Parse the decrypted blob
    const amount = readU64(plaintext, 0);
    const price = readU64(plaintext, 8);
    // ...
}
```

---

## Design Decisions

1. **Signature-derived x25519 keys** — Clients derive x25519 keys deterministically from a wallet signature (see `vibes/ideation/001_deterministic-encryption-keys.md`). This means:
   - User signs a deterministic message → hash signature → x25519 private key
   - Same wallet + same message = same keypair, every time (regenerable on any device)
   - x25519 pubkey stored publicly on accounts (`encryption_pubkey` field) for event routing
   - Crank reads pubkey from account, passes to MPC for output encryption
   - No need for MPC to derive keys — pubkey is plaintext, private key stays client-side

2. **createKey pattern** — Both deals and offers use an ephemeral signer (`create_key`) for PDA derivation. This:
   - Prevents front-running (attacker can't produce valid signature)
   - Enables pre-funding of account rent before creation

3. **Pre-funding for enhanced privacy** (optional) — Users can fund deal/offer accounts at creation time. For maximum privacy, pre-funding through a privacy protocol (e.g., Privacy Cash) breaks the on-chain link between the user's wallet and the deal/offer account. Without this, the account creation transaction reveals the funding source.

---

## Open Questions

1. **Escrow token accounts** — Structure for holding escrowed funds:
   - Single vault per deal vs separate PDAs per party
   - How creator escrow works (quote for BUY, base for SELL)
   - How offeror escrow works (base for BUY, quote for SELL)
   - Transfer logic at settlement (distribution + refunds)

2. **Settlement trigger** — Permissionless crank at expiry? Auto-trigger when filled?

3. **Blob size in events** — `SharedEncryptedStruct<N>` includes:
   - `encryption_key`: 32 bytes (client's x25519 pubkey echoed back)
   - `nonce`: 16 bytes (u128)
   - `ciphertexts`: N × 32 bytes

   **Overhead per blob: 48 bytes + (N × 32 bytes)**

   | Blob | Fields | Ciphertext Size | Total Size |
   |------|--------|-----------------|------------|
   | DealCreatedBlob | 4 (amount + price + total + created_at) | 128 bytes | 176 bytes |
   | OfferCreatedBlob | 3 (price + amount + submitted_at) | 96 bytes | 144 bytes |
   | DealSettledBlob | 2 (total_filled + refund_amt) | 64 bytes | 112 bytes |
   | OfferSettledBlob | 3 (outcome + executed_amt + refund_amt) | 96 bytes | 144 bytes |

   Note: Creator/offeror identity no longer needed in blobs — recipient is identified by `encryption_pubkey` on the account.
