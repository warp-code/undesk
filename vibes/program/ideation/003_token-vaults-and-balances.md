# Token Vaults and Encrypted Balances

## Context

Privacy-preserving token transfers require breaking the on-chain link between sender and recipient. Direct SPL transfers leak this information. A vault-based system with encrypted balances provides the foundation for private token operations.

**Goals:**
- Program-level vaults that pool tokens by mint (mixer pattern)
- Per-user encrypted balances that track deposits and activity
- Support current deal/offer flow with path to full SPL transfers

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         OTC Program                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│   │  USDC Vault     │  │  META Vault     │  │  BONK Vault     │ │
│   │  (ATA owned by  │  │  (ATA owned by  │  │  (ATA owned by  │ │
│   │   program PDA)  │  │   program PDA)  │  │   program PDA)  │ │
│   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│            │                    │                    │          │
│            └────────────────────┼────────────────────┘          │
│                                 │                               │
│                    ┌────────────┴────────────┐                  │
│                    │    Encrypted Balances   │                  │
│                    │    (per user, per mint) │                  │
│                    └─────────────────────────┘                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Program Vaults (Mixer Pattern)

Each token mint has a single program-owned vault:

```
┌─────────────────────────────────────────┐
│  Vault PDA                              │
├─────────────────────────────────────────┤
│  seeds: ["vault", mint.key()]           │
│  bump: u8                               │
│  mint: Pubkey                           │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Vault Token Account (ATA)              │
├─────────────────────────────────────────┤
│  owner: Vault PDA                       │
│  mint: <token mint>                     │
│  amount: <pooled balance>               │
└─────────────────────────────────────────┘
```

**Why program-level vaults:**
- All tokens of a given mint pool together → breaks sender/recipient link
- Deposits from many users mix in the same vault
- Withdrawals come from the pool, not traceable to specific deposits
- Acts as a "mixer" without requiring external infrastructure

**Vault operations:**
- `deposit` - User transfers SPL tokens into vault, balance account credited
- `withdraw` - User requests withdrawal, balance account debited, SPL transferred out

## Encrypted Balance Accounts

Each user has one balance account per mint they interact with:

```
┌─────────────────────────────────────────┐
│  Balance Account                        │
├─────────────────────────────────────────┤
│  seeds: ["balance", controller, mint]   │
│  bump: u8                               │
│  controller: Pubkey                     │  ← derived ed25519 (owner)
│  encryption_pubkey: [u8; 32]            │  ← derived x25519 (for events)
│  mint: Pubkey                           │
│  nonce: [u8; 16]                        │
│  encrypted_balance: [u8; N]             │  ← MXE-encrypted u64
└─────────────────────────────────────────┘
```

**Key properties:**
- PDA derived from `controller` + `mint` → one account per user per mint
- Balance is encrypted, only owner can decrypt
- Same controller/encryption key pattern as deals/offers (see 002_pubkey-as-routing-pattern.md)
- Created lazily on first deposit for a given mint

## Balance Flow: Deposits and Withdrawals

### Deposit Flow

```
User Wallet                    Program Vault              Balance Account
    │                              │                           │
    │──── SPL transfer ───────────►│                           │
    │     (public amount)          │                           │
    │                              │                           │
    │──── queue_deposit() ────────────────────────────────────►│
    │     (encrypted amount)       │                           │
    │                              │     ┌───────────────────┐ │
    │                              │     │ MPC: add amount   │ │
    │                              │     │ to encrypted      │ │
    │                              │     │ balance           │ │
    │                              │     └───────────────────┘ │
    │                              │                           │
    │◄─────────────────────────────────── DepositEvent ────────│
    │     (encrypted confirmation) │                           │
```

**Note on deposit privacy:** The SPL transfer amount is public. To preserve privacy:
- Users should deposit in standard denominations (e.g., 100, 1000 USDC)
- Or use a separate mixing service before depositing
- The privacy benefit comes at withdrawal and internal operations

### Withdrawal Flow

```
Balance Account                Program Vault              User Wallet
    │                              │                           │
    │◄──── queue_withdraw() ───────│                           │
    │      (encrypted amount)      │                           │
    │                              │                           │
    │  ┌───────────────────┐       │                           │
    │  │ MPC: verify       │       │                           │
    │  │ balance >= amount │       │                           │
    │  │ subtract amount   │       │                           │
    │  └───────────────────┘       │                           │
    │                              │                           │
    │──── callback: transfer ─────►│──── SPL transfer ────────►│
    │     (plaintext amount)       │     (to destination)      │
    │                              │                           │
```

**Withdrawal privacy:** The destination address is visible. For maximum privacy:
- Withdraw to a fresh wallet with no prior history
- Use delayed withdrawals or withdrawal queues to prevent timing correlation

## Balance Flow: Deals and Offers

Encrypted balances integrate with the existing deal/offer system:

### Deal Creation (Locking Funds)

```
Before:  Balance = 1000 USDC (encrypted)
Action:  Create BUY deal for 500 USDC worth of META
After:   Balance = 500 USDC (encrypted)
         Deal.locked_quote = 500 USDC (encrypted, in deal state)
```

The MPC computation:
1. Reads user's encrypted balance
2. Verifies balance >= required lock amount
3. Subtracts lock amount from balance
4. Stores lock amount in deal's encrypted state

### Offer Submission (Locking Funds)

```
Before:  Balance = 100 META (encrypted)
Action:  Submit offer to sell 50 META
After:   Balance = 50 META (encrypted)
         Offer.locked_amount = 50 META (encrypted, in offer state)
```

### Settlement (Releasing and Transferring)

On deal settlement, the MPC:
1. Transfers appropriate amounts between encrypted balances
2. Releases unused locks back to balances
3. Emits encrypted events to each party

```
Deal: BUY 10 META @ 50 USDC/META (total: 500 USDC)
Offer: SELL 10 META @ 45 USDC/META (passed, gets creator's price)

Creator (deal owner):
  - locked_quote released: -500 USDC (was locked)
  - receives base: +10 META
  - net: -500 USDC, +10 META

Offeror:
  - locked_amount released: -10 META (was locked)
  - receives quote: +500 USDC (at creator's price)
  - net: +500 USDC, -10 META
```

All balance changes happen in MPC, only encrypted results stored.

## Account Lifecycle

### Balance Account Creation

Created on first deposit or when needed for deal/offer creation:

```rust
#[derive(Accounts)]
pub struct InitializeBalance<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = Balance::SIZE,
        seeds = [b"balance", controller.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub balance: Account<'info, Balance>,

    pub controller: Signer<'info>,  // Derived ed25519
    pub mint: Account<'info, Mint>,
    // ...
}
```

### Balance Account Closure

Users can close balance accounts when:
- Encrypted balance is zero (verified in MPC)
- No open deals/offers using this mint

Rent is returned to the user.

## Privacy Levels

| Operation | What's Public | What's Private |
|-----------|---------------|----------------|
| Deposit | Amount, source wallet | Nothing (amount visible) |
| Withdraw | Amount, destination wallet | Source of funds within vault |
| Deal creation | Mints, expiry, side | Amount, price, creator identity |
| Offer submission | Target deal | Amount, price, offeror identity |
| Settlement | Deal status | Amounts, who traded with whom |
| Internal balance | That account exists | Balance amount |

## Future: Private SPL Transfers

With this infrastructure, adding private transfers is straightforward:

```
User A                         MPC                          User B
   │                            │                              │
   │── queue_transfer() ───────►│                              │
   │   (encrypted: amount,      │                              │
   │    recipient pubkey)       │                              │
   │                            │                              │
   │                     ┌──────┴──────┐                       │
   │                     │ Verify A's  │                       │
   │                     │ balance     │                       │
   │                     │ Debit A     │                       │
   │                     │ Credit B    │                       │
   │                     └──────┬──────┘                       │
   │                            │                              │
   │◄── TransferSentEvent ──────│────── TransferReceivedEvent─►│
   │    (encrypted)             │       (encrypted)            │
```

**What's visible on-chain:**
- A transfer happened (instruction was called)
- Who initiated (the payer/signer)

**What's private:**
- Amount transferred
- Recipient (pubkey is encrypted in the instruction data)
- Sender's remaining balance
- Recipient's new balance

This is the "mixer" benefit: all tokens of a mint are pooled, transfers update encrypted balance accounts, no SPL movement occurs for internal transfers.

## Implementation Phases

### Phase 1: Current (Deal/Offer Escrow)
- Deals and offers lock funds in their own encrypted state
- No shared balance accounts yet
- Simpler but funds are locked per-deal

### Phase 2: Vault + Balances
- Introduce program vaults and encrypted balance accounts
- Deals/offers draw from and return to balance accounts
- Enables capital efficiency (one balance, multiple deals)

### Phase 3: Private Transfers
- Add internal transfer instruction
- Users can move funds between balance accounts privately
- Full mixer functionality

## Related

- [000_data-structures.md](./000_data-structures.md) - Deal and Offer data structures
- [001_deterministic-encryption-keys.md](./001_deterministic-encryption-keys.md) - How encryption keys are derived
- [002_pubkey-as-routing-pattern.md](./002_pubkey-as-routing-pattern.md) - How encrypted events are routed
