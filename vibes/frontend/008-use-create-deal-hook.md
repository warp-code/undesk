# Plan: Implement `useCreateDeal` Hook (Phase 4)

## Overview

Create a React hook that allows users to create encrypted OTC deals on-chain. The hook will handle encryption, transaction building, and awaiting finalization.

## Existing Infrastructure

**Already available:**
- `OtcProvider` - Anchor program, MXE public key, `arciumAccounts` helpers
- `DerivedKeysProvider` - Controller keypair + encryption keys from wallet signature
- `SupabaseProvider` - Database client (not needed for creation, indexer handles storage)
- `encryption.ts` - `createCipher`, `encryptDealInput`, `toX64Price`, `generateNonce`, `nonceToU128`
- `tokens.ts` - `getTokenInfo(mint).decimals` for decimal conversion
- `accounts.ts` - `getDealAddress(programId, createKey)` already exists

## Implementation

### File: `frontend/app/otc/_hooks/useCreateDeal.ts`

```typescript
interface CreateDealInput {
  baseMint: string;      // Token being sold (base58)
  quoteMint: string;     // Token to receive (base58)
  amount: number;        // Human-readable amount (e.g., 100.5)
  price: number;         // Price per base token in quote units (e.g., 2.5)
  expiresInHours: number;
  allowPartial: boolean;
}

interface UseCreateDealReturn {
  createDeal: (input: CreateDealInput) => Promise<string>;  // Returns deal address
  isCreating: boolean;
  error: string | null;
}
```

### Logic Flow

1. **Validate prerequisites**
   - Check `program` is available (wallet connected)
   - Check `mxePublicKey` is available
   - Check `derivedKeys` exists (user signed derivation messages)

2. **Prepare encryption**
   - Create cipher: `createCipher(derivedKeys.encryption.privateKey, mxePublicKey)`
   - Generate nonce: `generateNonce()`
   - Convert amount to base units using token decimals
   - Convert price to X64.64: `toX64Price(price)`
   - Encrypt: `encryptDealInput(cipher, amountBigInt, priceBigInt, nonce)`

3. **Build accounts**
   - Generate ephemeral `createKey = Keypair.generate()`
   - Derive deal PDA using existing `getDealAddress(programId, createKey.publicKey)`
   - Get Arcium accounts via `arciumAccounts` helpers from OtcProvider
   - Generate random `computationOffset` (BN from 8 random bytes)

4. **Send transaction**
   ```typescript
   program.methods.createDeal(
     computationOffset,
     derivedKeys.controller.publicKey,
     Array.from(derivedKeys.encryption.publicKey),
     nonceToU128(nonce),
     expiresAt,  // BN: current unix timestamp + hours*3600
     allowPartial,
     Array.from(ciphertext[0]),
     Array.from(ciphertext[1])
   )
   .accountsPartial({
     createKey: createKey.publicKey,
     deal: dealAddress,
     baseMint: new PublicKey(baseMint),
     quoteMint: new PublicKey(quoteMint),
     computationAccount: arciumAccounts.getComputationAccAddress(computationOffset),
     clusterAccount: arciumAccounts.getClusterAccAddress(),
     mxeAccount: arciumAccounts.getMXEAccAddress(),
     mempoolAccount: arciumAccounts.getMempoolAccAddress(),
     executingPool: arciumAccounts.getExecutingPoolAccAddress(),
     compDefAccount: arciumAccounts.getCompDefAccAddress("CREATE_DEAL"),
   })
   .signers([createKey])
   .rpc({ skipPreflight: true, commitment: "confirmed" })
   ```

5. **Await finalization**
   - Use `awaitComputationFinalization` from `@arcium-hq/client`
   - Return deal address on success

### Helper: Amount Conversion (add to hook or encryption.ts)

```typescript
function toBaseUnits(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * 10 ** decimals));
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `frontend/app/otc/_hooks/useCreateDeal.ts` | **Create** | Main hook |
| `frontend/app/otc/_components/CreateDealForm.tsx` | **Modify** | Wire up hook |

## Integration with CreateDealForm

The form currently has a mock `handleSubmit` with setTimeout. Replace with real implementation:

```typescript
const { createDeal, isCreating, error } = useCreateDeal();
const { derivedKeys, hasDerivedKeys, deriveKeysFromWallet } = useDerivedKeysContext();

const handleSubmit = async () => {
  if (!hasDerivedKeys) {
    await deriveKeysFromWallet();
    return; // Let user click again after signing
  }

  try {
    setIsLocked(true);
    const dealAddress = await createDeal({
      baseMint: sellMint,
      quoteMint: quoteMint,
      amount: parseFloat(sellAmount),
      price: parseFloat(pricePerUnit),
      expiresInHours: parseFloat(expiresIn),
      allowPartial,
    });

    // Create local Deal object for UI update
    const newDeal: Deal = {
      id: dealAddress,
      baseMint: sellMint,
      quoteMint: quoteMint,
      amount: parseFloat(sellAmount),
      price: parseFloat(pricePerUnit),
      total: parseFloat(sellAmount) * parseFloat(pricePerUnit),
      status: "open",
      isPartial: false,
      allowPartial,
      expiresAt: Date.now() + parseFloat(expiresIn) * 3600000,
      createdAt: Date.now(),
    };
    onDealCreated(newDeal);
  } catch (err) {
    console.error("Failed to create deal:", err);
    // Show error to user
  } finally {
    setIsLocked(false);
  }
};
```

## Dependencies

From `@arcium-hq/client`:
- `awaitComputationFinalization` - Wait for Arcium to process

From `@coral-xyz/anchor`:
- `BN` - Big number handling

From `@solana/web3.js`:
- `Keypair`, `PublicKey`

## Error Handling

| Condition | Error Message |
|-----------|---------------|
| No wallet connected | "Wallet not connected" |
| No derived keys | "Please sign to derive encryption keys" |
| MXE key unavailable | "MXE public key not available" |
| Transaction failed | Forward error message |
| Finalization timeout | "Computation finalization timed out" |

## Verification

1. Start localnet: `./kill-validator.sh && arcium test` (or just run Arcium localnet)
2. Start indexer: `yarn workspace @otc/indexer start`
3. Start frontend: `yarn dev`
4. Connect wallet, derive keys
5. Create a deal via the form
6. Verify:
   - Transaction appears in Solana explorer
   - Deal appears in "My Deals" tab after indexer picks it up
   - Decrypted amount/price match input values

## Notes

- The indexer will pick up `DealCreated` event and store in Supabase
- No need to manually insert into database
- The `useMyDeals` hook will show the new deal once indexed
- Consider adding optimistic UI update + refetch after creation for better UX
