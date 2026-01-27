# Wallet Change Key Derivation Issue

## Problem

When a user changes their wallet inside the wallet adapter UI (e.g., switching from one Phantom account to another, or switching from Phantom to Solflare), the derived encryption keys are not automatically re-derived.

This means:
- The old wallet's derived keys remain in state
- Data encrypted with the new wallet's keys cannot be decrypted
- User's deals/offers from the new wallet won't display correctly

## Current Behavior

The `DerivedKeysProvider` derives keys when:
1. User explicitly clicks "Sign & Submit" (calls `deriveKeysFromWallet`)
2. On initial connection if keys don't exist

It does NOT re-derive when:
- User switches accounts within the same wallet
- User disconnects and connects a different wallet
- Wallet adapter emits a `publicKey` change event

## Recommended Fix

Listen for wallet/publicKey changes in `DerivedKeysProvider` and clear derived keys when the wallet changes:

```typescript
// In DerivedKeysProvider
const { publicKey, connected } = useWallet();
const prevPublicKey = useRef<string | null>(null);

useEffect(() => {
  const currentKey = publicKey?.toBase58() ?? null;

  // If wallet changed, clear derived keys
  if (prevPublicKey.current !== null && currentKey !== prevPublicKey.current) {
    setDerivedKeys(null);
  }

  prevPublicKey.current = currentKey;
}, [publicKey]);
```

This ensures users must re-sign to derive keys when switching wallets.

## Priority

High - This can cause confusing UX where users see stale/incorrect data after switching wallets.
