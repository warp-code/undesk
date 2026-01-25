# Conditional Computation Definition Initialization

This document explains how to initialize `ComputationDefinitionAccount` (comp_def) accounts only if they don't already exist.

## Background

### Current Behavior

The current test setup (`tests/main.test.ts`) initializes all comp_def accounts unconditionally:

```typescript
it("initializes create_deal comp def", async () => {
  const sig = await initCreateDealCompDef(program, provider, owner, false, false);
});
```

This works fine for local testing because `arcium test` starts a fresh validator each time. However, it fails if:
- You're running tests against an existing deployment (devnet/testnet)
- The validator wasn't restarted between test runs
- You want to run specific test files without re-running setup

### What Happens If You Re-Initialize

If you call `init_comp_def` on an already-initialized account, the transaction **fails** with an Anchor/System Program error:

```
Error: Account already in use
```

This is because Arcium's `init_comp_def` uses Anchor's `init` constraint internally, which calls `system_program.create_account()`. That instruction fails if the account already has data.

---

## Solution: Check Before Init

### Approach 1: Pre-flight Check (Recommended)

Check if the account exists before attempting initialization:

```typescript
import { PublicKey } from "@solana/web3.js";
import {
  getArciumAccountBaseSeed,
  getCompDefAccOffset,
  getArciumProgramId,
} from "@arcium-hq/client";

/**
 * Checks if a computation definition account is already initialized.
 */
export async function isCompDefInitialized(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  circuitName: string
): Promise<boolean> {
  const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const offset = getCompDefAccOffset(circuitName);

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  const accountInfo = await provider.connection.getAccountInfo(compDefPDA);
  return accountInfo !== null;
}
```

### Approach 2: Try/Catch (Alternative)

Attempt initialization and catch the "already exists" error:

```typescript
export async function initCompDefSafe(
  initFn: () => Promise<string>,
  displayName: string
): Promise<string | null> {
  try {
    const sig = await initFn();
    console.log(`[${displayName}] Initialized:`, sig);
    return sig;
  } catch (error: any) {
    const msg = error.message || "";
    const logs = error.logs || [];

    // Check for "already initialized" type errors
    if (
      msg.includes("already in use") ||
      msg.includes("already initialized") ||
      logs.some((log: string) =>
        log.includes("already in use") || log.includes("already initialized")
      )
    ) {
      console.log(`[${displayName}] Already initialized, skipping`);
      return null;
    }

    // Re-throw unexpected errors
    throw error;
  }
}
```

**Trade-offs:**

| Approach | Pros | Cons |
|----------|------|------|
| Pre-flight check | Clear, explicit; avoids failed tx | Extra RPC call; TOCTOU race possible |
| Try/catch | Single tx attempt; handles races | Relies on error message parsing |

---

## Implementation for Your Harness

### Add Helper to `tests/harness.ts`

```typescript
/**
 * Checks if a computation definition account exists.
 */
export async function isCompDefInitialized(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  circuitName: string
): Promise<boolean> {
  const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const offset = getCompDefAccOffset(circuitName);

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  const accountInfo = await provider.connection.getAccountInfo(compDefPDA);
  return accountInfo !== null;
}

/**
 * Generic wrapper that initializes a comp_def only if it doesn't exist.
 * Returns the tx signature if initialized, null if already exists.
 */
export async function initCompDefIfNeeded(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  circuitName: string,
  initFn: () => Promise<string>,
  displayName?: string
): Promise<string | null> {
  const name = displayName || circuitName;

  const exists = await isCompDefInitialized(provider, programId, circuitName);

  if (exists) {
    console.log(`[${name}] comp_def already exists, skipping`);
    return null;
  }

  console.log(`[${name}] Initializing comp_def...`);
  const sig = await initFn();
  console.log(`[${name}] Initialized:`, sig);
  return sig;
}
```

### Update `tests/main.test.ts`

```typescript
import {
  getTestHarness,
  initCompDefIfNeeded,
  initAddTogetherCompDef,
  initCreateDealCompDef,
  // ... other imports
} from "./harness";

describe("OTC Setup", () => {
  const { program, provider, owner } = getTestHarness();

  it("initializes add_together comp def", async () => {
    await initCompDefIfNeeded(
      provider,
      program.programId,
      "add_together",
      () => initAddTogetherCompDef(program, provider, owner, false, false),
      "Add Together"
    );
  });

  it("initializes create_deal comp def", async () => {
    await initCompDefIfNeeded(
      provider,
      program.programId,
      "create_deal",
      () => initCreateDealCompDef(program, provider, owner, false, false),
      "Create Deal"
    );
  });

  // ... repeat for other comp defs
});
```

### Alternative: Batch Initialization

If you want to initialize all comp defs in a single test:

```typescript
describe("OTC Setup", () => {
  const { program, provider, owner } = getTestHarness();

  it("initializes all comp defs", async () => {
    const compDefs = [
      { name: "add_together", init: initAddTogetherCompDef },
      { name: "init_counter", init: initInitCounterCompDef },
      { name: "increment_counter", init: initIncrementCounterCompDef },
      { name: "get_counter", init: initGetCounterCompDef },
      { name: "create_deal", init: initCreateDealCompDef },
      { name: "submit_offer", init: initSubmitOfferCompDef },
      { name: "crank_deal", init: initCrankDealCompDef },
      { name: "crank_offer", init: initCrankOfferCompDef },
    ];

    for (const { name, init } of compDefs) {
      await initCompDefIfNeeded(
        provider,
        program.programId,
        name,
        () => init(program, provider, owner, false, false),
        name
      );
    }
  });
});
```

---

## Considerations

### 1. Finalization State

The existence check only verifies the account exists, not that it's finalized. If you need to verify finalization:

```typescript
export async function isCompDefFinalized(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  circuitName: string
): Promise<boolean> {
  const baseSeedCompDefAcc = getArciumAccountBaseSeed("ComputationDefinitionAccount");
  const offset = getCompDefAccOffset(circuitName);

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  const accountInfo = await provider.connection.getAccountInfo(compDefPDA);
  if (!accountInfo) return false;

  // The ComputationDefinitionAccount has a `finalized` field
  // You'd need to decode the account data to check this
  // For now, existence is usually sufficient
  return true;
}
```

### 2. Program ID Changes

Comp_def accounts are tied to your program ID via the PDA seeds:

```
seeds = [baseSeed, programId, offset]
```

If you deploy to a **new program address**, the comp_defs don't exist yet (different PDA). The existence check will correctly return `false`.

### 3. Race Conditions

If running parallel tests, two processes might both check, both see "not initialized", and both try to init. One will succeed, one will fail.

**Solution:** Run comp_def initialization sequentially, or use the try/catch approach which handles this gracefully.

### 4. Local vs Devnet

| Environment | Behavior |
|-------------|----------|
| **Localnet** (`arcium test`) | Fresh validator each time; comp_defs never exist |
| **Devnet/Testnet** | State persists; comp_defs exist after first run |
| **Persistent local** | If you don't restart validator, comp_defs persist |

The conditional init pattern is most useful for devnet/testnet or when you don't want to restart the validator between test runs.

---

## Quick Reference

### Check Existence

```typescript
const exists = await isCompDefInitialized(provider, programId, "create_deal");
```

### Init If Needed

```typescript
await initCompDefIfNeeded(
  provider,
  program.programId,
  "create_deal",
  () => initCreateDealCompDef(program, provider, owner, false, false)
);
```

### PDA Derivation

```typescript
const compDefPDA = PublicKey.findProgramAddressSync(
  [
    getArciumAccountBaseSeed("ComputationDefinitionAccount"),
    programId.toBuffer(),
    getCompDefAccOffset("circuit_name"),
  ],
  getArciumProgramId()
)[0];
```

---

## References

- [Arcium Deployment Docs](https://docs.arcium.com/developers/deployment)
- [arcium-election example](https://github.com/quiknode-labs/arcium-election) - uses pre-flight check pattern
- Local harness: `tests/harness.ts`
