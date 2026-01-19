import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Otc } from "../target/types/otc";
import { randomBytes } from "crypto";
import {
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
import * as fs from "fs";
import * as os from "os";
import { expect } from "chai";

// Cluster configuration
// For localnet testing: null (uses ARCIUM_CLUSTER_PUBKEY from env)
// For devnet/testnet: specific cluster offset
const CLUSTER_OFFSET: number | null = null;

/**
 * Gets the cluster account address based on configuration.
 * - If CLUSTER_OFFSET is set: Uses getClusterAccAddress (devnet/testnet)
 * - If null: Uses getArciumEnv().arciumClusterOffset (localnet)
 */
function getClusterAccount(): PublicKey {
  const offset = CLUSTER_OFFSET ?? getArciumEnv().arciumClusterOffset;
  return getClusterAccAddress(offset);
}

describe("Otc", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.Otc as Program<Otc>;
  const provider = anchor.getProvider();

  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E,
    timeoutMs: number = 15000
  ): Promise<Event[E]> => {
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
  };

  const awaitEvents = async <E extends keyof Event>(
    eventName: E,
    count: number,
    timeoutMs: number = 15000
  ): Promise<Event[E][]> => {
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
  };

  const arciumEnv = getArciumEnv();
  const clusterAccount = getClusterAccount();
  const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);

  it("Add together initialized", async () => {
    console.log("Initializing add together computation definition");
    const initATSig = await initAddTogetherCompDef(
      program,
      owner,
      false,
      false
    );
    console.log(
      "Add Together computation definition initialized with signature",
      initATSig
    );

    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);

    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);

    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    const val1 = BigInt(1);
    const val2 = BigInt(2);
    const plaintext = [val1, val2];

    const nonce = randomBytes(16);
    const ciphertext = cipher.encrypt(plaintext, nonce);

    const sumEventPromise = awaitEvent("sumEvent");
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const queueSig = await program.methods
      .addTogether(
        computationOffset,
        Array.from(ciphertext[0]),
        Array.from(ciphertext[1]),
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString())
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          computationOffset
        ),
        clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(
          arciumEnv.arciumClusterOffset
        ),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("add_together")).readUInt32LE()
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue sig is ", queueSig);

    const finalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    const sumEvent = await sumEventPromise;
    const decrypted = cipher.decrypt([sumEvent.sum], Uint8Array.from(sumEvent.nonce))[0];
    expect(decrypted).to.equal(val1 + val2);
  });

  it("Init Counter initialized", async () => {
    const initCompDefSig = await initInitCounterCompDef(
      program,
      owner,
      false,
      false
    );

    console.log(
      "Init Counter computation definition initialized with signature",
      initCompDefSig
    );
  });

  it("Increment Counter initialized", async () => {
    const initCompDefSig = await initIncrementCounterCompDef(
      program,
      owner,
      false,
      false
    );

    console.log(
      "Increment Counter computation definition initialized with signature",
      initCompDefSig
    );
  });

  it("Get Counter initialized", async () => {
    const initCompDefSig = await initGetCounterCompDef(
      program,
      owner,
      false,
      false
    );

    console.log(
      "Get Counter computation definition initialized with signature",
      initCompDefSig
    );
  });

  it("Succesfully initializes, increments, and reads a counter", async () => {
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);

    // Generate keypairs for get_counter re-encryption
    // First keypair - passed as recipient_pubkey
    const privateKey1 = x25519.utils.randomSecretKey();
    const publicKey1 = x25519.getPublicKey(privateKey1);

    // Second keypair - passed as pubkey_hi/pubkey_lo
    const privateKey2 = x25519.utils.randomSecretKey();
    const publicKey2 = x25519.getPublicKey(privateKey2);

    // Split second pubkey into hi/lo u128s (first 16 bytes = hi, last 16 bytes = lo)
    const pubkey_hi = deserializeLE(publicKey2.slice(0, 16));
    const pubkey_lo = deserializeLE(publicKey2.slice(16, 32));

    const computationOffset = new anchor.BN(randomBytes(8), "hex");
    const initNonce = randomBytes(16);

    const counterAddr = getCounterAddress(owner.publicKey);

    // Step 1: Initialize the counter (Mxe marker needs nonce for output encryption)
    const queueInitSig = await program.methods
      .initCounter(
        computationOffset,
        new anchor.BN(deserializeLE(initNonce).toString())
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          computationOffset
        ),
        clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(
          arciumEnv.arciumClusterOffset
        ),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("init_counter")).readUInt32LE()
        ),
        counter: counterAddr,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue init sig is ", queueInitSig);

    const finalizeInitSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize init sig is ", finalizeInitSig);

    // Step 2: Increment the counter (reads encrypted state from account)
    const incrementComputationOffset = new anchor.BN(randomBytes(8), "hex");

    const queueIncrementSig = await program.methods
      .incrementCounter(incrementComputationOffset)
      .accountsPartial({
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          incrementComputationOffset
        ),
        clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(
          arciumEnv.arciumClusterOffset
        ),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("increment_counter")).readUInt32LE()
        ),
        counter: counterAddr,
      })
      .rpc({ skipPreflight: false, commitment: "confirmed" });
    console.log("Queue increment sig is ", queueIncrementSig);

    const finalizeIncrementSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      incrementComputationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize increment sig is ", finalizeIncrementSig);

    // Step 3: Read the counter using get_counter (re-encrypts for both users)
    const getComputationOffset = new anchor.BN(randomBytes(8), "hex");
    const recipientNonce = randomBytes(16);

    // Await TWO events since get_counter now returns two encrypted outputs
    const counterValueEventsPromise = awaitEvents("counterValueEvent", 2);

    const queueGetSig = await program.methods
      .getCounter(
        getComputationOffset,
        Array.from(publicKey1),
        new anchor.BN(deserializeLE(recipientNonce).toString()),
        new anchor.BN(pubkey_hi.toString()),
        new anchor.BN(pubkey_lo.toString())
      )
      .accountsPartial({
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          getComputationOffset
        ),
        clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(
          arciumEnv.arciumClusterOffset
        ),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("get_counter")).readUInt32LE()
        ),
        counter: counterAddr,
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue get sig is ", queueGetSig);

    const finalizeGetSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      getComputationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize get sig is ", finalizeGetSig);

    // Wait for both events
    const counterValueEvents = await counterValueEventsPromise;
    const [event1, event2] = counterValueEvents;

    // Decrypt first event with privateKey1 (recipient)
    const sharedSecret1 = x25519.getSharedSecret(privateKey1, mxePublicKey);
    const cipher1 = new RescueCipher(sharedSecret1);
    const decrypted1 = cipher1.decrypt(
      [event1.ciphertext],
      Uint8Array.from(event1.nonce)
    );

    // After init (0) + increment (1) = 1
    expect(decrypted1[0]).to.equal(BigInt(1));
    console.log("Decrypted counter value for recipient 1:", decrypted1[0]);

    // Decrypt second event with privateKey2 (pubkey_hi/pubkey_lo user)
    const sharedSecret2 = x25519.getSharedSecret(privateKey2, mxePublicKey);
    const cipher2 = new RescueCipher(sharedSecret2);
    const decrypted2 = cipher2.decrypt(
      [event2.ciphertext],
      Uint8Array.from(event2.nonce)
    );

    // Both should have the same counter value
    expect(decrypted2[0]).to.equal(BigInt(1));
    console.log("Decrypted counter value for recipient 2:", decrypted2[0]);
  });

  async function initAddTogetherCompDef(
    program: Program<Otc>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
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
      const rawCircuit = fs.readFileSync("build/add_together.arcis");

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "add_together",
        program.programId,
        rawCircuit,
        true
      );
    } else if (!offchainSource) {
      const finalizeTx = await buildFinalizeCompDefTx(
        provider as anchor.AnchorProvider,
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

  async function initInitCounterCompDef(
    program: Program<Otc>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
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
      const rawCircuit = fs.readFileSync("build/init_counter.arcis");

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "init_counter",
        program.programId,
        rawCircuit,
        true
      );
    } else if (!offchainSource) {
      await finalizeCompDefWithRetry(provider as anchor.AnchorProvider, offset, program.programId, owner);
    }
    return sig;
  }

  async function finalizeCompDefWithRetry(
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

  async function initIncrementCounterCompDef(
    program: Program<Otc>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
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
      const rawCircuit = fs.readFileSync("build/increment_counter.arcis");

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "increment_counter",
        program.programId,
        rawCircuit,
        true
      );
    } else if (!offchainSource) {
      await finalizeCompDefWithRetry(provider as anchor.AnchorProvider, offset, program.programId, owner);
    }
    return sig;
  }

  async function initGetCounterCompDef(
    program: Program<Otc>,
    owner: anchor.web3.Keypair,
    uploadRawCircuit: boolean,
    offchainSource: boolean
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
      const rawCircuit = fs.readFileSync("build/get_counter.arcis");

      await uploadCircuit(
        provider as anchor.AnchorProvider,
        "get_counter",
        program.programId,
        rawCircuit,
        true
      );
    } else if (!offchainSource) {
      await finalizeCompDefWithRetry(provider as anchor.AnchorProvider, offset, program.programId, owner);
    }
    return sig;
  }

  function getCounterAddress(owner: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("counter"), owner.toBuffer()],
      program.programId
    )[0];
  }
});

async function getMXEPublicKeyWithRetry(
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

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString()))
  );
}
