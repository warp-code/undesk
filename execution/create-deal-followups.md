# Create Deal Follow-ups

Issues to address in a future iteration:

## 1. Expiry Timing

**Current behavior:** `expires_at` is set during account initialization (before callback).

**Desired behavior:** Accept `duration_seconds: i64` as input instead of `expires_at`. Calculate the actual expiration time in the callback:
```rust
deal.expires_at = Clock::get()?.unix_timestamp + duration_seconds;
```

This ensures the expiry is based on when the deal is actually created (callback completion), not when the transaction was submitted.

## 2. INITIALIZING State

**Current behavior:** Deal status is set to `OPEN` immediately on account initialization.

**Desired behavior:** Add an `INITIALIZING` state that the deal has during the period between account creation and callback completion:

```rust
// In DealStatus
pub const INITIALIZING: u8 = 255; // or another unused value

// In handler (account init)
deal.status = DealStatus::INITIALIZING;

// In callback_handler
deal.status = DealStatus::OPEN;
```

This prevents any operations on the deal (e.g., submitting offers) before the encrypted state is properly initialized.
