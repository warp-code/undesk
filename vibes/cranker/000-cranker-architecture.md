# OTC Cranker Architecture

## Overview

A TypeScript cranker for the OTC program that permissionlessly settles expired deals and their offers. The design follows the same principles as the indexer:

1. **Functional approach** - Pure functions, composition over inheritance
2. **Source agnostic** - Reads from Supabase, writes to Solana
3. **Reusable logic** - Core cranking logic decoupled from data source
4. **Idempotent operations** - Safe to run multiple times on the same deal/offer

---

## Instructions to Crank

The OTC program has 2 crank instructions:

### 1. crank_deal

Settles an open deal by computing final execution state.

**When to call:**
- Deal status is `open`
- Current time > `expires_at` (after expiry, anyone can call permissionlessly)

**Required data from Supabase:**
- `address` - Deal pubkey
- `expires_at` - Expiration timestamp

**Parameters:**
```typescript
{
  computation_offset: u64,  // Random per call
  creator_nonce: u128,      // Generated randomly
}
```

> **Note:** The encryption pubkey is read directly from the deal account (`deal.encryption_pubkey`), not passed as a parameter. This prevents malicious crankers from encrypting outputs to the wrong key.

### 2. crank_offer

Settles an individual offer after its deal has been settled.

**When to call:**
- Parent deal status is `executed` or `expired` (not `open`)
- Offer status is `open` (not yet settled)

**Required data from Supabase:**
- `address` - Offer pubkey
- `deal_address` - Parent deal pubkey

**Parameters:**
```typescript
{
  computation_offset: u64,  // Random per call
  offeror_nonce: u128,      // Generated randomly
}
```

> **Note:** The encryption pubkey is read directly from the offer account (`offer.encryption_pubkey`), not passed as a parameter. This prevents malicious crankers from encrypting outputs to the wrong key.

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                │
│                  (populated by indexer)                         │
├─────────────────────────────────────────────────────────────────┤
│  deals: address, status, expires_at, encryption_key, ...       │
│  offers: address, deal_address, status, encryption_key, ...    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Query Functions                              │
│        getExpiredOpenDeals(), getOpenOffersForSettledDeals()   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Crank Functions                              │
│             crankDeal(), crankOffer()                          │
│        Build tx, sign, send, wait for confirmation             │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Solana + Arcium                              │
│        Deal/Offer accounts updated, callbacks execute          │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Indexer (separate)                           │
│        Captures DealSettled/OfferSettled events                │
│        Updates Supabase with new status                        │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** The cranker only writes to Solana. The indexer captures the resulting events and updates Supabase. This maintains separation of concerns.

### Layer 1: Queries (Read from Supabase)

Pure functions that query Supabase for crankable items.

```typescript
// queries.ts
import { SupabaseClient } from '@supabase/supabase-js';

type CrankableDeal = {
  address: string;
};

type CrankableOffer = {
  address: string;
  dealAddress: string;
};

// Deals that are open and past expiry
const getExpiredOpenDeals = async (
  supabase: SupabaseClient,
): Promise<CrankableDeal[]> => {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('deals')
    .select('address')
    .eq('status', 'open')
    .lt('expires_at', now);

  if (error) throw error;

  return (data ?? []).map(d => ({
    address: d.address,
  }));
};

// Offers that are open but their deal is settled
const getOpenOffersForSettledDeals = async (
  supabase: SupabaseClient,
): Promise<CrankableOffer[]> => {
  const { data, error } = await supabase
    .from('offers')
    .select(`
      address,
      deal_address,
      deals!inner(status)
    `)
    .eq('status', 'open')
    .neq('deals.status', 'open');  // Deal must be executed or expired

  if (error) throw error;

  return (data ?? []).map(o => ({
    address: o.address,
    dealAddress: o.deal_address,
  }));
};
```

### Layer 2: Transaction Builders (Pure Functions)

Build transactions without sending them. Keeps logic testable.

Uses `@arcium-hq/client` for all Arcium account derivation (same as test harness).

```typescript
// transactions.ts
import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { Program } from '@coral-xyz/anchor';
import { randomBytes } from 'crypto';
import {
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getClusterAccAddress,
  deserializeLE,
} from '@arcium-hq/client';
import type { Otc } from '../target/types/otc';

// Generate random computation offset and nonce (matches test pattern)
const generateComputationParams = () => {
  const computationOffset = new anchor.BN(randomBytes(8), 'hex');
  const nonceBytes = randomBytes(16);
  const nonce = new anchor.BN(deserializeLE(nonceBytes).toString());
  return { computationOffset, nonce, nonceBytes };
};

type CrankDealParams = {
  deal: PublicKey;
};

const buildCrankDealIx = async (
  program: Program<Otc>,
  payer: PublicKey,
  params: CrankDealParams,
  clusterOffset: number,
) => {
  const { computationOffset, nonce } = generateComputationParams();

  const ix = await program.methods
    .crankDeal(
      computationOffset,
      nonce,
    )
    .accountsPartial({
      payer,
      deal: params.deal,
      computationAccount: getComputationAccAddress(clusterOffset, computationOffset),
      clusterAccount: getClusterAccAddress(clusterOffset),
      mxeAccount: getMXEAccAddress(program.programId),
      mempoolAccount: getMempoolAccAddress(clusterOffset),
      executingPool: getExecutingPoolAccAddress(clusterOffset),
      compDefAccount: getCompDefAccAddress(
        program.programId,
        Buffer.from(getCompDefAccOffset('crank_deal')).readUInt32LE()
      ),
    })
    .instruction();

  return { ix, computationOffset };
};

type CrankOfferParams = {
  deal: PublicKey;
  offer: PublicKey;
};

const buildCrankOfferIx = async (
  program: Program<Otc>,
  payer: PublicKey,
  params: CrankOfferParams,
  clusterOffset: number,
) => {
  const { computationOffset, nonce } = generateComputationParams();

  const ix = await program.methods
    .crankOffer(
      computationOffset,
      nonce,
    )
    .accountsPartial({
      payer,
      deal: params.deal,
      offer: params.offer,
      computationAccount: getComputationAccAddress(clusterOffset, computationOffset),
      clusterAccount: getClusterAccAddress(clusterOffset),
      mxeAccount: getMXEAccAddress(program.programId),
      mempoolAccount: getMempoolAccAddress(clusterOffset),
      executingPool: getExecutingPoolAccAddress(clusterOffset),
      compDefAccount: getCompDefAccAddress(
        program.programId,
        Buffer.from(getCompDefAccOffset('crank_offer')).readUInt32LE()
      ),
    })
    .instruction();

  return { ix, computationOffset };
};
```

**Note:** Uses `accountsPartial` - Anchor auto-derives remaining accounts (sign PDA, pool, clock, etc.) via the macros in the program.

### Layer 3: Execution (Side Effects)

Functions that actually send transactions and handle results.

**Critical:** Must await `awaitComputationFinalization` after sending tx. The callback (which updates deal/offer status and emits events) only executes after Arcium MPC computation completes.

```typescript
// execute.ts
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { awaitComputationFinalization } from '@arcium-hq/client';
import type { Otc } from '../target/types/otc';

type CrankResult = {
  success: boolean;
  signature?: string;
  error?: string;
};

const executeCrankDeal = async (
  provider: AnchorProvider,
  program: Program<Otc>,
  payer: Keypair,
  deal: CrankableDeal,
  clusterOffset: number,
): Promise<CrankResult> => {
  try {
    const { ix, computationOffset } = await buildCrankDealIx(
      program,
      payer.publicKey,
      {
        deal: new PublicKey(deal.address),
      },
      clusterOffset,
    );

    // Build and send transaction
    const tx = new Transaction().add(ix);
    const signature = await provider.sendAndConfirm(tx, [payer], {
      skipPreflight: true,
      commitment: 'confirmed',
    });

    // Wait for Arcium computation to finalize (callback executes)
    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      'confirmed',
    );

    return { success: true, signature };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const executeCrankOffer = async (
  provider: AnchorProvider,
  program: Program<Otc>,
  payer: Keypair,
  offer: CrankableOffer,
  clusterOffset: number,
): Promise<CrankResult> => {
  try {
    const { ix, computationOffset } = await buildCrankOfferIx(
      program,
      payer.publicKey,
      {
        deal: new PublicKey(offer.dealAddress),
        offer: new PublicKey(offer.address),
      },
      clusterOffset,
    );

    const tx = new Transaction().add(ix);
    const signature = await provider.sendAndConfirm(tx, [payer], {
      skipPreflight: true,
      commitment: 'confirmed',
    });

    // Wait for Arcium computation to finalize (callback executes)
    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      'confirmed',
    );

    return { success: true, signature };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
```

**Why `awaitComputationFinalization`?**
1. Transaction confirms → computation queued in Arcium mempool
2. Arcium MPC nodes execute the computation
3. Callback instruction executes → status updated, event emitted
4. Only then is the deal/offer actually settled

Without waiting, the indexer won't see events yet, and the next cycle might re-crank.

### Layer 4: Orchestration (Main Loop)

Ties everything together with configurable intervals.

```typescript
// cranker.ts
import { SupabaseClient } from '@supabase/supabase-js';
import { Keypair } from '@solana/web3.js';
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import type { Otc } from '../target/types/otc';

type CrankerConfig = {
  intervalMs: number;      // How often to check for crankable items
  maxBatchSize: number;    // Max items to crank per cycle
};

const defaultConfig: CrankerConfig = {
  intervalMs: 10_000,       // 10 seconds
  maxBatchSize: 10,
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const runCrankCycle = async (
  supabase: SupabaseClient,
  provider: AnchorProvider,
  program: Program<Otc>,
  payer: Keypair,
  clusterOffset: number,
  config: CrankerConfig,
): Promise<{ dealsCranked: number; offersCranked: number }> => {
  let dealsCranked = 0;
  let offersCranked = 0;

  // Phase 1: Crank expired deals
  const expiredDeals = await getExpiredOpenDeals(supabase);
  const dealsToProcess = expiredDeals.slice(0, config.maxBatchSize);

  for (const deal of dealsToProcess) {
    const result = await executeCrankDeal(
      provider, program, payer, deal, clusterOffset
    );

    if (result.success) {
      log('info', 'Cranked deal', { deal: deal.address, signature: result.signature });
      dealsCranked++;
    } else {
      log('error', 'Failed to crank deal', { deal: deal.address, error: result.error });
    }
  }

  // Phase 2: Crank offers for settled deals
  const openOffers = await getOpenOffersForSettledDeals(supabase);
  const offersToProcess = openOffers.slice(0, config.maxBatchSize);

  for (const offer of offersToProcess) {
    const result = await executeCrankOffer(
      provider, program, payer, offer, clusterOffset
    );

    if (result.success) {
      log('info', 'Cranked offer', { offer: offer.address, signature: result.signature });
      offersCranked++;
    } else {
      log('error', 'Failed to crank offer', { offer: offer.address, error: result.error });
    }
  }

  return { dealsCranked, offersCranked };
};

const startCranker = (
  supabase: SupabaseClient,
  provider: AnchorProvider,
  program: Program<Otc>,
  payer: Keypair,
  clusterOffset: number,
  config: CrankerConfig = defaultConfig,
): { stop: () => void } => {
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        const { dealsCranked, offersCranked } = await runCrankCycle(
          supabase, provider, program, payer, clusterOffset, config
        );

        if (dealsCranked > 0 || offersCranked > 0) {
          log('info', 'Crank cycle complete', { dealsCranked, offersCranked });
        }
      } catch (error) {
        log('error', 'Crank cycle failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }

      await sleep(config.intervalMs);
    }
  };

  loop();

  return {
    stop: () => { running = false; },
  };
};
```

---

## Directory Structure

```
cranker/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Environment/config loading
│   ├── log.ts                # Structured logging helper
│   │
│   ├── queries.ts            # Supabase query functions
│   ├── transactions.ts       # Transaction builders
│   ├── execute.ts            # Transaction execution
│   ├── cranker.ts            # Main loop orchestration
│   │
│   └── types.ts              # Shared types
│
└── tests/
    ├── queries.test.ts       # Test query logic with mock data
    └── transactions.test.ts  # Test tx building
```

---

## Entry Point

```typescript
// index.ts
import * as fs from 'fs';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Wallet } from '@coral-xyz/anchor';
import { createClient } from '@supabase/supabase-js';
import { startCranker } from './cranker';
import { loadConfig } from './config';
import { log } from './log';
import { IDL, type Otc } from '../target/types/otc';

const main = async () => {
  const config = loadConfig();

  // Load payer keypair
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(config.payerKeyPath, 'utf-8')))
  );

  // Initialize Solana connection and Anchor provider
  const connection = new Connection(config.rpcUrl, 'confirmed');
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    skipPreflight: true,
  });
  const program = new Program<Otc>(IDL, new PublicKey(config.programId), provider);

  // Initialize Supabase client
  const supabase = createClient(config.supabaseUrl, config.supabaseKey);

  log('info', 'Starting cranker', {
    rpcUrl: config.rpcUrl,
    programId: config.programId,
    clusterOffset: config.clusterOffset,
    payer: payer.publicKey.toBase58(),
  });

  const cranker = startCranker(
    supabase,
    provider,
    program,
    payer,
    config.clusterOffset,
    {
      intervalMs: config.intervalMs,
      maxBatchSize: config.maxBatchSize,
    },
  );

  // Graceful shutdown
  process.on('SIGINT', () => {
    log('info', 'Shutting down');
    cranker.stop();
    process.exit(0);
  });
};

main().catch(console.error);
```

---

## Configuration

```typescript
// config.ts
import { getArciumEnv } from '@arcium-hq/client';

type Config = {
  // Solana
  rpcUrl: string;
  programId: string;
  payerKeyPath: string;

  // Arcium (from environment, set by arcium localnet/devnet)
  clusterOffset: number;

  // Supabase
  supabaseUrl: string;
  supabaseKey: string;

  // Cranker settings
  intervalMs: number;
  maxBatchSize: number;
};

const loadConfig = (): Config => ({
  rpcUrl: process.env.RPC_URL ?? 'http://localhost:8899',
  programId: process.env.PROGRAM_ID ?? '',
  payerKeyPath: process.env.PAYER_KEY_PATH ?? '~/.config/solana/id.json',

  // Arcium cluster offset from environment
  clusterOffset: getArciumEnv().arciumClusterOffset,

  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseKey: process.env.SUPABASE_KEY ?? '',

  intervalMs: parseInt(process.env.CRANK_INTERVAL_MS ?? '10000', 10),
  maxBatchSize: parseInt(process.env.CRANK_BATCH_SIZE ?? '10', 10),
});
```

**Note:** `retryDelayMs` removed - the polling loop handles retries naturally by re-querying on each cycle.

---

## Key Design Decisions

### 1. Supabase as Source of Truth

The cranker reads from Supabase (populated by the indexer) rather than querying Solana directly. This avoids:
- Expensive RPC calls to fetch all deals/offers
- Complex filtering logic on-chain data
- Rate limiting issues with RPC providers

The indexer keeps Supabase up-to-date, and the cranker relies on that data.

### 2. Order of Operations

Deals must be cranked before their offers:

```
crank_deal (deal status: open → executed/expired)
    ↓
indexer updates Supabase (deal.status = 'executed' or 'expired')
    ↓
next crank cycle picks up offers
    ↓
crank_offer (offer status: open → settled)
```

This natural delay (one crank cycle) ensures the indexer has time to update the deal status before we try to crank its offers.

### 3. Await Computation Finalization

Each crank waits for `awaitComputationFinalization` before moving to the next item. This ensures:
- The Arcium MPC computation completes
- The callback executes (status updated, event emitted)
- The indexer can capture the event before the next cycle

This adds latency per crank but prevents race conditions and wasted re-cranks.

### 4. Idempotency

All operations are idempotent:
- Cranking an already-settled deal fails with `DealNotOpen` (harmless)
- Cranking an already-settled offer fails with `OfferAlreadySettled` (harmless)
- The indexer updates Supabase with new status, so the item won't appear in the next query

### 5. No Retry Queue

Failed cranks are logged but not queued. The next cycle will pick them up again if they're still crankable. This keeps the system simple and stateless.

### 6. Batch Size Limits

The `maxBatchSize` config prevents the cranker from processing too many items in one cycle:
- Avoids long-running cycles
- Prevents RPC rate limiting
- Allows fair distribution if multiple crankers are running

### 7. Permissionless Economics

Anyone can run a cranker. There's no reward mechanism built in—the cranker pays for transaction fees. This is acceptable for:
- Protocol-operated crankers (operational cost)
- Users wanting faster settlement (self-service)
- Future: could add tip mechanism or MEV-style rewards

---

## Comparison with Indexer

| Aspect | Indexer | Cranker |
|--------|---------|---------|
| Direction | Solana → Supabase | Supabase → Solana |
| Trigger | Events (push) | Polling (pull) |
| State | Read-only from Solana | Writes to Solana |
| Permissionless | N/A (observes) | Yes (after expiry) |
| Failure mode | Misses events | Retries next cycle |

Both share:
- Functional design
- Structured logging
- Supabase integration
- TypeScript + Anchor

---

## Arcium Environment

The cranker uses `@arcium-hq/client` for all Arcium account derivation - same as the test harness. No custom PDA logic needed.

```typescript
// arcium.ts
import { PublicKey } from '@solana/web3.js';
import {
  getArciumEnv,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getClusterAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getMXEPublicKey,
} from '@arcium-hq/client';
import { AnchorProvider } from '@coral-xyz/anchor';

// Get cluster offset from environment (set by Arcium localnet/devnet)
const getClusterOffset = (): number => {
  return getArciumEnv().arciumClusterOffset;
};

// Fetch MXE x25519 public key (needed if we ever need to verify encryption)
const fetchMXEPublicKey = async (
  provider: AnchorProvider,
  programId: PublicKey,
): Promise<Uint8Array> => {
  return getMXEPublicKey(provider, programId);
};

// All account derivation uses @arcium-hq/client functions:
// - getMXEAccAddress(programId) → MXE account
// - getMempoolAccAddress(clusterOffset) → Mempool account
// - getExecutingPoolAccAddress(clusterOffset) → Executing pool account
// - getClusterAccAddress(clusterOffset) → Cluster account
// - getComputationAccAddress(clusterOffset, computationOffset) → Per-computation account
// - getCompDefAccAddress(programId, offset) → Computation definition account
// - getCompDefAccOffset(instructionName) → Offset for named computation

// Example: derive crank_deal comp def address
const getCrankDealCompDef = (programId: PublicKey): PublicKey => {
  const offset = Buffer.from(getCompDefAccOffset('crank_deal')).readUInt32LE();
  return getCompDefAccAddress(programId, offset);
};
```

**Note:** The `@arcium-hq/client` package handles all the PDA seed derivation internally. The cranker just calls these functions with the appropriate parameters.

---

## Future Enhancements

### 1. Parallel Execution

Current design processes items sequentially. Could parallelize:
```typescript
await Promise.all(dealsToProcess.map(deal => executeCrankDeal(...)));
```

Requires careful rate limiting to avoid RPC throttling.

### 2. Priority Queue

Order crankable items by:
- Deal value (higher value first)
- Time past expiry (older first)
- Offer count (more offers = more settlement work)

### 3. Health Check Endpoint

Add HTTP server for monitoring:
```typescript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    lastCycle: lastCycleTime,
    dealsCranked: totalDealsCranked,
    offersCranked: totalOffersCranked,
  });
});
```

### 4. Metrics

Add Prometheus metrics:
- `otc_cranker_deals_cranked_total`
- `otc_cranker_offers_cranked_total`
- `otc_cranker_cycle_duration_seconds`
- `otc_cranker_errors_total`

---

## Next Steps

**Prerequisites (must complete first):**
1. Implement and deploy the indexer (cranker depends on Supabase being populated)

**Implementation:**
2. Set up the `cranker/` workspace in the monorepo
3. Add `@arcium-hq/client` and `@supabase/supabase-js` dependencies
4. Implement `queries.ts` (Supabase queries)
5. Implement `transactions.ts` (tx builders using `@arcium-hq/client`)
6. Implement `execute.ts` (tx execution + `awaitComputationFinalization`)
7. Implement `cranker.ts` (main loop)
8. Implement `src/index.ts` (entry point)
9. Test with localnet + local Supabase
10. Deploy alongside indexer
