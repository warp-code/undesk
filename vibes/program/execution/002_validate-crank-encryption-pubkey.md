# Issue: Crank instructions don't validate encryption pubkey

## Summary

The `crank_deal` and `crank_offer` instructions accept an encryption pubkey as a parameter but don't validate that it matches the pubkey stored in the account. A malicious cranker could encrypt settlement outputs to the wrong key, preventing the rightful owner from decrypting their settlement information.

## Affected Instructions

- `crank_deal` - takes `creator_encryption_pubkey: [u8; 32]`
- `crank_offer` - takes `offeror_encryption_pubkey: [u8; 32]`

## Current Behavior

```rust
// programs/otc/src/instructions/crank_deal.rs:47-53
let args = ArgBuilder::new()
    .plaintext_u128(deal_nonce)
    .account(deal_key, DEAL_CIPHERTEXT_OFFSET, DEAL_CIPHERTEXT_LENGTH)
    .x25519_pubkey(creator_encryption_pubkey)  // <-- No validation against deal.encryption_pubkey
    .plaintext_u128(creator_nonce)
    // ...
```

The `creator_encryption_pubkey` parameter is passed directly to the ArgBuilder without checking that it matches `ctx.accounts.deal.encryption_pubkey`.

## Impact

- **Not a fund loss risk** - Token transfers happen separately; settlement blobs are informational only
- **Denial of information** - A malicious permissionless cranker (after deal expiry) could encrypt settlement info to their own key, preventing the creator/offeror from knowing their settlement details (`total_filled`, `creator_receives`, `creator_refund`, etc.)

## Why the parameter exists

The nonce (`creator_nonce`) must be fresh for each encryption operation - can't reuse the deal's original nonce. Since Arcium's `Shared` marker requires both pubkey + nonce together, the pubkey was also made a parameter for consistency.

## Proposed Fix

Add validation in both crank handlers:

```rust
// In crank_deal handler
require!(
    creator_encryption_pubkey == ctx.accounts.deal.encryption_pubkey,
    ErrorCode::InvalidEncryptionKey
);

// In crank_offer handler
require!(
    offeror_encryption_pubkey == ctx.accounts.offer.encryption_pubkey,
    ErrorCode::InvalidEncryptionKey
);
```

Add the error variant:

```rust
// In error.rs
#[error_code]
pub enum ErrorCode {
    // ...
    #[msg("Encryption pubkey does not match account")]
    InvalidEncryptionKey,
}
```

## Alternative: Keep flexibility

If there's a future use case for key rotation or delegation (e.g., creator wants settlement encrypted to a custodian), the parameter could remain unvalidated. However, this should be an explicit design decision, not an oversight.

## Files to modify

- `programs/otc/src/instructions/crank_deal.rs`
- `programs/otc/src/instructions/crank_offer.rs`
- `programs/otc/src/error.rs`
