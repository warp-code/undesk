# Encrypted Data Flow

This document explains how encrypted data flows through the OTC system, from on-chain events to the frontend.

## Overview

The OTC system uses Arcium for confidential computing. All sensitive data (prices, amounts) is encrypted so that:
- Only the **deal creator** can see their deal's price/amount
- Only the **offer submitter** can see their offer's price/amount
- The blockchain and indexer only see encrypted blobs

## The Two Types of Ciphertexts

### 1. Creation Ciphertexts (`ciphertexts`)

Stored when a deal/offer is **created**. Contains the original encrypted inputs.

| Entity | Fields | Size |
|--------|--------|------|
| Deal | `[amount: u64, price: u128]` | 64 bytes (2 × 32) |
| Offer | `[price: u128, amount: u64]` | 64 bytes (2 × 32) |

### 2. Settlement Ciphertexts (`settlement_ciphertexts`)

Stored when a deal/offer is **settled** (executed or expired). Contains the outcome.

| Entity | Fields | Size |
|--------|--------|------|
| Deal | `[total_filled: u64, creator_receives: u64, creator_refund: u64]` | 96 bytes (3 × 32) |
| Offer | `[outcome: u8, executed_amt: u64, refund_amt: u64]` | 96 bytes (3 × 32) |

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ON-CHAIN (Solana)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CREATE DEAL                           2. CRANK DEAL (Settlement)        │
│  ─────────────                            ──────────────────────────        │
│  User encrypts (amount, price)            Arcium computes settlement        │
│  with their x25519 key + MXE key          results off-chain                 │
│           │                                         │                       │
│           ▼                                         ▼                       │
│  ┌─────────────────────┐                 ┌─────────────────────┐           │
│  │   DealCreated Event │                 │  DealSettled Event  │           │
│  ├─────────────────────┤                 ├─────────────────────┤           │
│  │ • deal (pubkey)     │                 │ • deal (pubkey)     │           │
│  │ • base_mint         │                 │ • status (u8)       │           │
│  │ • quote_mint        │                 │ • settled_at        │           │
│  │ • expires_at        │                 │ • encryption_key    │           │
│  │ • allow_partial     │                 │ • nonce             │           │
│  │ • encryption_key    │                 │ • ciphertexts [3]   │           │
│  │ • nonce             │                 │   └─ total_filled   │           │
│  │ • ciphertexts [2]   │                 │   └─ receives       │           │
│  │   └─ amount (u64)   │                 │   └─ refund         │           │
│  │   └─ price (u128)   │                 └─────────────────────┘           │
│  └─────────────────────┘                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Indexer listens to events
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INDEXER (Node.js)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Parses events and stores in Supabase:                                      │
│                                                                             │
│  DealCreated → INSERT into deals table                                      │
│    • encryption_key, nonce, ciphertexts → stored as bytea                   │
│    • status = 'open'                                                        │
│    • settlement_* fields = NULL                                             │
│                                                                             │
│  DealSettled → UPDATE deals table                                           │
│    • settlement_encryption_key, settlement_nonce,                           │
│      settlement_ciphertexts → stored as bytea                               │
│    • status = 'executed' or 'expired'                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE (Supabase)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  deals table:                                                               │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │ address | base_mint | quote_mint | status | encryption_key | ...   │    │
│  │         |           |            |        | nonce | ciphertexts    │    │
│  │         |           |            |        | settlement_encryption_key │ │
│  │         |           |            |        | settlement_nonce          │ │
│  │         |           |            |        | settlement_ciphertexts    │ │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
│  Key insight: encryption_key stores the USER'S x25519 public key.           │
│  This lets us filter "my deals" by matching encryption_key to the           │
│  user's derived public key.                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  useMarketDeals() - Public data only                                        │
│  ─────────────────────────────────────                                      │
│  • Fetches all deals with status='open'                                     │
│  • Returns: baseMint, quoteMint, expiresAt, allowPartial                    │
│  • NO decryption needed (other users' deals, prices hidden)                 │
│                                                                             │
│  useMyDeals() - Decrypt creation data                                       │
│  ────────────────────────────────────                                       │
│  • Fetches deals WHERE encryption_key = user's pubkey                       │
│  • Decrypts ciphertexts using:                                              │
│      sharedSecret = x25519(userPrivateKey, mxePublicKey)                    │
│      cipher = new RescueCipher(sharedSecret)                                │
│      [amount, price] = cipher.decrypt(ciphertexts, nonce)                   │
│  • Returns: amount, price, total, status, etc.                              │
│                                                                             │
│  useMyOffers() - Same pattern for offers                                    │
│  ───────────────────────────────────────                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Why Two Sets of Encrypted Fields?

**Creation ciphertexts** = What the user submitted
- Deal: "I want to trade X amount at Y price"
- Offer: "I'm offering Z amount at W price"

**Settlement ciphertexts** = What actually happened
- Deal: "You received A tokens, B tokens were refunded"
- Offer: "Your offer was executed for C amount, D was refunded"

These are separate because:
1. Settlement happens later (when deal is cranked)
2. Settlement results depend on matching logic (which offers got filled)
3. User needs both: original intent AND actual outcome

## Frontend Data Access

| Hook | What it fetches | Decryption | Use case |
|------|----------------|------------|----------|
| `useMarketDeals` | All open deals | None | Show available deals to trade |
| `useMyDeals` | User's deals | `ciphertexts` | Show user their deal details |
| `useMyOffers` | User's offers | `ciphertexts` | Show user their offer details |

## What About `isPartial`?

The `isPartial` field indicates whether a deal was only partially filled.

To determine this, you would need to:
1. Decrypt the original `ciphertexts` to get the original `amount`
2. Decrypt the `settlement_ciphertexts` to get `total_filled`
3. Compare: `isPartial = (total_filled < amount)`

This is only relevant for **executed** deals. Open deals have no settlement data yet.

Currently, the hooks don't implement settlement decryption because:
- Open deals: `isPartial = false` (nothing filled yet)
- Executed deals: Settlement details would be shown on a "deal completed" screen

## Encryption Key Usage

The `encryption_key` field is **the user's x25519 public key**, NOT a shared secret.

When creating a deal:
1. User derives x25519 keypair from wallet signature
2. User encrypts data using `x25519(userPrivateKey, mxePublicKey)` shared secret
3. User's public key is stored in `encryption_key` field

When reading a deal:
1. Frontend queries WHERE `encryption_key` = user's public key (to find "my" deals)
2. Frontend decrypts using same shared secret: `x25519(userPrivateKey, mxePublicKey)`

The MXE (Multi-party eXecution Environment) public key is fetched from the Arcium program.
