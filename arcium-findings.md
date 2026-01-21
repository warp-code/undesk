# Arcium ArgBuilder Patterns for Encrypted Instructions

This document captures learnings from debugging Arcium encrypted instructions and the correct `ArgBuilder` usage patterns.

## The Problem

Encrypted instructions kept failing with cryptic errors like "Unknown action 'undefined'" and "InvalidArguments (Error 6301)". The root cause was incorrect `ArgBuilder` usage for different encryption types.

---

## Key Findings

### 1. `Enc<Mxe, T>` (MXE-encrypted output, no input)

Used when the MXE generates encrypted data (e.g., `init_counter`).

```rust
// Encrypted instruction
pub fn init_counter(mxe: Mxe) -> Enc<Mxe, CounterState>
```

**ArgBuilder:**
```rust
let args = ArgBuilder::new()
    .plaintext_u128(nonce)  // Nonce for output encryption
    .build();
```

---

### 2. `Enc<Mxe, &T>` (MXE-encrypted data by reference)

Used when MPC nodes read encrypted state from an on-chain account (e.g., `increment_counter`).

```rust
// Encrypted instruction
pub fn increment_counter(counter_ctxt: Enc<Mxe, &CounterState>) -> Enc<Mxe, CounterState>
```

**ArgBuilder:**
```rust
let nonce = u128::from_le_bytes(ctx.accounts.counter.nonce);
let args = ArgBuilder::new()
    .plaintext_u128(nonce)  // Nonce from the stored account
    .account(
        ctx.accounts.counter.key(),
        CIPHERTEXT_OFFSET,  // Skip discriminator (8) + nonce (16) = 24
        CIPHERTEXT_LENGTH,  // Just the ciphertext bytes (32 per field)
    )
    .build();
```

**Key insight:** Pass the nonce separately as plaintext, then reference only the ciphertext portion of the account.

---

### 3. `Shared` marker (re-encrypt for a user)

Used when output should be encrypted with a shared secret so a specific user can decrypt it.

```rust
// Encrypted instruction
pub fn get_counter(
    counter_ctxt: Enc<Mxe, &CounterState>,
    recipient: Shared,
) -> Enc<Shared, CounterState>
```

**ArgBuilder:**
```rust
let mxe_nonce = u128::from_le_bytes(ctx.accounts.counter.nonce);
let args = ArgBuilder::new()
    // First param: Enc<Mxe, &T>
    .plaintext_u128(mxe_nonce)
    .account(pubkey, CIPHERTEXT_OFFSET, CIPHERTEXT_LENGTH)
    // Second param: Shared marker
    .x25519_pubkey(recipient_pubkey)
    .plaintext_u128(recipient_nonce)
    .build();
```

---

### 4. `Enc<Shared, T>` (User-encrypted input by value)

Used when the client encrypts data with a shared secret and passes it directly.

```rust
// Encrypted instruction
pub fn add_together(input_ctxt: Enc<Shared, InputValues>) -> Enc<Shared, u16>
```

**ArgBuilder:**
```rust
let args = ArgBuilder::new()
    .x25519_pubkey(pubkey)           // Client's public key
    .plaintext_u128(nonce)           // Nonce used for encryption
    .encrypted_u8(ciphertext_0)      // First encrypted field
    .encrypted_u8(ciphertext_1)      // Second encrypted field
    .build();
```

---

## Account Data Layout

For `MXEEncryptedStruct` stored on-chain (e.g., the `Counter` account):

```
| Discriminator | Nonce    | Ciphertexts      |
| 8 bytes       | 16 bytes | N x 32 bytes     |
| offset 0      | offset 8 | offset 24        |
```

When referencing by account, skip to the ciphertext:
```rust
const CIPHERTEXT_OFFSET: u32 = 24;  // 8 (discriminator) + 16 (nonce)
const CIPHERTEXT_LENGTH: u32 = 32;  // 32 bytes per encrypted field
```

The Rust struct mirrors this layout:
```rust
#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub nonce: [u8; 16],
    pub state: [[u8; 32]; 1],  // 1 encrypted field
}
```

---

## Decryption of `Enc<Shared, T>`

The callback event includes `encryption_key` - this is your public key echoed back (for verification), NOT what you use for decryption.

**Correct:**
```typescript
// Use MXE's public key to compute shared secret
const sharedSecret = x25519.getSharedSecret(yourPrivateKey, mxePublicKey);
const cipher = new RescueCipher(sharedSecret);
const decrypted = cipher.decrypt([ciphertext], nonce);
```

**Wrong:**
```typescript
// Don't use encryption_key from event - that's your own pubkey echoed back
const sharedSecret = x25519.getSharedSecret(yourPrivateKey, event.encryptionKey);
```

The `encryption_key` field exists so the recipient can verify the data was encrypted for them (useful if you have multiple keypairs).

---

## Error Translation

| Error | Meaning |
|-------|---------|
| "Unknown action 'undefined'" | ArgBuilder arguments don't match the encrypted instruction signature |
| "InvalidArguments" (6301) | Argument structure/format is wrong (e.g., wrong offset/length for account reference) |

---

## Pattern Summary Table

| Parameter Type | ArgBuilder Calls |
|----------------|------------------|
| `Mxe` (marker) | `.plaintext_u128(nonce)` |
| `Shared` (marker) | `.x25519_pubkey(pubkey)` + `.plaintext_u128(nonce)` |
| `Enc<Mxe, T>` (by value) | `.plaintext_u128(nonce)` + `.encrypted_*()` for each field |
| `Enc<Mxe, &T>` (by ref) | `.plaintext_u128(stored_nonce)` + `.account(key, ciphertext_offset, ciphertext_len)` |
| `Enc<Shared, T>` (by value) | `.x25519_pubkey()` + `.plaintext_u128(nonce)` + `.encrypted_*()` for each field |

---

## Order Matters

Arguments must be added to `ArgBuilder` in the same order as the parameters appear in the encrypted instruction signature. For example:

```rust
pub fn get_counter(
    counter_ctxt: Enc<Mxe, &CounterState>,  // First: nonce + account ref
    recipient: Shared,                       // Second: pubkey + nonce
) -> Enc<Shared, CounterState>
```

The ArgBuilder must follow this order:
```rust
ArgBuilder::new()
    .plaintext_u128(mxe_nonce)      // For counter_ctxt
    .account(...)                    // For counter_ctxt
    .x25519_pubkey(recipient_pubkey) // For recipient
    .plaintext_u128(recipient_nonce) // For recipient
    .build();
```

---

## Mixed Encrypted and Plaintext Callback Returns

Arcium callbacks **can return both encrypted and unencrypted data simultaneously** by using tuples or custom structs as the return type.

### How It Works

The return type of your encrypted instruction determines what the callback receives. Each field in a tuple or struct can be independently encrypted or plaintext:

```rust
// Encrypted instruction returning mixed types
#[instruction]
fn my_computation(
    input: Enc<Shared, u64>
) -> (Enc<Shared, u64>, bool, u16) {
    //    ^^^^^^^^^^^^^^  ^^^^  ^^^
    //    encrypted       plain plain
    let value = input.to_arcis();
    let is_valid = value > 100;
    let count = 42u16;
    (Enc::<Shared, u64>::from_arcis(input.owner, value), is_valid, count)
}
```

### Generated Output Types

Arcium automatically generates typed structs based on your return type:

| Return Type | Generated Struct | Fields |
|-------------|------------------|--------|
| `Enc<Shared, T>` | `SharedEncryptedStruct<1>` | `encryption_key`, `nonce`, `ciphertexts[0]` |
| `Enc<Mxe, T>` | `MXEEncryptedStruct<1>` | `nonce`, `ciphertexts[0]` |
| `(Enc<Shared, u64>, bool, u16)` | `{CircuitName}OutputStruct0` | `field_0: SharedEncryptedStruct<1>`, `field_1: bool`, `field_2: u16` |
| Custom struct | `{CircuitName}OutputStruct0` | Named fields matching struct definition |

### Callback Implementation

```rust
#[arcium_callback(encrypted_ix = "my_computation")]
pub fn my_computation_callback(
    ctx: Context<MyComputationCallback>,
    output: SignedComputationOutputs<MyComputationOutput>,
) -> Result<()> {
    let o = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account
    ) {
        Ok(MyComputationOutput { field_0, field_1, field_2 }) => (field_0, field_1, field_2),
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    // Encrypted field - client decrypts with shared secret
    let encrypted_value = o.0.ciphertexts[0];
    let nonce = o.0.nonce;
    let encryption_key = o.0.encryption_key;  // Your pubkey echoed back

    // Plaintext fields - immediately usable on-chain
    let is_valid: bool = o.1;
    let count: u16 = o.2;

    // Can use plaintext values for on-chain logic
    if is_valid {
        // Do something...
    }

    // Emit event with both types
    emit!(MyEvent {
        encrypted_result: encrypted_value,
        nonce: nonce.to_le_bytes(),
        is_valid,
        count,
    });

    Ok(())
}
```

### Use Cases

Mixed returns are useful for:

1. **Result + metadata**: Return encrypted computation result alongside plaintext success/failure flag
2. **Encrypted value + plaintext count**: Return encrypted data with plaintext length/count for validation
3. **Privacy-preserving verification**: Return encrypted details but plaintext boolean for on-chain branching
4. **Batched operations**: Return multiple encrypted values with plaintext indices or statuses

### Key Constraints

1. **Fixed at compile time** - The mix of encrypted vs plaintext is determined by the return type signature; you cannot dynamically choose at runtime
2. **Each field is one or the other** - A single field cannot be "sometimes encrypted, sometimes plaintext"
3. **Size limits apply** - Results over ~1KB require a callback server for overflow data
4. **Type generation is automatic** - Arcium's macros handle struct generation from your return type

### References

- [Callback Type Generation](https://docs.arcium.com/developers/program/callback-type-generation) - How output types are generated
- [Input/Output in Arcis](https://docs.arcium.com/developers/arcis/input-output) - Encrypted data handling
- [The Basics](https://docs.arcium.com/developers/program) - Program invocation fundamentals
- [Callback Server](https://docs.arcium.com/developers/callback-server) - Handling large outputs

---

## Stack Size Issues in Arcium/Anchor Programs

When building Arcium programs, you may encounter stack size errors like:

```
Stack offset of X exceeded max offset of 4096 by Y bytes, please minimize large stack variables
```

### Your Code: Fix by Boxing

If this error appears for functions in **your own code** (e.g., `otc::instructions::submit_offer::SubmitOffer`), fix it by boxing large account types in the Accounts structs:

**Before:**
```rust
#[derive(Accounts)]
pub struct SubmitOffer<'info> {
    pub deal: Account<'info, DealAccount>,
    // ... other accounts
}
```

**After:**
```rust
#[derive(Accounts)]
pub struct SubmitOffer<'info> {
    pub deal: Box<Account<'info, DealAccount>>,
    // ... other accounts
}
```

**Why it works:** Boxing moves the account data from the stack (limited to 4096 bytes) to the heap, which has much more space available.

**Where to apply:**
- Queue context structs (e.g., `SubmitOffer`)
- Callback context structs (e.g., `SubmitOfferCallback`)
- Any struct with large `Account<'info, T>` fields where `T` contains significant data

### Internal Arcium Warnings: Ignore

If the error appears for **internal arcium-client functions** like:
```
arcium_client..idl..arcium..utils..Account
```

This is fine and can be ignored. It's internal to the `arcium-client` crate and not something we can fix from our code. The build should still succeed despite these warnings.
