# OTC Event Indexer Architecture

## Overview

A TypeScript indexer for the OTC program that captures and stores on-chain events. The design prioritizes:

1. **Reusable parsing logic** - Core event parsing decoupled from the ingestion source
2. **Source agnostic** - Same parsing works for RPC subscriptions and Geyser
3. **Functional approach** - Pure functions, composition over inheritance
4. **Raw + processed storage** - Store raw events for auditing, processed for querying

---

## Events to Index

The OTC program emits 4 events (all via callback instructions after MPC computation):

### DealCreated
```
deal: Pubkey
base_mint: Pubkey
quote_mint: Pubkey
expires_at: i64
allow_partial: bool
created_at: i64
encryption_key: [u8; 32]  // creator's x25519 pubkey (echoed back)
nonce: [u8; 16]
ciphertexts: [[u8; 32]; 2]  // encrypted: amount (u64), price (u128 X64.64)
```

### OfferCreated
```
deal: Pubkey
offer: Pubkey
offer_index: u32
submitted_at: i64
encryption_key: [u8; 32]  // offeror's x25519 pubkey
nonce: [u8; 16]
ciphertexts: [[u8; 32]; 2]  // encrypted: price (u128), amount (u64)
```

### DealSettled
```
deal: Pubkey
status: u8  // 1=EXECUTED, 2=EXPIRED
settled_at: i64
encryption_key: [u8; 32]
nonce: [u8; 16]
ciphertexts: [[u8; 32]; 3]  // encrypted: total_filled, creator_receives, creator_refund
```

### OfferSettled
```
deal: Pubkey
offer: Pubkey
offer_index: u32
encryption_key: [u8; 32]
nonce: [u8; 16]
ciphertexts: [[u8; 32]; 3]  // encrypted: outcome (u8), executed_amt, refund_amt
```

---

## Architecture

### How Anchor Events Work

When an Anchor program emits an event:

```
Program calls emit!(DealCreated { ... })
    ↓
Anchor serializes: [8-byte discriminator][borsh-encoded data]
    ↓
Base64 encodes and logs via sol_log_data()
    ↓
Shows up in tx logs as: "Program data: GxIyNGivLmU..."
```

The transaction's `logMessages` array contains these log lines. Any source (RPC, Geyser, historical fetch) gives us logs, which we parse the same way.

### Layer 1: Event Parser (Anchor IDL)

Use Anchor's built-in `EventParser` with our IDL. No manual discriminators or borsh schemas.

```typescript
// parser.ts
import { BorshCoder, EventParser } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { IDL, type Otc } from '../target/types/otc';

const PROGRAM_ID = new PublicKey('...');
const coder = new BorshCoder(IDL);
const eventParser = new EventParser(PROGRAM_ID, coder);

// Event types from generated IDL
type OtcEvents = Otc['events'][number];
type ParsedEvent = {
  name: OtcEvents['name'];
  data: unknown;  // Typed per event via IDL
};

// Single function - works for ANY log source
export const parseEvents = (logs: string[]): ParsedEvent[] => {
  return Array.from(eventParser.parseLogs(logs));
};
```

**What `EventParser.parseLogs()` does internally:**
1. Scans logs for program execution context (tracks CPI depth via "invoke [N]" / "success" lines)
2. Finds `"Program data: <base64>"` lines from our program
3. Base64 decodes → matches 8-byte discriminator → borsh deserializes
4. Returns typed `{ name, data }` objects

**Why use Anchor's parser:**
- IDL already has discriminators and borsh layouts
- Types generated at build time (`target/types/otc.ts`)
- Battle-tested, handles CPI edge cases
- No code to maintain when events change

### Layer 2: Ingestion Adapters

All sources provide `logs: string[]`. Adapters normalize different sources to the same interface.

```typescript
// types.ts
type TxContext = {
  signature: string;
  slot: number;
  blockTime: number | null;
};

type EventWithContext = ParsedEvent & { context: TxContext };
type EventCallback = (events: EventWithContext[]) => Promise<void>;

type IngestionAdapter = {
  start: (callback: EventCallback) => Promise<void>;
  stop: () => Promise<void>;
};
```

**RPC Subscription:**
```typescript
// rpc-adapter.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { parseEvents } from './parser';

export const createRpcAdapter = (
  connection: Connection,
  programId: PublicKey
): IngestionAdapter => {
  let subscriptionId: number | null = null;

  return {
    start: async (callback) => {
      subscriptionId = connection.onLogs(programId, async (logsResult, ctx) => {
        if (logsResult.err) return;

        const events = parseEvents(logsResult.logs);
        if (events.length === 0) return;

        const eventsWithContext = events.map(e => ({
          ...e,
          context: {
            signature: logsResult.signature,
            slot: ctx.slot,
            blockTime: null,  // Not available in onLogs
          },
        }));

        await callback(eventsWithContext);
      });
    },
    stop: async () => {
      if (subscriptionId !== null) {
        await connection.removeOnLogsListener(subscriptionId);
      }
    },
  };
};
```

**Geyser:**
```typescript
// geyser-adapter.ts
export const createGeyserAdapter = (
  geyserClient: GeyserClient,
  programId: PublicKey
): IngestionAdapter => {
  return {
    start: async (callback) => {
      geyserClient.onTransaction(programId, async (tx) => {
        if (!tx.meta?.logMessages) return;

        const events = parseEvents(tx.meta.logMessages);
        if (events.length === 0) return;

        const eventsWithContext = events.map(e => ({
          ...e,
          context: {
            signature: tx.signature,
            slot: tx.slot,
            blockTime: tx.blockTime,
          },
        }));

        await callback(eventsWithContext);
      });
    },
    stop: async () => {
      geyserClient.disconnect();
    },
  };
};
```

**Backfill (historical):**
```typescript
// backfill.ts
export const backfill = async (
  connection: Connection,
  programId: PublicKey,
  callback: EventCallback,
  options?: { fromSlot?: number; batchSize?: number }
) => {
  const signatures = await connection.getSignaturesForAddress(programId, {
    limit: options?.batchSize ?? 1000,
  });

  for (const batch of chunk(signatures, 100)) {
    const txs = await connection.getTransactions(
      batch.map(s => s.signature),
      { maxSupportedTransactionVersion: 0 }
    );

    for (const tx of txs) {
      if (!tx?.meta?.logMessages) continue;

      const events = parseEvents(tx.meta.logMessages);
      if (events.length === 0) continue;

      const eventsWithContext = events.map(e => ({
        ...e,
        context: {
          signature: tx.transaction.signatures[0],
          slot: tx.slot,
          blockTime: tx.blockTime,
        },
      }));

      await callback(eventsWithContext);
    }
  }
};
```

**Key insight:** All three use the exact same `parseEvents()` function. The only difference is how they obtain `logs: string[]`.

### Layer 3: Storage

Persist events for querying. Two stores: raw and processed.

```
│   ├── storage/
│   │   ├── index.ts
│   │   ├── types.ts           # Storage interface
│   │   ├── raw.ts             # Raw event storage (audit trail)
│   │   ├── processed.ts       # Processed/queryable storage
│   │   └── postgres.ts        # Postgres implementation (or sqlite, etc.)
```

```typescript
// types.ts
type RawEventRecord = {
  id: string;                    // UUID
  signature: string;
  slot: number;
  block_time: Date | null;
  event_name: string;
  raw_data: Uint8Array;          // Full event bytes
  indexed_at: Date;
};

type DealRecord = {
  address: string;               // Deal pubkey (base58)
  base_mint: string;
  quote_mint: string;
  expires_at: Date;
  allow_partial: boolean;
  status: 'open' | 'executed' | 'expired';
  created_at: Date;
  settled_at: Date | null;

  // Creation encrypted data (from DealCreated)
  encryption_key: Uint8Array;    // 32 bytes
  nonce: Uint8Array;             // 16 bytes
  ciphertexts: Uint8Array;       // 64 bytes (2 x 32)

  // Settlement encrypted data (from DealSettled, null until settled)
  settlement_encryption_key: Uint8Array | null;  // 32 bytes
  settlement_nonce: Uint8Array | null;           // 16 bytes
  settlement_ciphertexts: Uint8Array | null;     // 96 bytes (3 x 32)

  // Metadata
  created_signature: string;
  settled_signature: string | null;
  indexed_at: Date;
};

type OfferRecord = {
  address: string;               // Offer pubkey (base58)
  deal_address: string;
  offer_index: number;
  status: 'open' | 'settled';
  submitted_at: Date;

  // Creation encrypted data (from OfferCreated)
  encryption_key: Uint8Array;    // 32 bytes
  nonce: Uint8Array;             // 16 bytes
  ciphertexts: Uint8Array;       // 64 bytes (2 x 32)

  // Settlement encrypted data (from OfferSettled, null until settled)
  settlement_encryption_key: Uint8Array | null;  // 32 bytes
  settlement_nonce: Uint8Array | null;           // 16 bytes
  settlement_ciphertexts: Uint8Array | null;     // 96 bytes (3 x 32)

  // Metadata
  created_signature: string;
  settled_signature: string | null;
  indexed_at: Date;
};

// Storage interface - functional style
type Storage = {
  // Raw events
  insertRawEvent: (event: EventWithContext) => Promise<void>;

  // Processed records
  upsertDeal: (event: EventWithContext) => Promise<void>;
  upsertDealSettlement: (event: EventWithContext) => Promise<void>;
  upsertOffer: (event: EventWithContext) => Promise<void>;
  upsertOfferSettlement: (event: EventWithContext) => Promise<void>;

  // Queries (optional - frontend may use Supabase client directly)
  getDeal: (address: string) => Promise<DealRecord | null>;
  getDealsForMints: (baseMint: string, quoteMint: string) => Promise<DealRecord[]>;
  getOffersForDeal: (dealAddress: string) => Promise<OfferRecord[]>;
};
```

### Layer 4: Event Handler (Orchestration)

Ties everything together. Receives enriched events, routes to storage.

```
│   ├── handler/
│   │   ├── index.ts
│   │   └── handle.ts
```

```typescript
// handle.ts
const createEventHandler = (storage: Storage) => {
  return async (event: EnrichedEvent<EventName>): Promise<void> => {
    // Always store raw event first (audit trail)
    await storage.insertRawEvent(event);

    // Then update processed tables
    switch (event.name) {
      case 'DealCreated':
        await storage.upsertDeal(event);
        break;
      case 'OfferCreated':
        await storage.upsertOffer(event);
        break;
      case 'DealSettled':
        await storage.upsertDealSettlement(event);
        break;
      case 'OfferSettled':
        await storage.upsertOfferSettlement(event);
        break;
    }
  };
};
```

---

## Full Directory Structure

```
indexer/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Live indexer entry point
│   ├── backfill.ts           # Backfill script entry point
│   ├── config.ts             # Environment/config loading
│   ├── log.ts                # Structured logging helper
│   │
│   ├── parser.ts             # parseEvents() using Anchor's EventParser
│   ├── types.ts              # Shared types (TxContext, EventWithContext, etc.)
│   │
│   ├── adapters/
│   │   ├── index.ts          # Re-exports
│   │   ├── rpc.ts            # RPC subscription adapter
│   │   └── geyser.ts         # Geyser adapter
│   │
│   ├── storage/
│   │   ├── index.ts          # Re-exports
│   │   ├── supabase.ts       # Supabase client + storage functions
│   │   └── queries.ts        # Insert/upsert functions
│   │
│   └── handler.ts            # Routes events to storage
│
└── tests/
    ├── parser.test.ts        # Test event parsing with sample logs
    └── handler.test.ts       # Test event routing
```

Note: The IDL types come from `../target/types/otc.ts` (generated by Anchor build).

---

## Main Entry Points

**Live indexer (`src/index.ts`):**
```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { createRpcAdapter, createGeyserAdapter } from './adapters';
import { createEventHandler } from './handler';
import { createSupabaseStorage } from './storage';
import { loadConfig } from './config';
import { log } from './log';

const main = async () => {
  const config = loadConfig();
  const connection = new Connection(config.rpcUrl);
  const programId = new PublicKey(config.programId);

  // Initialize storage
  const storage = createSupabaseStorage(config.supabaseUrl, config.supabaseKey);

  // Create event handler
  const handleEvents = createEventHandler(storage);

  // Choose adapter based on config
  const adapter = config.useGeyser
    ? createGeyserAdapter(config.geyserUrl, programId)
    : createRpcAdapter(connection, programId);

  log('info', 'Starting indexer', { adapter: config.useGeyser ? 'geyser' : 'rpc' });
  await adapter.start(handleEvents);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    log('info', 'Shutting down');
    await adapter.stop();
    process.exit(0);
  });
};

main().catch(console.error);
```

**Backfill script (`src/backfill.ts`):**
```typescript
import { Connection, PublicKey } from '@solana/web3.js';
import { backfill } from './adapters';
import { createEventHandler } from './handler';
import { createSupabaseStorage } from './storage';
import { loadConfig } from './config';
import { log } from './log';

const main = async () => {
  const config = loadConfig();
  const connection = new Connection(config.rpcUrl);
  const programId = new PublicKey(config.programId);

  const storage = createSupabaseStorage(config.supabaseUrl, config.supabaseKey);
  const handleEvents = createEventHandler(storage);

  log('info', 'Starting backfill', { fromSlot: config.backfillFromSlot });

  await backfill(connection, programId, handleEvents, {
    fromSlot: config.backfillFromSlot,
  });

  log('info', 'Backfill complete');
};

main().catch(console.error);
```

---

## Key Design Decisions

### 1. Geyser vs RPC Subscription

| Aspect | RPC Subscription | Geyser |
|--------|------------------|--------|
| Latency | Higher (~400ms) | Lower (~50ms) |
| Reliability | Can miss events on disconnect | Persistent streaming |
| Setup | Simple (just RPC URL) | Requires Geyser plugin |
| Backfill | Manual via getSignaturesForAddress | Can replay from slot |
| Best for | Dev/testing | Production |

The same `parseEvents()` works for both - only the adapter differs.

### 2. Encrypted Fields Strategy

Events contain encrypted ciphertexts. The indexer stores them as-is (cannot decrypt without private keys). Decryption happens client-side:

```typescript
// Client-side decryption (NOT in indexer)
import { x25519 } from '@noble/curves/ed25519';
import { RescueCipher } from '@aspect-arcium/encryption';

const decrypt = (privateKey: Uint8Array, mxePublicKey: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array) => {
  const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
  const cipher = new RescueCipher(sharedSecret);
  return cipher.decrypt(ciphertext, nonce);
};
```

The indexer just stores the blobs. Frontend/API decrypts for authorized users.

### 3. Idempotency

Events should be idempotent - processing the same event twice should not corrupt state:

- Raw events: Check for existing signature + instruction index before insert
- Deals/Offers: Upsert by address (pubkey is unique)
- Use database transactions for atomicity

---

## Database Schema (Supabase Postgres)

```sql
-- Raw events (audit trail)
CREATE TABLE raw_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature TEXT NOT NULL,
  slot BIGINT NOT NULL,
  block_time TIMESTAMPTZ,
  event_name TEXT NOT NULL,
  raw_data BYTEA NOT NULL,              -- Full event as raw bytes
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(signature, event_name)         -- One event type per tx signature
);

CREATE INDEX idx_raw_events_slot ON raw_events(slot);
CREATE INDEX idx_raw_events_event_name ON raw_events(event_name);

-- Deals
CREATE TABLE deals (
  address TEXT PRIMARY KEY,             -- Deal pubkey (base58)
  base_mint TEXT NOT NULL,              -- Token being sold (base58)
  quote_mint TEXT NOT NULL,             -- Token being received (base58)
  expires_at TIMESTAMPTZ NOT NULL,
  allow_partial BOOLEAN NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'executed' | 'expired'
  created_at TIMESTAMPTZ NOT NULL,
  settled_at TIMESTAMPTZ,

  -- Creation encrypted data (from DealCreated event)
  -- Contains: amount (u64), price (u128 X64.64)
  encryption_key BYTEA NOT NULL,        -- [u8; 32] = 32 bytes (creator's x25519 pubkey)
  nonce BYTEA NOT NULL,                 -- [u8; 16] = 16 bytes
  ciphertexts BYTEA NOT NULL,           -- [[u8; 32]; 2] = 64 bytes

  -- Settlement encrypted data (from DealSettled event, null until settled)
  -- Contains: total_filled (u64), creator_receives (u64), creator_refund (u64)
  settlement_encryption_key BYTEA,      -- [u8; 32] = 32 bytes
  settlement_nonce BYTEA,               -- [u8; 16] = 16 bytes
  settlement_ciphertexts BYTEA,         -- [[u8; 32]; 3] = 96 bytes

  -- Indexing metadata
  created_signature TEXT NOT NULL,
  settled_signature TEXT,
  indexed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deals_status ON deals(status);
CREATE INDEX idx_deals_mints ON deals(base_mint, quote_mint);
CREATE INDEX idx_deals_expires_at ON deals(expires_at);

-- Offers
CREATE TABLE offers (
  address TEXT PRIMARY KEY,             -- Offer pubkey (base58)
  deal_address TEXT NOT NULL REFERENCES deals(address),
  offer_index INT NOT NULL,             -- FIFO sequence number
  status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'settled'
  submitted_at TIMESTAMPTZ NOT NULL,

  -- Creation encrypted data (from OfferCreated event)
  -- Contains: price (u128 X64.64), amount (u64)
  encryption_key BYTEA NOT NULL,        -- [u8; 32] = 32 bytes (offeror's x25519 pubkey)
  nonce BYTEA NOT NULL,                 -- [u8; 16] = 16 bytes
  ciphertexts BYTEA NOT NULL,           -- [[u8; 32]; 2] = 64 bytes

  -- Settlement encrypted data (from OfferSettled event, null until settled)
  -- Contains: outcome (u8), executed_amt (u64), refund_amt (u64)
  settlement_encryption_key BYTEA,      -- [u8; 32] = 32 bytes
  settlement_nonce BYTEA,               -- [u8; 16] = 16 bytes
  settlement_ciphertexts BYTEA,         -- [[u8; 32]; 3] = 96 bytes

  -- Indexing metadata
  created_signature TEXT NOT NULL,
  settled_signature TEXT,
  indexed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_offers_deal ON offers(deal_address);
CREATE INDEX idx_offers_status ON offers(status);
```

**Note on encrypted field sizes:**
- All ciphertexts are 32 bytes each (RescueCipher block size)
- Creation events have 2 ciphertexts (64 bytes total)
- Settlement events have 3 ciphertexts (96 bytes total)
- Nonces are 16 bytes ([u8; 16]), passed as u128 to instructions but stored as bytes

---

## Decisions

### 1. API Layer → Supabase

No custom API. Use **Supabase** which provides:
- **Auto-generated REST API** (PostgREST) for queries
- **Realtime subscriptions** for live updates to frontend via WebSocket
- Row Level Security if auth is needed later

The indexer is a pure writer. Frontend subscribes directly to Supabase:

```typescript
supabase
  .channel('deals')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deals' }, (payload) => {
    console.log('New deal:', payload.new);
  })
  .subscribe();
```

### 2. Historical Backfill → Separate Script

No auto-backfill on startup. **Backfill is a separate script** run manually.

- Indexer starts instantly, processes only new events
- Backfill script runs independently (can run in parallel with live indexer)
- Idempotent writes (upserts) make concurrent execution safe

```bash
# Terminal 1 - start immediately
yarn indexer

# Terminal 2 - backfill in parallel
yarn backfill --from-slot 12345678
```

### 3. Webhook Notifications → Skip for Now

No webhooks. **Supabase Realtime covers the frontend use case.**

If webhooks are needed later, Supabase Database Webhooks or Edge Functions can be configured without touching indexer code.

### 4. Metrics/Monitoring → Structured Logging

Start with **structured JSON logs** only:

```typescript
const log = (level: string, message: string, data?: object) => {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...data }));
};

log('info', 'Event indexed', { event: 'DealCreated', slot: 123456, deal: 'abc...' });
```

Deploy platform captures logs. Add Prometheus later if dashboards become necessary.

### 5. Multi-tenancy → Single Program

**OTC program only.** No multi-program abstraction.

If a second program is added later, either spin up a separate indexer or refactor then.

---

## Revised Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Log Sources                             │
├──────────────────┬──────────────────┬───────────────────────────┤
│  RPC onLogs()    │  Geyser stream   │  getTransaction() backfill│
│  (dev/testing)   │  (production)    │  (historical)             │
└────────┬─────────┴────────┬─────────┴─────────┬─────────────────┘
         │                  │                   │
         └──────────────────┼───────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │ logs: string[]  │
                   └────────┬────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   parseEvents(logs)                             │
│         Anchor's EventParser + BorshCoder + IDL                 │
│         → { name: 'dealCreated', data: { ... } }[]              │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Event Handler                                │
│         Routes by event name → storage functions                │
│         + structured logging                                    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Postgres                            │
│         raw_events (audit) + deals + offers (queryable)         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
┌───────────────────────┐   ┌───────────────────────┐
│   PostgREST (REST)    │   │   Realtime (WebSocket)│
└───────────┬───────────┘   └───────────┬───────────┘
            │                           │
            └───────────┬───────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend                                   │
│         queries via REST, subscribes via Realtime               │
└─────────────────────────────────────────────────────────────────┘
```

**The key insight:** All sources ultimately provide `logs: string[]`. The single `parseEvents()` function handles everything.

---

## Next Steps

1. Set up the `indexer/` workspace in the monorepo
2. Set up Supabase project + create tables (schema above)
3. Implement `parser.ts` using Anchor's EventParser
4. Implement `storage/supabase.ts` (insert/upsert functions)
5. Implement `handler.ts` (route events to storage)
6. Implement `adapters/rpc.ts` (RPC subscription)
7. Implement `src/index.ts` (live indexer entry point)
8. Implement `src/backfill.ts` (historical backfill script)
9. Implement `adapters/geyser.ts` (Geyser adapter for production)
10. Integrate frontend with Supabase Realtime
