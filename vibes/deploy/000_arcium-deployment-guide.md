# Arcium 0.5.4 Deployment Guide

This guide covers deploying your Arcium 0.5.4 program to Solana devnet/mainnet.

## Prerequisites

Before deploying, ensure you have:

- [ ] Successfully built project with `arcium build`
- [ ] Passing local tests via `arcium test`
- [ ] 2-5 SOL in your deployment keypair
- [ ] A reliable RPC endpoint (see RPC Providers below)

## The `arcium deploy` Command

### Basic Syntax

```bash
arcium deploy -o <cluster-offset> -k <keypair-path> -u <rpc-url>
```

### Command Options

| Option | Description | Required |
|--------|-------------|----------|
| `-o, --cluster-offset` | Arcium cluster identifier (offset) | Yes |
| `-k, --keypair-path` | Path to Solana keypair | Yes |
| `-u, --rpc-url` | RPC endpoint URL or shorthand (`d`=devnet, `m`=mainnet, `t`=testnet, `l`=localnet) | No (defaults to mainnet) |
| `-m, --mempool-size` | Queue capacity: `Tiny`, `Small`, `Medium`, `Large` | No (default: `Tiny`) |
| `-p, --program-keypair` | Custom program address keypair | No |
| `-n, --program-name` | Program name to deploy | No (default: `mxe`) |
| `--skip-deploy` | Skip program deployment, only init MXE account | No |
| `--skip-init` | Deploy program only, skip MXE account initialization | No |

### Devnet Command for Arcium 0.5.4

```bash
arcium deploy -o 123 -k ~/.config/solana/id.json \
  -u https://devnet.helius-rpc.com/?api-key=<your-api-key>
```

Or with full flag names:

```bash
arcium deploy --cluster-offset 123 --keypair-path ~/.config/solana/id.json \
  --rpc-url https://devnet.helius-rpc.com/?api-key=<your-api-key>
```

**Version-specific cluster offsets:**

| Arcium Version | Cluster Offset |
|----------------|----------------|
| **0.5.4** | `123` |
| 0.6.3+ | `456` |

## RPC Providers

Default Solana RPC endpoints are unreliable. Use one of these:

| Provider | Devnet URL | Free Tier |
|----------|------------|-----------|
| Helius | `https://devnet.helius-rpc.com/?api-key=<key>` | Yes |
| QuickNode | `https://api.devnet.solana.com` (custom) | Yes |
| Triton | `https://devnet.rpcpool.com` | Limited |

---

## Circuit Storage Options

Arcium supports two ways to store compiled circuits (`.arcis` files):

| Method | Pros | Cons |
|--------|------|------|
| **Onchain** (default) | Simple setup, no external dependencies | Expensive (several MBs = many txs), slow upload |
| **Offchain** | Cheap (single tx), fast | Requires public file hosting |

### Option A: Onchain Storage (Default)

Your code already uses onchain storage. Pass `None` for the circuit source:

```rust
pub fn init_comp_def_handler(ctx: Context<InitMyCompDef>) -> Result<()> {
    init_comp_def(ctx.accounts, None, None)?;
    Ok(())
}
```

**How it works:**
1. `arcium build` compiles circuits to `.arcis` files
2. `arcium deploy` automatically uploads circuit bytecode to Solana accounts
3. Circuit data is stored in accounts with seeds: `["ComputationDefinitionRaw", comp_def_acc, index]`
4. Multiple accounts may be needed for large circuits (chunked upload)

**Cost considerations:**
- Arcis circuits can be several MBs
- Each upload transaction has size limits (~1232 bytes)
- Large circuits require hundreds/thousands of transactions
- Each transaction costs SOL (rent + compute units)
- Upload can be slow (sequential transactions)

**Your current init functions already use onchain storage:**
```rust
// From create_deal.rs, add_together.rs, etc.
init_comp_def(ctx.accounts, None, None)?;  // None = onchain
```

### Option B: Offchain Storage

For cheaper/faster deployment, store circuits externally and reference by URL:

```rust
use arcium_client::idl::arcium::types::{CircuitSource, OffChainCircuitSource};
use arcium_macros::circuit_hash;

pub fn init_comp_def_handler(ctx: Context<InitMyCompDef>) -> Result<()> {
    init_comp_def(
        ctx.accounts,
        Some(CircuitSource::OffChain(OffChainCircuitSource {
            source: "https://your-storage.com/path/to/my_instruction.arcis".to_string(),
            hash: circuit_hash!("my_instruction"),
        })),
        None,
    )?;
    Ok(())
}
```

**Offchain storage providers:**
- IPFS
- Public S3 bucket
- Supabase object storage
- Any publicly accessible URL (no auth required)

**Critical:** Always use `circuit_hash!("instruction_name")` macro. Never use `[0u8; 32]` - Arx nodes verify the hash when fetching circuits.

---

## Complete Deployment Workflow

### For Onchain Circuits (Current Setup)

```bash
# 1. Build
arcium build

# 2. Deploy to devnet (uploads circuits automatically)
arcium deploy -o 123 -k ~/.config/solana/id.json \
  -u https://devnet.helius-rpc.com/?api-key=<key>

# 3. Initialize computation definitions (run via your test/script)
# Call each init_*_comp_def instruction

# 4. Verify deployment
solana program show <program-id> --url devnet
```

### For Offchain Circuits

```bash
# 1. Build
arcium build

# 2. Upload .arcis files to public storage
# Upload all files from build/ folder to your storage provider

# 3. Update init functions with CircuitSource::OffChain
# Add URLs and circuit_hash! for each instruction

# 4. Rebuild with updated init functions
arcium build

# 5. Deploy to devnet
arcium deploy -o 123 -k ~/.config/solana/id.json \
  -u https://devnet.helius-rpc.com/?api-key=<key>

# 6. Initialize computation definitions
# Call each init_*_comp_def instruction

# 7. Verify deployment
solana program show <program-id> --url devnet
```

---

## Post-Deployment: Initialize Computation Definitions

After deployment, initialize each computation definition by calling your `init_*_comp_def` instructions.

**TypeScript example:**

```typescript
// For Arcium 0.5.4
const clusterOffset = 123;

// Call init instruction for each encrypted instruction
await program.methods
  .initCreateDealCompDef()
  .accounts({
    payer: wallet.publicKey,
    mxeAccount: getMXEAccAddress(program.programId),
    compDefAccount: getCompDefAccAddress(program.programId, comp_def_offset("create_deal")),
    arciumProgram: ARCIUM_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

Computation definitions only need to be initialized **once** - they persist on-chain.

---

## Network-Specific Notes

### Devnet

| Parameter | Value for 0.5.4 |
|-----------|-----------------|
| Cluster offset | `123` |
| Free SOL | `solana airdrop 2 --url devnet` |

### Mainnet

- **Status:** Mainnet Alpha launched Q4 2025
- **Full decentralized mainnet:** Q1 2026
- During Alpha, nodes managed by Arcium + trusted validators
- Contact Arcium team for mainnet cluster offsets

### Code Differences (Local vs Devnet)

```typescript
// Local testing (from environment)
const clusterOffset = getArciumEnv().arciumClusterOffset;

// Devnet 0.5.4 (explicit value)
const clusterOffset = 123;
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Dropped transactions | Unreliable RPC | Use Helius or QuickNode |
| Insufficient SOL | Not enough for deployment | `solana airdrop 2` or use faucet |
| Program deployed, init failed | Partial deployment | Run with `--skip-deploy` |
| Init succeeded, deploy failed | Partial deployment | Run with `--skip-init` |
| Circuit verification failed | Wrong hash or placeholder | Use `circuit_hash!` macro |
| Node offset conflict | Duplicate offset | Choose different 8-10 digit random number |
| "Unknown action 'undefined'" | ArgBuilder mismatch | Check ArgBuilder args match signature |
| InvalidArguments (6301) | Wrong argument format/offsets | Verify ciphertext offsets |
| Wrong cluster offset | Version mismatch | Use `123` for 0.5.4, `456` for 0.6.3+ |

### Transaction Dropped

**Symptom:** Deploy command hangs or transactions fail silently.

**Solution:**
1. Switch to a dedicated RPC provider (Helius, QuickNode)
2. Check SOL balance: `solana balance --url devnet`
3. Retry with explicit RPC: `--rpc-url <your-rpc>`

### Partial Deployment Recovery

If deployment partially completed:

```bash
# If program deployed but MXE init failed:
arcium deploy --skip-deploy -o 123 -k ~/.config/solana/id.json -u <rpc-url>

# If MXE init succeeded but program deploy failed:
arcium deploy --skip-init -o 123 -k ~/.config/solana/id.json -u <rpc-url>
```

### Circuit Upload Timeout (Onchain)

**Symptom:** Deployment hangs during circuit upload phase.

**Cause:** Large circuits require many transactions; RPC may throttle or drop them.

**Solutions:**
1. Use a premium RPC endpoint with higher rate limits
2. Switch to offchain circuit storage
3. Retry with `--skip-deploy` if program already deployed

### Circuit Hash Mismatch (Offchain)

**Symptom:** Computation fails on Arx nodes with verification error.

**Cause:** Circuit hash doesn't match the uploaded `.arcis` file.

**Solution:**
1. Rebuild: `arcium build`
2. Re-upload the new `.arcis` file to your storage
3. Verify you're using `circuit_hash!("instruction_name")`, not a manual hash
4. Redeploy to update the hash on-chain

### Verify Deployment

```bash
# Check program is deployed
solana program show <program-id> --url devnet

# Check account exists
solana account <account-address> --url devnet
```

### Logs and Debugging

```bash
# View transaction logs
solana logs --url devnet

# Check specific transaction
solana confirm -v <tx-signature> --url devnet
```

---

## Checklist

### Pre-Deployment (Onchain Circuits)

- [ ] `arcium build` succeeds
- [ ] `arcium test` passes locally
- [ ] RPC endpoint configured (Helius/QuickNode recommended)
- [ ] Sufficient SOL in keypair (2-5 SOL for onchain circuits)
- [ ] Using cluster offset `123` for Arcium 0.5.4

### Pre-Deployment (Offchain Circuits)

- [ ] `arcium build` succeeds
- [ ] `arcium test` passes locally
- [ ] Circuit files uploaded to public storage
- [ ] Init functions updated with `CircuitSource::OffChain`
- [ ] Using `circuit_hash!` macro (not placeholder)
- [ ] RPC endpoint configured
- [ ] Sufficient SOL in keypair (1-2 SOL sufficient)
- [ ] Using cluster offset `123` for Arcium 0.5.4

### Deployment

- [ ] `arcium deploy` command executed successfully
- [ ] Note the program ID from output
- [ ] Confirmed cluster offset: `123`

### Post-Deployment

- [ ] Program verified with `solana program show`
- [ ] All computation definitions initialized (one per encrypted instruction)
- [ ] Test computation queued and executed
- [ ] Callback received successfully

---

## Quick Reference

### Deploy Command (0.5.4)

```bash
arcium deploy -o 123 -k ~/.config/solana/id.json \
  -u https://devnet.helius-rpc.com/?api-key=<key>
```

### Onchain Init (Default - Your Current Code)

```rust
init_comp_def(ctx.accounts, None, None)?;
```

### Offchain Init

```rust
init_comp_def(
    ctx.accounts,
    Some(CircuitSource::OffChain(OffChainCircuitSource {
        source: "https://storage.example.com/instruction.arcis".to_string(),
        hash: circuit_hash!("instruction"),
    })),
    None,
)?;
```

---

## References

- [Arcium Deployment Docs](https://docs.arcium.com/developers/deployment)
- [Computation Definition Accounts](https://docs.arcium.com/developers/program/computation-def-accs)
- [arcium-client 0.5.4 API](https://docs.rs/arcium-client/0.5.4/arcium_client/)
- [Arcium Examples](https://github.com/arcium-hq/examples)
