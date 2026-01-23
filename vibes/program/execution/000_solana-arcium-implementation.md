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

## Deal Mechanics

The protocol uses a simplified single-direction model:

- **Creator** deposits `base` tokens and specifies a minimum `price` (in quote tokens per base token)
- **Offerors** deposit `quote` tokens and specify their `price` (what they'll pay per base token)
- **Settlement**: Creator receives quote tokens, offerors receive base tokens

This removes the need for a BUY/SELL flag in the protocol. The UI can present deals from either perspective:
- "Sell 100 SOL for at least 150 USDC each" → creator sells base (SOL), receives quote (USDC)
- "Buy 100 SOL for up to 150 USDC each" → UI swaps the token labels, but protocol logic is identical

**Price comparison**: An offer passes if `offer.price >= deal.price` (offeror willing to pay at least the creator's minimum).

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

## Price Representation

Prices use **X64.64 fixed-point** format (128 bits total):
- Upper 64 bits: integer part
- Lower 64 bits: fractional part (precision to ~5.4 × 10⁻²⁰)

```rust
// X64.64 constants
const ONE: u128 = 1u128 << 64;           // 1.0
const HALF: u128 = 1u128 << 63;          // 0.5

// Multiplication: (amount * price) >> 64
fn calculate_quote(amount: u64, price: u128) -> u64 {
    ((amount as u128 * price) >> 64) as u64
}
```

### MXE-Computed Amounts

Final quote amounts (`amount × price`) are computed inside the MXE using the encrypted values, not trusted from the client. This ensures the settlement math is verified cryptographically — clients cannot lie about what they owe or are owed.

---

## Account Structures

### DealAccount

PDA seeds: `["deal", create_key.key()]`

```rust
pub struct DealAccount {
    // === Public (plaintext) ===
    pub create_key: Pubkey,          // Ephemeral signer (PDA uniqueness)
    pub controller: Pubkey,          // Derived ed25519 pubkey (signing authority)
    pub encryption_pubkey: [u8; 32], // Derived x25519 pubkey (event routing)
    pub base_mint: Pubkey,           // Token the creator is selling
    pub quote_mint: Pubkey,          // Token the creator receives in return
    pub expires_at: i64,             // Unix timestamp
    pub status: u8,                  // OPEN = 0, EXECUTED = 1, EXPIRED = 2
    pub allow_partial: bool,         // Execute partial fills at expiry?
    pub num_offers: u32,             // Counter, incremented by MPC at offer submission
    pub bump: u8,

    // === MXE-encrypted (raw bytes) ===
    pub nonce: u128,              // 16 bytes
    pub ciphertexts: [u8; 96],    // 3 fields × 32 bytes
}
```

**Encrypted fields** (interpreted by Arcis circuit):
```rust
struct EncryptedDealState {
    // Operational data
    amount: u64,                  // Base asset amount
    price: u128,                  // Threshold price (X64.64 fixed-point)
    fill_amount: u64,             // Running sum of amt_to_execute across offers
}
// Total: 3 ciphertexts × 32 bytes = 96 bytes
```

**Account closure:** When `num_settled == num_offers` and creator is settled, deal account can be closed.

---

### OfferAccount

PDA seeds: `["offer", deal.key(), create_key.key()]`

```rust
pub struct OfferAccount {
    // === Public ===
    pub create_key: Pubkey,          // Ephemeral signer (PDA uniqueness)
    pub controller: Pubkey,          // Derived ed25519 pubkey (signing authority)
    pub encryption_pubkey: [u8; 32], // Derived x25519 pubkey (event routing)
    pub deal: Pubkey,
    pub offer_index: u32,            // FIFO sequence, assigned by MPC (not in PDA seeds)
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
    price: u128,                  // Offeror's price (X64.64 fixed-point)
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
    pub expires_at: i64,
    pub allow_partial: bool,

    // Encrypted to creator's x25519 key
    pub encrypted_blob: Vec<u8>,
}
```

**Blob contents** (decryptable by creator):
```rust
struct DealCreatedBlob {
    amount: u64,
    price: u128,                  // X64.64 fixed-point
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
    price: u128,                  // X64.64 fixed-point
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
    total_filled: u64,            // Actual amount executed
    creator_receives: u64,        // What creator gets
    creator_refund: u64,          // Creator's unfilled portion returned
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
    outcome: u8,                  // EXECUTED = 0, PARTIAL = 1, FAILED = 2
    executed_amt: u64,            // Amount that was executed
    refund_amt: u64,              // Offeror's unfilled portion returned
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

1. **Signature-derived keypairs** — Clients derive two keypairs deterministically from wallet signatures (see `vibes/ideation/001_deterministic-encryption-keys.md`):

   **Controller (ed25519)** — for signing authority:
   - User signs `"otc:controller:v1"` → hash → ed25519 private key
   - `controller` pubkey stored on accounts, used to authorize transactions
   - One controller per user, can control multiple deals/offers
   - Breaks on-chain link between user's main wallet and their accounts

   **Encryption (x25519)** — for event routing:
   - User signs `"otc:encryption:v1"` → hash → x25519 private key
   - `encryption_pubkey` stored on accounts for event routing
   - Crank reads pubkey, passes to MPC for output encryption
   - User decrypts events with derived private key

2. **createKey pattern** — Both deals and offers use an ephemeral signer (`create_key`) for PDA derivation. This:
   - Prevents front-running (attacker can't produce valid signature)
   - Enables pre-funding of account rent before creation

3. **Pre-funding for enhanced privacy** (optional) — Users can fund deal/offer accounts at creation time. For maximum privacy, pre-funding through a privacy protocol (e.g., Privacy Cash) breaks the on-chain link between the user's wallet and the deal/offer account. Without this, the account creation transaction reveals the funding source.

---

## Open Questions

1. **Token transfers** — Deferred until we decide on a private transfer protocol. The MXE computes the amounts; the transfer mechanism is separate.

2. **Blob size in events** — `SharedEncryptedStruct<N>` includes:
   - `encryption_key`: 32 bytes (client's x25519 pubkey echoed back)
   - `nonce`: 16 bytes (u128)
   - `ciphertexts`: N × 32 bytes

   **Overhead per blob: 48 bytes + (N × 32 bytes)**

   | Blob | Fields | Ciphertext Size | Total Size |
   |------|--------|-----------------|------------|
   | DealCreatedBlob | 3 (amount + price + created_at) | 96 bytes | 144 bytes |
   | OfferCreatedBlob | 3 (price + amount + submitted_at) | 96 bytes | 144 bytes |
   | DealSettledBlob | 3 (total_filled + receives + refund) | 96 bytes | 144 bytes |
   | OfferSettledBlob | 3 (outcome + executed_amt + refund_amt) | 96 bytes | 144 bytes |

   Note: Recipient is identified by `encryption_pubkey` on the account, not in the blob.
