# Indexer Code Review

This document provides a comprehensive review of the OTC event indexer implementation, analyzing its architecture, approach, strengths, and areas for improvement.

---

## Executive Summary

The indexer is a **solid, functional implementation** that follows the architectural plan from `000-indexer-architecture.md` closely. It successfully:

- Parses Anchor events from transaction logs
- Stores raw events for auditing
- Maintains processed `deals` and `offers` tables
- Handles both live subscription (RPC) and historical backfill
- Implements idempotent upserts with slot-based ordering

**Verdict:** This is workable production code. Some refinements are recommended, but no fundamental refactoring is needed.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Entry Points                                │
├─────────────────────────┬───────────────────────────────────────┤
│  src/index.ts           │  src/backfill.ts                      │
│  (live RPC subscription)│  (historical fetch)                   │
└───────────┬─────────────┴───────────────┬───────────────────────┘
            │                             │
            ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Configuration                                │
│  config.ts - loads env vars (RPC_URL, PROGRAM_ID, Supabase)     │
│  log.ts    - structured JSON logging                            │
└───────────────────────────┬─────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
┌───────────────────────┐       ┌───────────────────────────────┐
│   adapters/rpc.ts     │       │      backfill.ts              │
│   (onLogs listener)   │       │  (getSignaturesForAddress +   │
│                       │       │   getParsedTransactions)      │
└───────────┬───────────┘       └───────────────┬───────────────┘
            │                                   │
            └───────────────┬───────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     parser.ts                                    │
│  parseEvents(logs: string[]) → Event[]                          │
│  Uses Anchor BorshCoder.events.decode() with IDL                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                     handler.ts                                   │
│  Routes events by name to storage functions                     │
│  Always inserts raw_event first, then updates processed tables  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  storage/supabase.ts                             │
│  insertRawEvent()      - audit trail                            │
│  upsertDealCreated()   - insert or update deal                  │
│  upsertDealSettled()   - update deal with settlement            │
│  upsertOfferCreated()  - insert or update offer                 │
│  upsertOfferSettled()  - update offer with settlement           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Analysis

### 1. Entry Points

#### `src/index.ts` (Live Indexer)
**Lines:** 59

A clean entry point that:
- Loads config from environment
- Creates Supabase storage client
- Creates RPC adapter with log subscription
- Handles graceful shutdown (SIGINT/SIGTERM)

**Assessment:** Clean and minimal. Does exactly what it should.

#### `src/backfill.ts`
**Lines:** 203

Historical backfill script with:
- CLI argument parsing (`--limit`, `--before`, `--batch-size`)
- Paginated signature fetching
- Batch transaction fetching
- Chronological processing (oldest first)

**Key design choice:** Reverses signatures to process oldest first (line 80). This ensures `DealCreated` events are indexed before `OfferCreated` events that reference them.

**Assessment:** Well-structured. Batching is sensible (default 100 tx per batch).

---

### 2. Event Parsing

#### `src/parser.ts`
**Lines:** 57

Uses Anchor's `BorshCoder.events.decode()` directly:

```typescript
const coder = new BorshCoder(idl);
// ...
const decoded = coder.events.decode(base64Data);
```

**Key points:**
- Loads IDL from `target/idl/otc.json` at module load time
- Scans for "Program data:" log lines (where Anchor emits events)
- Converts camelCase event names to PascalCase (e.g., `dealCreated` → `DealCreated`)
- Returns typed `Event[]` with proper `PublicKey` and `BN` instances

**Deviation from plan:** The plan mentioned using `EventParser` class. Implementation uses `BorshCoder.events.decode()` directly. This is simpler and works correctly.

**Assessment:** Solid. The PascalCase conversion is a minor inconsistency (Anchor uses camelCase, but the handler expects PascalCase).

---

### 3. Event Types

#### `src/types.ts`
**Lines:** 101

Defines TypeScript interfaces for:
- `TxContext` - signature, slot, blockTime
- `EventWithContext<T>` - wraps event data with context
- Event data types: `DealCreatedData`, `OfferCreatedData`, `DealSettledData`, `OfferSettledData`
- `IngestionAdapter` interface

**Key observation:** Event data types use snake_case field names (matching Anchor's Borsh serialization with new IDL format).

**Assessment:** Well-typed. The snake_case naming is correct for how Anchor 0.32+ serializes events.

---

### 4. Event Handler

#### `src/handler.ts`
**Lines:** 61

Simple routing logic:
1. Always calls `storage.insertRawEvent()` first (audit trail)
2. Routes by event name to appropriate upsert function
3. Logs warnings for unknown events
4. Continues processing on individual event errors (doesn't abort batch)

**Assessment:** Clean and correct. Error isolation is good.

---

### 5. Storage Layer

#### `src/storage/supabase.ts`
**Lines:** 329

The most substantial file. Implements the `Storage` interface with:

**Helper functions:**
- `pubkeyToBase58()` - PublicKey → string
- `bnToIsoString()` - BN timestamp → ISO string
- `bytesToBytea()` - byte array → PostgreSQL bytea format (`\x...`)
- `ciphertextsToBytea()` - 2D array → flattened bytea
- `statusToString()` - u8 → "executed" | "expired"

**Upsert strategy (critical design):**

```typescript
// Try insert first
const { error: insertError } = await client.from("deals").insert(insert);

if (insertError?.code === "23505") {  // Duplicate key
  // Update only if incoming slot > existing slot
  const { data: updated } = await client
    .from("deals")
    .update({ ...insert })
    .eq("address", address)
    .lt("slot", slot)  // ← Key: only update if our slot is newer
    .select("address");

  if (!updated?.length) {
    // Existing record has higher slot - skip
    return;
  }
}
```

**Why this matters:**
- Events may arrive out of order (especially during backfill)
- Slot number provides canonical ordering
- Only accept updates from higher slots (newer state)
- Prevents older events from overwriting newer state

**Assessment:** This is the right approach. The slot-based ordering ensures correctness even with out-of-order event processing.

---

### 6. RPC Adapter

#### `src/adapters/rpc.ts`
**Lines:** 79

Uses `connection.onLogs()` for real-time subscription:
- Subscribes to program logs at "confirmed" commitment
- Skips failed transactions
- Parses events from logs
- Attaches context (signature, slot, blockTime=null)

**Note:** `blockTime` is always `null` from `onLogs()`. This is a Solana limitation - `onLogs` doesn't provide block time.

**Assessment:** Correct implementation. The blockTime limitation is documented.

---

### 7. Logging

#### `src/log.ts`
**Lines:** 51

Minimal structured JSON logger:
- Level filtering (debug/info/warn/error)
- JSON output format: `{ ts, level, msg, ...data }`
- No external dependencies

**Assessment:** Simple and sufficient. Could use a library (pino, winston) for production, but this works.

---

### 8. Configuration

#### `src/config.ts`
**Lines:** 54

Loads from environment:
- `RPC_URL` (required)
- `PROGRAM_ID` (required)
- `SUPABASE_URL` (defaults to local)
- `SUPABASE_SERVICE_ROLE_KEY` (defaults to local dev key)
- `LOG_LEVEL` (defaults to "info")

**Assessment:** Sensible defaults for local development. Production would override via env vars.

---

## What's Implemented vs. Planned

| Component | Planned | Implemented | Notes |
|-----------|---------|-------------|-------|
| Event Parser | Anchor EventParser | BorshCoder.events.decode | Simpler, works |
| RPC Adapter | ✓ | ✓ | Complete |
| Geyser Adapter | ✓ | ✗ | Not implemented |
| Backfill Script | ✓ | ✓ | Complete |
| Storage Interface | ✓ | ✓ | Complete |
| Raw Events Table | ✓ | ✓ | Complete |
| Deals Table | ✓ | ✓ | Complete |
| Offers Table | ✓ | ✓ | Complete |
| Structured Logging | ✓ | ✓ | Complete |
| Graceful Shutdown | ✓ | ✓ | Complete |
| Slot-based Idempotency | ✓ | ✓ | Complete |

**Missing:** Geyser adapter is not implemented. This is fine for development but would be needed for production (lower latency, more reliable).

---

## Strengths

### 1. Correct Event Ordering
The slot-based upsert logic is the right approach. It handles:
- Out-of-order event delivery
- Backfill running in parallel with live indexer
- Reprocessing/recovery scenarios

### 2. Audit Trail
Raw events are stored before processed updates. If processing logic has bugs, the raw data is preserved for reprocessing.

### 3. Clean Separation of Concerns
- Parser is pure (logs in → events out)
- Handler is routing only
- Storage handles all DB logic
- Adapters are pluggable

### 4. Minimal Dependencies
Only essential dependencies:
- `@coral-xyz/anchor` (event parsing)
- `@solana/web3.js` (RPC client)
- `@otc/supabase` (typed DB client)

### 5. Handles Encrypted Data Correctly
Encrypted fields are stored as raw bytes without interpretation. Decryption is left to clients with the private keys.

---

## Areas for Improvement

### 1. Missing Geyser Adapter
**Impact:** Medium (for production)

RPC `onLogs()` has limitations:
- Higher latency (~400ms vs ~50ms for Geyser)
- May miss events on websocket disconnects
- No built-in replay capability

**Recommendation:** Implement Geyser adapter before mainnet launch.

### 2. No Reconnection Logic
**Impact:** Medium

The RPC adapter doesn't handle websocket disconnects. If the connection drops, the indexer silently stops receiving events.

**Recommendation:** Add connection health monitoring and automatic reconnection:
```typescript
connection.onLogs(programId, handler, "confirmed", {
  onError: (error) => {
    logger.error("WebSocket error, reconnecting...");
    // Reconnection logic
  }
});
```

### 3. No Cursor/Checkpoint for Backfill
**Impact:** Low

Backfill fetches all signatures each run. For large histories, a checkpoint mechanism would allow resumable backfills.

**Recommendation:** Store last processed slot and support `--from-slot` option.

### 4. BlockTime Missing from Live Events
**Impact:** Low

`onLogs()` doesn't provide `blockTime`. Events indexed from live subscription have `blockTime: null`.

**Recommendation:** Optional post-fill that fetches transactions to populate blockTime, or accept the limitation.

### 5. No Rate Limiting for RPC Calls
**Impact:** Low (depends on RPC provider)

Backfill makes many RPC calls. Some providers rate limit.

**Recommendation:** Add configurable rate limiting or use a rate-limited RPC wrapper.

### 6. Raw Data Stored as JSON, Not Bytes
**Impact:** Low

The plan mentioned storing raw event bytes. Implementation stores JSON-stringified data:
```typescript
raw_data: JSON.stringify(event.data, ...)
```

This is fine for debugging but less compact than raw bytes. The schema expects `BYTEA` but receives a JSON string.

**Recommendation:** Either change schema to `JSONB` or store actual Borsh bytes.

### 7. Error Handling Could Be More Granular
**Impact:** Low

Individual event failures are logged but continue processing. This is good, but there's no dead-letter queue or retry mechanism.

**Recommendation:** For production, consider:
- Dead-letter table for failed events
- Retry logic with exponential backoff
- Alerting on repeated failures

---

## Database Schema Alignment

Comparing `storage/supabase.ts` insert types with the migration schema:

| Field | Schema | Storage | Match? |
|-------|--------|---------|--------|
| raw_data | BYTEA | JSON string | ⚠️ Mismatch |
| encryption_key | BYTEA | `\x...` format | ✓ |
| nonce | BYTEA | `\x...` format | ✓ |
| ciphertexts | BYTEA | `\x...` format | ✓ |
| slot | BIGINT | number | ✓ |

The raw_data mismatch should be addressed - either store actual bytes or change the column to JSONB.

---

## Performance Considerations

### Backfill Performance
- Fetches transactions in batches of 100 (configurable)
- Processes sequentially within batches
- No parallelism for event handling

For large backfills (thousands of transactions), this is adequate. For very large histories (millions), consider:
- Parallel batch processing
- Chunked commits
- Progress persistence

### Live Indexing Performance
- Single-threaded event processing
- Synchronous database writes

This is fine for typical OTC volumes (10s-100s of events/hour). For high-frequency use cases, consider:
- Buffered batch inserts
- Async write queues

---

## Security Considerations

### Supabase Service Role Key
The service role key is hardcoded for local development. In production:
- Use environment variables
- Restrict key permissions
- Consider using RLS even for the indexer

### No Input Validation
Events from the chain are trusted (they passed program validation). This is correct - the indexer shouldn't second-guess on-chain state.

### Signature Uniqueness
Raw events are keyed by `(signature, event_name)`. This prevents duplicate indexing but assumes one event of each type per transaction. The OTC program design supports this.

---

## Testing Gaps

No test files were found in the indexer package. Recommended tests:

1. **Parser tests** - Mock logs, verify event extraction
2. **Storage tests** - Mock Supabase, verify upsert logic
3. **Handler tests** - Verify routing
4. **Integration tests** - Full flow with local Supabase

---

## Recommendations Summary

### Must Do (Before Production)
1. Implement Geyser adapter or accept RPC limitations
2. Add WebSocket reconnection logic
3. Fix raw_data storage (BYTEA vs JSON mismatch)

### Should Do
4. Add basic tests
5. Implement checkpoint/resume for backfill
6. Add dead-letter handling for failed events

### Nice to Have
7. Rate limiting for RPC calls
8. Metrics/monitoring (Prometheus integration)
9. BlockTime backfill for live events

---

## Conclusion

The indexer implementation is **production-viable** with some polish. The core architecture is sound:

- Event parsing uses Anchor's built-in tooling correctly
- Storage layer handles idempotency via slot-based ordering
- Clean separation between adapters, parsing, and storage

The main gaps are operational (Geyser, reconnection, monitoring) rather than architectural. The code can be deployed for development/testing now and enhanced incrementally for production.

**Overall Grade: B+**
- Architecture: A
- Implementation: B+
- Test Coverage: D (none)
- Production Readiness: B-
