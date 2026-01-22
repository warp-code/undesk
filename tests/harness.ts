import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Otc } from "../target/types/otc";
import * as fs from "fs";
import * as os from "os";
import {
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  buildFinalizeCompDefTx,
  getMXEPublicKey,
  getMXEAccAddress,
  getClusterAccAddress,
} from "@arcium-hq/client";

// Re-export commonly used items from @arcium-hq/client
export {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  uploadCircuit,
  buildFinalizeCompDefTx,
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  x25519,
} from "@arcium-hq/client";

// Cluster configuration
// For localnet testing: null (uses ARCIUM_CLUSTER_PUBKEY from env)
// For devnet/testnet: specific cluster offset
const CLUSTER_OFFSET: number | null = null;

/**
 * Gets the cluster account address based on configuration.
 * - If CLUSTER_OFFSET is set: Uses getClusterAccAddress (devnet/testnet)
 * - If null: Uses getArciumEnv().arciumClusterOffset (localnet)
 */
export function getClusterAccount(): PublicKey {
  const offset = CLUSTER_OFFSET ?? getArciumEnv().arciumClusterOffset;
  return getClusterAccAddress(offset);
}

export interface TestHarness {
  program: Program<Otc>;
  provider: anchor.AnchorProvider;
  owner: anchor.web3.Keypair;
  arciumEnv: ReturnType<typeof getArciumEnv>;
  clusterAccount: PublicKey;
}

let cachedHarness: TestHarness | null = null;

/**
 * Gets the shared test harness. Creates it on first call, caches for subsequent calls.
 */
export function getTestHarness(): TestHarness {
  if (cachedHarness) {
    return cachedHarness;
  }

  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Otc as Program<Otc>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
  const arciumEnv = getArciumEnv();
  const clusterAccount = getClusterAccount();

  cachedHarness = {
    program,
    provider,
    owner,
    arciumEnv,
    clusterAccount,
  };

  return cachedHarness;
}

/**
 * Reads a keypair from a JSON file.
 */
export function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString()))
  );
}

/**
 * Fetches the MXE public key with retry logic.
 */
export async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 20,
  retryDelayMs: number = 500
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error) {
      console.log(`Attempt ${attempt} failed to fetch MXE public key:`, error);
    }

    if (attempt < maxRetries) {
      console.log(
        `Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(
    `Failed to fetch MXE public key after ${maxRetries} attempts`
  );
}

/**
 * Finalizes a computation definition with retry logic.
 */
export async function finalizeCompDefWithRetry(
  provider: anchor.AnchorProvider,
  offset: Uint8Array,
  programId: PublicKey,
  owner: anchor.web3.Keypair,
  maxRetries: number = 3
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider,
        Buffer.from(offset).readUInt32LE(),
        programId
      );

      const latestBlockhash = await provider.connection.getLatestBlockhash();
      finalizeTx.recentBlockhash = latestBlockhash.blockhash;
      finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      finalizeTx.sign(owner);

      await provider.sendAndConfirm(finalizeTx, [], {
        skipPreflight: true,
        commitment: "confirmed",
      });
      return;
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error);
      if (attempt < maxRetries) {
        console.log(`Retrying in 500ms...`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      } else {
        throw error;
      }
    }
  }
}

// Event utility types
type Event = anchor.IdlEvents<Program<Otc>["idl"]>;

/**
 * Awaits a single event from the program.
 */
export async function awaitEvent<E extends keyof Event>(
  program: Program<Otc>,
  eventName: E,
  timeoutMs: number = 15000
): Promise<Event[E]> {
  let listenerId: number;
  const event = await new Promise<Event[E]>((res, rej) => {
    const timeout = setTimeout(() => {
      program.removeEventListener(listenerId);
      rej(new Error(`Event '${String(eventName)}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    listenerId = program.addEventListener(eventName, (event) => {
      clearTimeout(timeout);
      res(event);
    });
  });
  await program.removeEventListener(listenerId);

  return event;
}

/**
 * Awaits multiple events from the program.
 */
export async function awaitEvents<E extends keyof Event>(
  program: Program<Otc>,
  eventName: E,
  count: number,
  timeoutMs: number = 15000
): Promise<Event[E][]> {
  const events: Event[E][] = [];
  let listenerId: number;

  await new Promise<void>((res, rej) => {
    const timeout = setTimeout(() => {
      program.removeEventListener(listenerId);
      rej(
        new Error(
          `Expected ${count} '${String(eventName)}' events, got ${events.length}`
        )
      );
    }, timeoutMs);

    listenerId = program.addEventListener(eventName, (event) => {
      events.push(event);
      if (events.length === count) {
        clearTimeout(timeout);
        res();
      }
    });
  });

  await program.removeEventListener(listenerId);
  return events;
}

// PDA derivation helpers

/**
 * Derives the counter account address for a given owner.
 */
export function getCounterAddress(program: Program<Otc>, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), owner.toBuffer()],
    program.programId
  )[0];
}

/**
 * Derives the deal account address for a given create_key.
 */
export function getDealAddress(program: Program<Otc>, createKey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("deal"), createKey.toBuffer()],
    program.programId
  )[0];
}

/**
 * Derives the offer account address for a given deal and create_key.
 */
export function getOfferAddress(program: Program<Otc>, deal: PublicKey, createKey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("offer"), deal.toBuffer(), createKey.toBuffer()],
    program.programId
  )[0];
}

// Computation definition initialization helpers

export async function initAddTogetherCompDef(
  program: Program<Otc>,
  provider: anchor.AnchorProvider,
  owner: anchor.web3.Keypair,
  uploadRawCircuit: boolean = false,
  offchainSource: boolean = false
): Promise<string> {
  const baseSeedCompDefAcc = getArciumAccountBaseSeed(
    "ComputationDefinitionAccount"
  );
  const offset = getCompDefAccOffset("add_together");

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  console.log("Comp def pda is ", compDefPDA);

  const sig = await program.methods
    .initAddTogetherCompDef()
    .accounts({
      compDefAccount: compDefPDA,
      payer: owner.publicKey,
      mxeAccount: getMXEAccAddress(program.programId),
    })
    .signers([owner])
    .rpc({
      commitment: "confirmed",
    });
  console.log("Init add together computation definition transaction", sig);

  if (uploadRawCircuit) {
    const { uploadCircuit } = await import("@arcium-hq/client");
    const rawCircuit = fs.readFileSync("build/add_together.arcis");

    await uploadCircuit(
      provider,
      "add_together",
      program.programId,
      rawCircuit,
      true
    );
  } else if (!offchainSource) {
    const finalizeTx = await buildFinalizeCompDefTx(
      provider,
      Buffer.from(offset).readUInt32LE(),
      program.programId
    );

    const latestBlockhash = await provider.connection.getLatestBlockhash();
    finalizeTx.recentBlockhash = latestBlockhash.blockhash;
    finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    finalizeTx.sign(owner);

    await provider.sendAndConfirm(finalizeTx);
  }
  return sig;
}

export async function initInitCounterCompDef(
  program: Program<Otc>,
  provider: anchor.AnchorProvider,
  owner: anchor.web3.Keypair,
  uploadRawCircuit: boolean = false,
  offchainSource: boolean = false
): Promise<string> {
  const baseSeedCompDefAcc = getArciumAccountBaseSeed(
    "ComputationDefinitionAccount"
  );
  const offset = getCompDefAccOffset("init_counter");

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  console.log("Comp def pda is ", compDefPDA);

  const sig = await program.methods
    .initInitCounterCompDef()
    .accounts({
      compDefAccount: compDefPDA,
      payer: owner.publicKey,
      mxeAccount: getMXEAccAddress(program.programId),
    })
    .signers([owner])
    .rpc({
      commitment: "confirmed",
    });
  console.log("Init Counter computation definition transaction", sig);

  if (uploadRawCircuit) {
    const { uploadCircuit } = await import("@arcium-hq/client");
    const rawCircuit = fs.readFileSync("build/init_counter.arcis");

    await uploadCircuit(
      provider,
      "init_counter",
      program.programId,
      rawCircuit,
      true
    );
  } else if (!offchainSource) {
    await finalizeCompDefWithRetry(provider, offset, program.programId, owner);
  }
  return sig;
}

export async function initIncrementCounterCompDef(
  program: Program<Otc>,
  provider: anchor.AnchorProvider,
  owner: anchor.web3.Keypair,
  uploadRawCircuit: boolean = false,
  offchainSource: boolean = false
): Promise<string> {
  const baseSeedCompDefAcc = getArciumAccountBaseSeed(
    "ComputationDefinitionAccount"
  );
  const offset = getCompDefAccOffset("increment_counter");

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  console.log("Comp def pda is ", compDefPDA);

  const sig = await program.methods
    .initIncrementCounterCompDef()
    .accounts({
      compDefAccount: compDefPDA,
      payer: owner.publicKey,
      mxeAccount: getMXEAccAddress(program.programId),
    })
    .signers([owner])
    .rpc({
      commitment: "confirmed",
    });
  console.log("Increment Counter computation definition transaction", sig);

  if (uploadRawCircuit) {
    const { uploadCircuit } = await import("@arcium-hq/client");
    const rawCircuit = fs.readFileSync("build/increment_counter.arcis");

    await uploadCircuit(
      provider,
      "increment_counter",
      program.programId,
      rawCircuit,
      true
    );
  } else if (!offchainSource) {
    await finalizeCompDefWithRetry(provider, offset, program.programId, owner);
  }
  return sig;
}

export async function initGetCounterCompDef(
  program: Program<Otc>,
  provider: anchor.AnchorProvider,
  owner: anchor.web3.Keypair,
  uploadRawCircuit: boolean = false,
  offchainSource: boolean = false
): Promise<string> {
  const baseSeedCompDefAcc = getArciumAccountBaseSeed(
    "ComputationDefinitionAccount"
  );
  const offset = getCompDefAccOffset("get_counter");

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  console.log("Comp def pda is ", compDefPDA);

  const sig = await program.methods
    .initGetCounterCompDef()
    .accounts({
      compDefAccount: compDefPDA,
      payer: owner.publicKey,
      mxeAccount: getMXEAccAddress(program.programId),
    })
    .signers([owner])
    .rpc({
      commitment: "confirmed",
    });
  console.log("Get Counter computation definition transaction", sig);

  if (uploadRawCircuit) {
    const { uploadCircuit } = await import("@arcium-hq/client");
    const rawCircuit = fs.readFileSync("build/get_counter.arcis");

    await uploadCircuit(
      provider,
      "get_counter",
      program.programId,
      rawCircuit,
      true
    );
  } else if (!offchainSource) {
    await finalizeCompDefWithRetry(provider, offset, program.programId, owner);
  }
  return sig;
}

export async function initCreateDealCompDef(
  program: Program<Otc>,
  provider: anchor.AnchorProvider,
  owner: anchor.web3.Keypair,
  uploadRawCircuit: boolean = false,
  offchainSource: boolean = false
): Promise<string> {
  const baseSeedCompDefAcc = getArciumAccountBaseSeed(
    "ComputationDefinitionAccount"
  );
  const offset = getCompDefAccOffset("create_deal");

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  console.log("Create Deal comp def pda is ", compDefPDA);

  const sig = await program.methods
    .initCreateDealCompDef()
    .accounts({
      compDefAccount: compDefPDA,
      payer: owner.publicKey,
      mxeAccount: getMXEAccAddress(program.programId),
    })
    .signers([owner])
    .rpc({
      commitment: "confirmed",
    });
  console.log("Init Create Deal computation definition transaction", sig);

  if (uploadRawCircuit) {
    const { uploadCircuit } = await import("@arcium-hq/client");
    const rawCircuit = fs.readFileSync("build/create_deal.arcis");

    await uploadCircuit(
      provider,
      "create_deal",
      program.programId,
      rawCircuit,
      true
    );
  } else if (!offchainSource) {
    await finalizeCompDefWithRetry(provider, offset, program.programId, owner);
  }
  return sig;
}

export async function initSubmitOfferCompDef(
  program: Program<Otc>,
  provider: anchor.AnchorProvider,
  owner: anchor.web3.Keypair,
  uploadRawCircuit: boolean = false,
  offchainSource: boolean = false
): Promise<string> {
  const baseSeedCompDefAcc = getArciumAccountBaseSeed(
    "ComputationDefinitionAccount"
  );
  const offset = getCompDefAccOffset("submit_offer");

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  console.log("Submit Offer comp def pda is ", compDefPDA);

  const sig = await program.methods
    .initSubmitOfferCompDef()
    .accounts({
      compDefAccount: compDefPDA,
      payer: owner.publicKey,
      mxeAccount: getMXEAccAddress(program.programId),
    })
    .signers([owner])
    .rpc({
      commitment: "confirmed",
    });
  console.log("Init Submit Offer computation definition transaction", sig);

  if (uploadRawCircuit) {
    const { uploadCircuit } = await import("@arcium-hq/client");
    const rawCircuit = fs.readFileSync("build/submit_offer.arcis");

    await uploadCircuit(
      provider,
      "submit_offer",
      program.programId,
      rawCircuit,
      true
    );
  } else if (!offchainSource) {
    await finalizeCompDefWithRetry(provider, offset, program.programId, owner);
  }
  return sig;
}

export async function initCrankDealCompDef(
  program: Program<Otc>,
  provider: anchor.AnchorProvider,
  owner: anchor.web3.Keypair,
  uploadRawCircuit: boolean = false,
  offchainSource: boolean = false
): Promise<string> {
  const baseSeedCompDefAcc = getArciumAccountBaseSeed(
    "ComputationDefinitionAccount"
  );
  const offset = getCompDefAccOffset("crank_deal");

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  console.log("Crank Deal comp def pda is ", compDefPDA);

  const sig = await program.methods
    .initCrankDealCompDef()
    .accounts({
      compDefAccount: compDefPDA,
      payer: owner.publicKey,
      mxeAccount: getMXEAccAddress(program.programId),
    })
    .signers([owner])
    .rpc({
      commitment: "confirmed",
    });
  console.log("Init Crank Deal computation definition transaction", sig);

  if (uploadRawCircuit) {
    const { uploadCircuit } = await import("@arcium-hq/client");
    const rawCircuit = fs.readFileSync("build/crank_deal.arcis");

    await uploadCircuit(
      provider,
      "crank_deal",
      program.programId,
      rawCircuit,
      true
    );
  } else if (!offchainSource) {
    await finalizeCompDefWithRetry(provider, offset, program.programId, owner);
  }
  return sig;
}

export async function initCrankOfferCompDef(
  program: Program<Otc>,
  provider: anchor.AnchorProvider,
  owner: anchor.web3.Keypair,
  uploadRawCircuit: boolean = false,
  offchainSource: boolean = false
): Promise<string> {
  const baseSeedCompDefAcc = getArciumAccountBaseSeed(
    "ComputationDefinitionAccount"
  );
  const offset = getCompDefAccOffset("crank_offer");

  const compDefPDA = PublicKey.findProgramAddressSync(
    [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
    getArciumProgramId()
  )[0];

  console.log("Crank Offer comp def pda is ", compDefPDA);

  const sig = await program.methods
    .initCrankOfferCompDef()
    .accounts({
      compDefAccount: compDefPDA,
      payer: owner.publicKey,
      mxeAccount: getMXEAccAddress(program.programId),
    })
    .signers([owner])
    .rpc({
      commitment: "confirmed",
    });
  console.log("Init Crank Offer computation definition transaction", sig);

  if (uploadRawCircuit) {
    const { uploadCircuit } = await import("@arcium-hq/client");
    const rawCircuit = fs.readFileSync("build/crank_offer.arcis");

    await uploadCircuit(
      provider,
      "crank_offer",
      program.programId,
      rawCircuit,
      true
    );
  } else if (!offchainSource) {
    await finalizeCompDefWithRetry(provider, offset, program.programId, owner);
  }
  return sig;
}
