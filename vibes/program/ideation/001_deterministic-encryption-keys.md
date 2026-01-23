# Deterministic Keys from Wallet Signatures

## Context

When building privacy-preserving applications, we need deterministic keypairs that:
1. Can be regenerated on any device without storage
2. Are unique to each user (wallet)
3. Don't reveal the user's main wallet on-chain

**Two key types needed:**
- **x25519** - for encryption/decryption (Arcium key exchange)
- **ed25519** - for signing authority (controller of on-chain accounts)

## Solution: Signature-Derived Keys

Derive keypairs deterministically from wallet signatures:

1. **User signs a deterministic message** with their wallet (e.g., Phantom)
2. **Hash the signature** to create a 32-byte seed
3. **Use the seed as the private key** (x25519 or ed25519)

```
User Wallet
    │
    ├── signs "otc:controller:v1" ──hash──► controller keypair (ed25519)
    │                                           └── signing authority for deals/offers
    │
    └── signs "otc:encryption:v1" ──hash──► encryption keypair (x25519)
                                                └── decrypt events from MXE
```

### Why This Works

- Same wallet + same message = same signature = same keypair, every time
- User can regenerate keys on any device by signing the message again
- No need to store private keys - derived on-demand
- Only the wallet owner can produce that signature
- Different messages → different keypairs (controller vs encryption)

## Implementation

```typescript
import { sha256 } from '@noble/hashes/sha256';
import { x25519 } from '@noble/curves/ed25519';
import { Keypair } from '@solana/web3.js';

const CONTROLLER_MESSAGE = "otc:controller:v1";
const ENCRYPTION_MESSAGE = "otc:encryption:v1";

async function deriveKeypair(
  wallet: WalletAdapter,
  purpose: string
): Promise<Uint8Array> {
  // Include wallet pubkey to ensure uniqueness across wallets
  const message = `${purpose}\nWallet: ${wallet.publicKey.toBase58()}`;
  const signature = await wallet.signMessage(new TextEncoder().encode(message));
  return sha256(signature);
}

// Derive ed25519 controller keypair (for signing transactions)
async function getControllerKeypair(wallet: WalletAdapter): Promise<Keypair> {
  const seed = await deriveKeypair(wallet, CONTROLLER_MESSAGE);
  return Keypair.fromSeed(seed);
}

// Derive x25519 encryption keypair (for Arcium key exchange)
async function getEncryptionKeypair(wallet: WalletAdapter): Promise<{
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}> {
  const privateKey = await deriveKeypair(wallet, ENCRYPTION_MESSAGE);
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}
```

## Usage Pattern

```typescript
// On app load, derive both keypairs
const controller = await getControllerKeypair(wallet);
const encryption = await getEncryptionKeypair(wallet);

// Controller signs transactions for deals/offers
const tx = new Transaction().add(cancelDealIx);
tx.sign(controller);

// Encryption key for Arcium decryption
const sharedSecret = x25519.getSharedSecret(encryption.privateKey, mxePublicKey);
const cipher = new RescueCipher(sharedSecret);
```

## On-Chain Account Structure

Both derived pubkeys are stored on accounts:

```
┌─────────────────────────────────┐
│  Deal / Offer Account           │
├─────────────────────────────────┤
│  create_key: Pubkey             │ ← ephemeral (PDA uniqueness)
│  controller: Pubkey             │ ← derived ed25519 (signing authority)
│  encryption_pubkey: [u8; 32]    │ ← derived x25519 (event routing)
│  ...                            │
└─────────────────────────────────┘
```

- **`create_key`** - ephemeral signer, unique per account, used in PDA seeds
- **`controller`** - derived, reusable, one per user, can control many accounts
- **`encryption_pubkey`** - derived, for routing encrypted events to the owner

## Security Considerations

- Use different messages for controller vs encryption to keep keys independent
- Messages should be app-specific to prevent cross-app key reuse
- Including wallet pubkey prevents collision if two wallets signed identically
- Signatures never leave the client - only derived public keys are shared/stored
- Users should see clear UI explaining what they're signing

## Privacy Benefits

The derived `controller` pubkey breaks the on-chain link between a user's main wallet and their deals/offers:
- Main wallet only signs the derivation message (off-chain)
- Controller pubkey appears on-chain with no visible connection to main wallet
- Funding can be done via privacy protocols for maximum unlinkability

## Source

Recommendation from Arcium developer: "Have the user sign a message and use that to create a deterministic keypair for encryption so that you can use it later down the line to regenerate/re-derive it."
