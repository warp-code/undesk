# Implementation Plan: `useSubmitOffer` Hook

## Overview

Create a React hook to submit encrypted offers to existing OTC deals on-chain, following the exact pattern from `tests/submit-offer.test.ts`.

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `frontend/app/otc/_hooks/useSubmitOffer.ts` | **Create** | Main hook |
| `frontend/app/otc/_components/MakeOfferForm.tsx` | **Modify** | Wire up hook |

---

## Step 1: Create `useSubmitOffer.ts`

**Location:** `frontend/app/otc/_hooks/useSubmitOffer.ts`

### Interface

```typescript
interface SubmitOfferInput {
  dealAddress: string;    // The deal to submit an offer to (base58)
  baseMint: string;       // Base mint for decimal lookup (from MarketDeal)
  amount: number;         // Human-readable amount of base token
  price: number;          // Price per unit in quote token
}

interface UseSubmitOfferReturn {
  submitOffer: (input: SubmitOfferInput) => Promise<string>;  // Returns offer address
  isSubmitting: boolean;
  error: string | null;
}
```

### Implementation Logic (follow test pattern exactly)

1. **Prerequisites check:**
   - `program` from `useOtc()` (wallet connected)
   - `mxePublicKey` from `useOtc()`
   - `derivedKeys` from `useDerivedKeysContext()`

2. **Encryption (from encryption.ts):**
   ```typescript
   const cipher = createCipher(derivedKeys.encryption.privateKey, mxePublicKey);
   const nonce = generateNonce();
   const priceBigInt = toX64Price(price);
   const amountBigInt = toBaseUnits(amount, decimals);  // Use baseMint from input
   // IMPORTANT: OfferInput struct order is price first, then amount
   const ciphertext = encryptOfferInput(cipher, priceBigInt, amountBigInt, nonce);
   ```

3. **Generate accounts:**
   ```typescript
   const createKey = Keypair.generate();
   const offerAddress = getOfferAddress(programId, new PublicKey(dealAddress), createKey.publicKey);
   const computationOffset = new BN(crypto.getRandomValues(new Uint8Array(8)), "le");
   ```

4. **Build transaction (match test lines 186-215):**
   ```typescript
   await program.methods
     .submitOffer(
       computationOffset,
       derivedKeys.controller.publicKey,      // controller
       Array.from(derivedKeys.encryption.publicKey),  // encryption_pubkey
       nonceToU128(nonce),                    // nonce as u128
       Array.from(ciphertext[0]),              // encrypted_price
       Array.from(ciphertext[1])               // encrypted_amount
     )
     .accountsPartial({
       createKey: createKey.publicKey,
       deal: new PublicKey(dealAddress),
       offer: offerAddress,
       computationAccount: arciumAccounts.getComputationAccAddress(computationOffset),
       clusterAccount: arciumAccounts.getClusterAccAddress(),
       mxeAccount: arciumAccounts.getMXEAccAddress(),
       mempoolAccount: arciumAccounts.getMempoolAccAddress(),
       executingPool: arciumAccounts.getExecutingPoolAccAddress(),
       compDefAccount: arciumAccounts.getCompDefAccAddress("SUBMIT_OFFER"),
     })
     .signers([createKey])
     .rpc({ skipPreflight: true, commitment: "confirmed" });
   ```

   **Note:** Unlike `createDeal`, there are NO `baseMint`/`quoteMint` accounts - just `deal` and `offer`.

5. **Await finalization:**
   ```typescript
   import { awaitComputationFinalization } from "@arcium-hq/client";
   await awaitComputationFinalization(provider, computationOffset, programId, "confirmed");
   ```

6. **Return offer address**

### Key Differences from useCreateDeal

| Aspect | useCreateDeal | useSubmitOffer |
|--------|---------------|----------------|
| Instruction args order | `encrypted_amount`, `encrypted_price` | `encrypted_price`, `encrypted_amount` |
| Encryption function | `encryptDealInput(cipher, amount, price, nonce)` | `encryptOfferInput(cipher, price, amount, nonce)` |
| PDA derivation | `getDealAddress(programId, createKey)` | `getOfferAddress(programId, dealAddress, createKey)` |
| Comp def name | `"CREATE_DEAL"` | `"SUBMIT_OFFER"` |
| Additional params | expiresAt, allowPartial | None |
| Accounts | baseMint, quoteMint, deal | deal, offer (NO baseMint/quoteMint) |
| Required context | baseMint, quoteMint | dealAddress (+ baseMint for decimals) |

**IDL Verification:**
```
create_deal args: computation_offset, controller, encryption_pubkey, nonce, expires_at, allow_partial, encrypted_amount, encrypted_price
submit_offer args: computation_offset, controller, encryption_pubkey, nonce, encrypted_price, encrypted_amount
```

### Required Imports

```typescript
import { useState, useCallback } from "react";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { awaitComputationFinalization } from "@arcium-hq/client";
import { useOtc } from "../_providers/OtcProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { getOfferAddress } from "../_lib/accounts";
import { getTokenInfo } from "../_lib/tokens";
import {
  createCipher,
  encryptOfferInput,
  toX64Price,
  generateNonce,
  nonceToU128,
} from "../_lib/encryption";
```

---

## Step 2: Modify `MakeOfferForm.tsx`

The form receives a `MarketDeal` prop which contains `baseMint` and `quoteMint`.

### Current Form State
```typescript
const [offerAmount, setOfferAmount] = useState("");
const [offerPrice, setOfferPrice] = useState("");
const [isOfferLoading, setIsOfferLoading] = useState(false);
```

### Add imports

```typescript
import { useSubmitOffer } from "../_hooks/useSubmitOffer";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
```

### Add hooks in component

```typescript
const { submitOffer, isSubmitting, error } = useSubmitOffer();
const { hasDerivedKeys, deriveKeysFromWallet, isDerivingKeys } = useDerivedKeysContext();
```

### Replace handlePlaceOffer

```typescript
const handlePlaceOffer = async () => {
  if (!canPlaceOffer) return;

  // Prompt key derivation if needed
  if (!hasDerivedKeys) {
    try {
      await deriveKeysFromWallet();
    } catch (e) {
      console.error("Key derivation failed:", e);
      return;
    }
    return; // Let user click again after signing
  }

  setIsOfferLoading(true);

  try {
    const offerAddress = await submitOffer({
      dealAddress: deal.id,  // MarketDeal.id is the deal address
      baseMint: deal.baseMint,
      amount: parseFloat(offerAmount),
      price: parseFloat(offerPrice),
    });

    console.log("Offer submitted:", offerAddress);
    onOfferPlaced();
  } catch (err) {
    console.error("Failed to submit offer:", err);
  } finally {
    setIsOfferLoading(false);
  }
};
```

### Update button disabled state

```typescript
disabled={!canPlaceOffer || isSubmitting || isDerivingKeys}
```

### Update button styling

```typescript
className={`w-full py-3 rounded-md font-medium transition-colors flex items-center justify-center ${
  canPlaceOffer && !isSubmitting && !isDerivingKeys
    ? "bg-primary hover:bg-primary/80 text-primary-foreground"
    : "bg-secondary text-muted-foreground cursor-not-allowed"
}`}
```

### Update button text

```typescript
{isDerivingKeys
  ? "Signing..."
  : isOfferLoading
    ? "Submitting..."
    : !hasDerivedKeys
      ? "Sign & Submit"
      : "Place Offer"}
```

---

## Error Handling

| Condition | Error Message |
|-----------|---------------|
| No wallet | "Wallet not connected" |
| No derived keys | "Please sign to derive encryption keys" |
| No MXE key | "MXE public key not available" |
| Deal not found | "Deal not found" |
| Transaction fail | Forward error.message |

---

## Verification Steps

1. Start localnet: `./kill-validator.sh && arcium test`
2. Create a deal first (using CreateDealForm)
3. Navigate to Market tab, find the deal
4. Click to open MakeOfferForm
5. Fill in amount and price
6. Click "Place Offer"
7. Sign 2 messages for key derivation (first time only)
8. Wait for transaction + finalization
9. Verify:
   - Check browser console for offer address
   - Transaction visible in Solana explorer
   - Offer appears in "My Offers" tab (after indexer processes event)
   - Deal's offer count increments

---

## Key Details from Test Pattern

- **IDL args order**: `computation_offset`, `controller`, `encryption_pubkey`, `nonce`, `encrypted_price`, `encrypted_amount`
- **OfferInput struct order**: price (u128) first, then amount (u64) - OPPOSITE of DealInput
- **encryptOfferInput signature**: `encryptOfferInput(cipher, price, amount, nonce)` - price first!
- **Nonce format**: 16-byte Uint8Array → `nonceToU128()` → BN
- **Price format**: Human price → `toX64Price()` → bigint (X64.64 fixed-point)
- **Amount format**: Human amount → `toBaseUnits(amount, decimals)` → bigint
- **Ciphertext**: `cipher.encrypt()` returns `number[][]`, pass as `Array.from(ciphertext[i])`
- **createKey**: Ephemeral Keypair, must be passed as signer
- **Offer PDA**: Derived from `["offer", deal.toBuffer(), createKey.toBuffer()]`
- **No baseMint/quoteMint accounts**: Unlike createDeal, submitOffer only needs `deal` and `offer` accounts

---

## Existing Infrastructure

**Already available:**
- `OtcProvider` - Anchor program, MXE public key, `arciumAccounts` helpers
- `DerivedKeysProvider` - Controller keypair + encryption keys from wallet signature
- `encryption.ts` - `createCipher`, `encryptOfferInput`, `toX64Price`, `generateNonce`, `nonceToU128`
- `tokens.ts` - `getTokenInfo(mint).decimals` for decimal conversion
- `accounts.ts` - `getOfferAddress(programId, deal, createKey)` already exists

---

## Notes

- The indexer will pick up `OfferCreated` event and store in Supabase
- No need to manually insert into database
- The `useMyOffers` hook will show the new offer once indexed
- Deal's `numOffers` counter is incremented on-chain in the callback
