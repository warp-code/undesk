# Deterministic Encryption Keys from Wallet Signatures

## Context

When using Arcium for encrypted computations, the client needs an x25519 keypair for key exchange with the MXE. In tests, we generate random keys:

```typescript
const privateKey = x25519.utils.randomSecretKey();
const publicKey = x25519.getPublicKey(privateKey);
```

**Problem:** Random keys are ephemeral. If you need to decrypt data later (after page refresh, new session, different device), the private key is lost forever.

## Solution: Signature-Derived Keys

Derive the encryption keypair deterministically from a wallet signature:

1. **User signs a deterministic message** with their wallet (e.g., Phantom)
2. **Hash the signature** to create a 32-byte seed
3. **Use the seed as the x25519 private key**

### Why This Works

- Same wallet + same message = same signature = same keypair, every time
- User can regenerate encryption keys on any device by signing the message again
- No need to store the private key - it's derived on-demand
- Only the wallet owner can produce that signature, so only they can derive the keys

## Implementation

```typescript
import { sha256 } from '@noble/hashes/sha256';
import { x25519 } from '@noble/curves/ed25519';

async function getEncryptionKeypair(wallet: WalletAdapter): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  // Include wallet pubkey to ensure uniqueness across wallets
  const message = `Sign to generate your encryption keys for OTC App\nWallet: ${wallet.publicKey.toBase58()}`;

  // Request signature from wallet
  const signature = await wallet.signMessage(new TextEncoder().encode(message));

  // Hash signature to get deterministic 32-byte seed
  const privateKey = sha256(signature);
  const publicKey = x25519.getPublicKey(privateKey);

  return { privateKey, publicKey };
}
```

## Usage Pattern

```typescript
// On app load or when needed for encryption/decryption
const { privateKey, publicKey } = await getEncryptionKeypair(wallet);

// Use for Arcium key exchange
const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
const cipher = new RescueCipher(sharedSecret);
```

## Security Considerations

- The signed message should be app-specific to prevent cross-app key reuse
- Including the wallet pubkey prevents key collision if two wallets somehow signed identically
- The signature never leaves the client - only the derived public key is shared
- Users should be shown a clear message explaining what they're signing

## Source

Recommendation from Arcium developer: "Have the user sign a message and use that to create a deterministic keypair for encryption so that you can use it later down the line to regenerate/re-derive it."
