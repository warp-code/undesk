# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Solana smart contract project using Anchor with Arcium integration for confidential computing. The project enables encrypted computations on-chain using Arcium as a co-processor.

## Commands

### Build and Test
```bash
arcium build                    # Build Solana programs
arcium test                     # Run tests (starts localnet + Arcium)
yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"  # Run tests directly
```

### Frontend
```bash
yarn dev                        # Start Next.js dev server (runs frontend workspace)
yarn workspace frontend build   # Build frontend
yarn workspace frontend lint    # Lint frontend
```

### Code Quality
```bash
yarn lint                       # Check formatting with Prettier
yarn lint:fix                   # Fix formatting with Prettier
```

## Architecture

### Two-Location Development Pattern

Code is written in three places:

1. **`programs/otc/`** - Standard Anchor program (Rust)
   - Handles plaintext Solana operations
   - Defines instructions that queue confidential computations
   - Receives callbacks with encrypted results

2. **`encrypted-ixs/`** - Arcis encrypted instructions (Rust)
   - Defines confidential computing operations using the Arcis framework
   - Operations execute off-chain on the Arcium network
   - Uses `#[encrypted]` and `#[instruction]` macros

3. **`frontend/`** - Next.js web application
   - Next.js 16.1.1 with React 19
   - TypeScript 5
   - Tailwind CSS v4 for styling
   - Configured as a yarn workspace

### Confidential Computation Flow

Each confidential operation requires three components:

1. **Initialization instruction** (`init_*_comp_def`) - Registers the computation definition
2. **Queue instruction** - Sends encrypted inputs to Arcium via `queue_computation()`
3. **Callback instruction** (`*_callback`) - Receives and verifies encrypted outputs with `#[arcium_callback]`

### Key Macros

- `#[arcium_program]` - Marks the main program module
- `#[queue_computation_accounts("name", payer)]` - Generates required accounts for queuing
- `#[callback_accounts("name")]` - Generates required accounts for callbacks
- `#[init_computation_definition_accounts("name", payer)]` - Generates init accounts
- `#[arcium_callback(encrypted_ix = "name")]` - Links callback to encrypted instruction

### Stack Size Issues

If you see "Stack offset exceeded max offset of 4096" errors:
- **Your code** (e.g., `otc::instructions::...`): Box large accounts: `Account<'info, T>` → `Box<Account<'info, T>>`
- **arcium-client internal** (e.g., `arcium_client::idl::...`): Safe to ignore

### Encryption Pattern

Uses x25519 key exchange with RescueCipher:
```typescript
const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
const cipher = new RescueCipher(sharedSecret);
const ciphertext = cipher.encrypt(plaintext, nonce);
```

### ArgBuilder Patterns (Critical)

See `arcium-findings.md` for full details. Quick reference:

| Parameter Type | ArgBuilder Calls |
|----------------|------------------|
| `Mxe` (marker) | `.plaintext_u128(nonce)` |
| `Shared` (marker) | `.x25519_pubkey(pubkey)` + `.plaintext_u128(nonce)` |
| `Enc<Mxe, &T>` (by ref) | `.plaintext_u128(stored_nonce)` + `.account(key, ciphertext_offset, ciphertext_len)` |
| `Enc<Shared, T>` (by value) | `.x25519_pubkey()` + `.plaintext_u128(nonce)` + `.encrypted_*()` per field |
| `bool` (plaintext) | `.plaintext_bool(value)` |
| `u8/u16/u32/u64/u128` (plaintext) | `.plaintext_u8()` / `.plaintext_u16()` / etc. |

**Key points:**
- For `Enc<Mxe, &T>` by reference: pass nonce separately, then reference only ciphertext portion (offset 24 = skip 8-byte discriminator + 16-byte nonce)
- Arguments must match parameter order in the encrypted instruction
- Decryption uses `x25519.getSharedSecret(yourPrivateKey, mxePublicKey)` - NOT the `encryption_key` from events (that's your pubkey echoed back)
- "Unknown action 'undefined'" = ArgBuilder args don't match instruction signature
- "InvalidArguments" (6301) = wrong argument format/offsets
- **Use the correct plaintext method for each type**: `bool` requires `.plaintext_bool()`, NOT `.plaintext_u8()`. Using the wrong method causes "Unknown action 'undefined'" errors.

## Key Dependencies

- **Anchor** 0.32.1 - Solana framework
- **Arcium** 0.5.4 - `arcium-anchor`, `arcium-client`, `arcium-macros`
- **Arcis** 0.5.4 - Encrypted instruction framework
- **Next.js** 16.1.1 - Frontend (in `frontend/` workspace)

## Testing

**To run tests properly, always kill the validator first:**
```bash
./kill-validator.sh && arcium test
```

The `kill-validator.sh` script kills any running solana-test-validator (port 8899) and stops/removes arcium docker containers. This ensures a clean state before running tests.

Tests require Arcium localnet running (configured in `Arcium.toml`):
- 2 nodes
- 60 second timeout
- Cerberus MPC backend

Tests expect a Solana keypair at `~/.config/solana/id.json`.

## User Preferences

- **Never run the dev server** - The user will run `yarn dev` themselves. Do not start the development server.