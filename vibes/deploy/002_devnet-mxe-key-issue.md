# Devnet MXE Public Key Issue

## Problem

When running tests against devnet, all tests fail with:
```
Error: Failed to fetch MXE public key after 3 attempts
```

The `getMXEPublicKey()` function from `@arcium-hq/client` returns `null`.

## Investigation

### 1. MXE Account Exists

The MXE account for the program exists on devnet:

```
Program ID: 8wCCLUv68ofgoNg3AKbahgeqZitorLcgbRXQeHj7FpMd
MXE Account Address: A3J6FReTAcNCsaPsnqBP6chcS5FsKs8WxwG1vohQpWG4
MXE Account Owner: F3G6Q9tRicyznCqcZLydJ6RxkwDSBeHWM458J7V6aeyk (Arcium Program)
MXE Account Data Length: 302 bytes
```

### 2. Utility Public Keys Not Set

The MXE account's `utilityPubkeys` field is in `unset` state:

```javascript
{
  utilityPubkeys: {
    unset: [
      { x25519Pubkey: [0, 0, 0, ...], ed25519VerifyingKey: [...] },  // All zeros
      [false, false]  // Node confirmations - neither node has confirmed
    ]
  }
}
```

### 3. How getMXEPublicKey Works

From `@arcium-hq/client` v0.5.4:

```javascript
async function getMXEUtilityKey(provider, mxeProgramId, field) {
    const program = getArciumProgram(provider);
    const mxeAccAddress = getMXEAccAddress(mxeProgramId);
    const mxeAccInfo = await program.account.mxeAccount.fetch(mxeAccAddress);

    if ('set' in mxeAccInfo.utilityPubkeys) {
        // Keys are finalized
        const setData = mxeAccInfo.utilityPubkeys.set;
        return new Uint8Array(setData[0][field]);
    }
    else if ('unset' in mxeAccInfo.utilityPubkeys) {
        // Keys still being collected from nodes
        const unsetData = mxeAccInfo.utilityPubkeys.unset;
        if (unsetData[1].every(Boolean)) {
            // All nodes have submitted - return the aggregated key
            return new Uint8Array(unsetData[0][field]);
        }
    }
    return null;  // <-- This is what's happening
}
```

The function returns `null` because:
- Status is `unset` (not `set`)
- Node confirmations are `[false, false]` - neither Arcium node has submitted their key share
- `unsetData[1].every(Boolean)` evaluates to `false`

## Root Cause

The MXE account was created on devnet (likely via `init_*_comp_def` instructions), but the Arcium network nodes have not yet populated their x25519 public key shares.

This is a **devnet infrastructure issue**, not a code issue. The Arcium devnet nodes need to:
1. Detect the new MXE account
2. Each node submits its key share contribution
3. Once all nodes confirm (`[true, true]`), the key becomes available

## Devnet Cluster Information

From Arcium docs (https://docs.arcium.com/developers/deployment):

| Cluster Offset | Version |
|----------------|---------|
| **123** | v0.5.4 |
| **456** | v0.6.3 (recommended) |

We are using cluster 123 with `@arcium-hq/client` v0.5.4 - this version pairing is correct.

## Possible Solutions

### Option 1: Wait for Node Processing
The nodes may eventually process the MXE account. Try again later. DKG can take time on devnet.

### Option 2: Contact Arcium Support ◄── Done
Reached out to Arcium team (Discord/support) to:
- Verify devnet cluster 123 nodes are operational
- Check if there's a registration step required
- Request manual processing of the MXE account

### Option 3: Re-initialize MXE Account
There may be a specific Arcium instruction or CLI command to trigger node key submission. Try:
```bash
arcium deploy --skip-deploy --cluster-offset 123 \
  --keypair-path ~/.config/solana/id.json \
  --rpc-url https://api.devnet.solana.com
```

### Option 4: Try Cluster 456 (Different Version)
Cluster 456 runs v0.6.3 - would require upgrading dependencies:
```toml
arcium-anchor = "0.6.3"
arcium-macros = "0.6.3"
arcis = "0.6.3"
```
Only try this if cluster 123 is confirmed non-operational.

## Verification Script

Run this to check current status:

```bash
node -e "
const { getMXEAccAddress, getArciumProgram } = require('@arcium-hq/client');
const { PublicKey, Connection } = require('@solana/web3.js');
const { AnchorProvider } = require('@coral-xyz/anchor');

const programId = new PublicKey('8wCCLUv68ofgoNg3AKbahgeqZitorLcgbRXQeHj7FpMd');
const mxeAddress = getMXEAccAddress(programId);
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

const provider = new AnchorProvider(connection, {
  publicKey: programId,
  signTransaction: async (tx) => tx,
  signAllTransactions: async (txs) => txs,
}, { commitment: 'confirmed' });

async function check() {
  const program = getArciumProgram(provider);
  const mxeAccInfo = await program.account.mxeAccount.fetch(mxeAddress);

  console.log('MXE Account:', mxeAddress.toBase58());
  console.log('Status:', Object.keys(mxeAccInfo.utilityPubkeys)[0]);

  if ('unset' in mxeAccInfo.utilityPubkeys) {
    const unsetData = mxeAccInfo.utilityPubkeys.unset;
    console.log('Node confirmations:', unsetData[1]);
    console.log('Ready:', unsetData[1].every(Boolean));
  } else {
    console.log('Keys are SET and ready to use');
  }
}

check().catch(console.error);
"
```

When the output shows `Ready: true` or `Keys are SET`, the tests should work.

## Related Files

- `tests/harness.ts:103-130` - `getMXEPublicKeyWithRetry()` function
- `frontend/app/otc/_providers/OtcProvider.tsx:131-166` - Frontend MXE key fetch
