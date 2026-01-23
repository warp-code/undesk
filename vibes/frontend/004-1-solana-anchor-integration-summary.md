# Solana/Anchor/Supabase Integration Summary

**Date:** 2026-01-23
**Status:** Planning
**Parent:** `004-solana-anchor-integration-plan.md`

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│                                                                              │
│   WRITES (Anchor)              │           READS (Supabase)                  │
│   ─────────────────            │           ────────────────                  │
│   • Create Deal                │           • Market Deals (public)           │
│   • Submit Offer               │           • My Deals (decrypted)            │
│                                │           • My Offers (decrypted)           │
│                                │           • Realtime updates                │
└────────────┬───────────────────┴───────────────────┬────────────────────────┘
             │                                       │
             ▼                                       │
      ┌─────────────┐      ┌─────────────┐          │
      │   Solana    │─────►│   Indexer   │──────────┘
      │  + Arcium   │      │ (captures   │
      └─────────────┘      │  events)    │
                           └──────┬──────┘
                                  │
                                  ▼
                           ┌─────────────┐
                           │  Supabase   │
                           │  (Postgres) │
                           └─────────────┘
```

---

## Package Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@coral-xyz/anchor` | 0.32.1 | Solana program interaction |
| `@arcium-hq/client` | 0.5.4 | Encryption, x25519, RescueCipher |
| `@solana/web3.js` | ^1.95.0 | Solana primitives |
| `@solana/wallet-adapter-*` | Various | Phantom, Solflare support |
| `@supabase/supabase-js` | ^2.45.0 | Database reads + Realtime |
| `@noble/hashes` | ^1.4.0 | SHA-256 for key derivation |

---

## Provider Hierarchy

```typescript
<SolanaProvider>        // Wallet adapter + RPC connection
  <SupabaseProvider>    // Supabase client for reads
    <OtcProvider>       // Anchor program + MXE public key
      <DerivedKeysProvider>  // User's controller + encryption keys
        {children}
      </DerivedKeysProvider>
    </OtcProvider>
  </SupabaseProvider>
</SolanaProvider>
```

---

## Implementation Phases

### Phase 1: Wallet Connection
- `SolanaProvider.tsx` - ConnectionProvider, WalletProvider, WalletModalProvider
- `WalletButton.tsx` - Styled connect/disconnect button
- CSS overrides for dark theme

### Phase 2: Key Derivation
- `encryption.ts` - Derive ed25519 (controller) + x25519 (encryption) from wallet signatures
- `useDerivedKeys.ts` - Hook to manage derived keys
- User signs 2 messages -> deterministic keypairs

### Phase 3: OTC Program Integration
- `OtcProvider.tsx` - Anchor program instance, MXE public key, Arcium accounts
- `accounts.ts` - PDA derivation (getDealAddress, getOfferAddress)
- `constants.ts` - Program ID, cluster config, token mints

### Phase 3.5: Supabase Integration
- `supabase.ts` - Client factory
- `SupabaseProvider.tsx` - Context provider
- `useMarketDeals.ts` - All open deals (public fields only)
- `useMyDeals.ts` - User's deals with decryption
- `decryption.ts` - Decrypt ciphertexts from Supabase rows

### Phase 4: Deal Creation
- `useCreateDeal.ts` - Encrypt amount/price, build tx, send to Solana
- Integrate with `CreateDealForm.tsx`
- After tx confirms -> Indexer captures -> Supabase updated -> UI reflects

### Phase 5: Offer Submission
- `useSubmitOffer.ts` - Encrypt price/amount, build tx, send to Solana
- Integrate with `MakeOfferForm.tsx`
- Same flow: Solana -> Indexer -> Supabase -> UI

### Phase 6: User's Offers
- `useMyOffers.ts` - User's offers with decryption
- `useOffersForDeal.ts` - Offer count per deal (public)

### Phase 7: Data Flow Integration
- Wire up all providers in `layout.tsx`
- Replace mock data in `page.tsx` with hooks
- Components receive live data from Supabase

### Phase 8: Error Handling & UX
- Transaction status component
- Key derivation modal (explain what user is signing)
- Loading states, error states

---

## Key Data Hooks

| Hook | Source | Decryption | Purpose |
|------|--------|------------|---------|
| `useMarketDeals` | Supabase | No | All open deals (public fields) |
| `useMyDeals` | Supabase | Yes | User's deals with amount/price |
| `useMyOffers` | Supabase | Yes | User's offers with amount/price |
| `useOffersForDeal` | Supabase | No | Offer count for a deal |
| `useCreateDeal` | Solana | N/A | Create new deal (write) |
| `useSubmitOffer` | Solana | N/A | Submit offer (write) |

---

## Encryption Flow

### Creating a Deal
1. User enters amount + price
2. Convert price to X64.64 fixed-point
3. Derive shared secret: `x25519(userPrivateKey, mxePublicKey)`
4. Encrypt with RescueCipher: `cipher.encrypt([amount, price], nonce)`
5. Send encrypted ciphertext to Solana
6. Arcium MPC decrypts, re-encrypts for storage

### Reading User's Own Deal
1. Fetch from Supabase (includes `encryption_key`, `nonce`, `ciphertexts`)
2. Check if `encryption_key` matches user's pubkey
3. Derive shared secret with MXE pubkey
4. Decrypt: `cipher.decrypt(ciphertexts, nonce)`
5. Parse amount (u64) + price (u128 X64.64)

---

## Environment Variables

```bash
# Solana
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_OTC_PROGRAM_ID=<program_id>
NEXT_PUBLIC_ARCIUM_CLUSTER_OFFSET=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
```

---

## Prerequisites

1. **Indexer deployed** - Populates Supabase from on-chain events
2. **Supabase schema created** - `deals` and `offers` tables
3. **Program deployed** - OTC program with computation definitions initialized
4. **Cranker (optional)** - Auto-settles expired deals

---

## File Structure

```
frontend/app/otc/
├── _providers/
│   ├── SolanaProvider.tsx
│   ├── SupabaseProvider.tsx
│   ├── OtcProvider.tsx
│   └── DerivedKeysProvider.tsx
├── _hooks/
│   ├── useDerivedKeys.ts
│   ├── useMarketDeals.ts
│   ├── useMyDeals.ts
│   ├── useMyOffers.ts
│   ├── useCreateDeal.ts
│   └── useSubmitOffer.ts
├── _lib/
│   ├── constants.ts
│   ├── encryption.ts
│   ├── decryption.ts
│   ├── supabase.ts
│   ├── accounts.ts
│   └── database.types.ts (generated)
└── _components/
    ├── WalletButton.tsx
    └── ... (existing)
```

---

## Quick Reference

| Action | Technology | Data |
|--------|------------|------|
| Connect wallet | Wallet Adapter | - |
| Derive keys | Noble hashes | ed25519 + x25519 |
| Create deal | Anchor + Arcium | Encrypted to MPC |
| Submit offer | Anchor + Arcium | Encrypted to MPC |
| Read market | Supabase REST | Public fields |
| Read own data | Supabase + decrypt | Private fields |
| Live updates | Supabase Realtime | WebSocket |
