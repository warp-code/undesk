# Pubkey-as-Routing Pattern for Crankable Accounts

## Context

In a permissionless system, "cranks" (any external caller) can trigger state changes on accounts without the account owner being online. However, when those state changes produce encrypted outputs, the system needs to know *who* should be able to decrypt them.

**Problem:** How do you encrypt computation results for a user who isn't online and didn't initiate the transaction?

## Solution: Store x25519 Pubkey Publicly on Accounts

Any account that needs to receive encrypted events should store the owner's derived public keys as public (unencrypted) account data.

```
┌─────────────────────────────────┐
│  Crankable Account              │
├─────────────────────────────────┤
│  create_key: Pubkey             │ ← ephemeral (PDA uniqueness)
│  controller: Pubkey             │ ← derived ed25519 (signing authority)
│  encryption_pubkey: [u8; 32]    │ ← derived x25519 (event routing)
│  nonce: [u8; 16]                │ ← MXE encryption nonce
│  ...encrypted state...          │ ← MXE-encrypted data
└─────────────────────────────────┘
```

Both `controller` and `encryption_pubkey` are derived deterministically from wallet signatures (see 001_deterministic-encryption-keys.md).

### Why This Works

1. **Crank reads pubkey from account** - no need for the owner to be online
2. **Computation encrypts output for that pubkey** - passed as plaintext parameters
3. **Events emitted on-chain** - contain encrypted data + pubkey for routing
4. **Owner decrypts later** - derives private key from wallet signature (see 001_deterministic-encryption-keys.md)

## OTC Application: Offers and Deals

Both Offers and Deals are crankable accounts with a **single owner** who receives encrypted events:

### Deal Account
```
┌─────────────────────────────────┐
│  Deal                           │
├─────────────────────────────────┤
│  create_key: Pubkey             │ ← ephemeral (PDA uniqueness)
│  controller: Pubkey             │ ← creator's derived ed25519
│  encryption_pubkey: [u8; 32]    │ ← creator's derived x25519
│  base_mint: Pubkey              │
│  quote_mint: Pubkey             │
│  ...public fields...            │
│  nonce: [u8; 16]                │
│  encrypted_state: [u8; N]       │ ← MXE-encrypted (amount, price, etc.)
└─────────────────────────────────┘
```

Events for the **creator**:
- `DealCreated` - confirmation of deal creation
- `DealSettled` - settlement outcome (total filled, refunds)

### Offer Account
```
┌─────────────────────────────────┐
│  Offer                          │
├─────────────────────────────────┤
│  create_key: Pubkey             │ ← ephemeral (PDA uniqueness)
│  controller: Pubkey             │ ← offeror's derived ed25519
│  encryption_pubkey: [u8; 32]    │ ← offeror's derived x25519
│  deal: Pubkey                   │ ← which deal this offer is for
│  ...public fields...            │
│  nonce: [u8; 16]                │
│  encrypted_state: [u8; N]       │ ← MXE-encrypted (price, amount, etc.)
└─────────────────────────────────┘
```

Events for the **offeror**:
- `OfferCreated` - confirmation of offer submission
- `OfferSettled` - settlement outcome (executed amount, refunds)

## Passing Multiple Pubkeys to Computations

Some operations involve multiple accounts, each with their own owner. For example, settlement touches both a Deal (owned by creator) and an Offer (owned by offeror). The computation reads pubkeys from both accounts and encrypts separate events for each.

Pass additional pubkeys as `u128` pairs:

```rust
#[instruction]
pub fn settle_offer(
    deal_ctxt: Enc<Mxe, &DealState>,
    offer_ctxt: Enc<Mxe, &OfferState>,
    creator: Shared,                   // From deal's encryption_pubkey
    offeror_pubkey_hi: u128,           // From offer's encryption_pubkey
    offeror_pubkey_lo: u128,
) -> (Enc<Shared, DealSettledBlob>, Enc<Shared, OfferSettledBlob>) {
    // Reconstruct offeror pubkey
    let mut p = [0u8; 32];
    p[0..16].copy_from_slice(&offeror_pubkey_hi.to_le_bytes());
    p[16..32].copy_from_slice(&offeror_pubkey_lo.to_le_bytes());
    let offeror = Shared::new(ArcisX25519Pubkey::from_uint8(&p));

    // Process settlement
    let (deal_result, offer_result) = process_settlement(&deal_ctxt, &offer_ctxt);

    // Each owner gets their own encrypted result
    (creator.from_arcis(deal_result), offeror.from_arcis(offer_result))
}
```

## Event Structure

Events include the encryption pubkey for routing/verification:

```rust
#[event]
pub struct DealUpdateEvent {
    pub encryption_key: [u8; 32],  // Recipient's pubkey (for filtering)
    pub nonce: [u8; 16],
    pub ciphertext: [u8; N],
}
```

Clients filter events by comparing `encryption_key` to their own pubkey before attempting decryption.

## Complete Flow

```
1. User connects wallet
2. User signs message → derives x25519 keypair deterministically
3. User creates Offer/Deal → encryption_pubkey stored on account
4. User goes offline

... time passes ...

5. Crank triggers computation on account
6. Computation reads encryption_pubkey from account
7. Computation encrypts result for that pubkey
8. Event emitted with encrypted data

... time passes ...

9. User comes back online
10. User signs message → re-derives same x25519 keypair
11. User filters events by their pubkey
12. User decrypts with x25519.getSharedSecret(privateKey, mxePublicKey)
```

## Key Benefits

- **Permissionless cranking** - anyone can trigger state changes
- **Privacy preserved** - only intended recipients can decrypt
- **Async operation** - users don't need to be online
- **No key storage** - encryption keys derived on-demand from wallet
- **Verifiable routing** - pubkey in event confirms intended recipient

## Related

- [001_deterministic-encryption-keys.md](./001_deterministic-encryption-keys.md) - How to derive x25519 keys from wallet signatures
