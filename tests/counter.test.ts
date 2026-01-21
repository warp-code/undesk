import * as anchor from "@coral-xyz/anchor";
import { randomBytes } from "crypto";
import { expect } from "chai";
import {
  getTestHarness,
  getMXEPublicKeyWithRetry,
  awaitEvents,
  awaitComputationFinalization,
  getCompDefAccOffset,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getCounterAddress,
  RescueCipher,
  deserializeLE,
  x25519,
} from "./harness";

describe("Counter", () => {
  const { program, provider, owner, arciumEnv, clusterAccount } = getTestHarness();

  it("initializes, increments, and reads a counter", async () => {
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider,
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

    const counterAddr = getCounterAddress(program, owner.publicKey);

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
      provider,
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
      provider,
      incrementComputationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize increment sig is ", finalizeIncrementSig);

    // Step 3: Read the counter using get_counter (re-encrypts for both users)
    const getComputationOffset = new anchor.BN(randomBytes(8), "hex");
    const recipientNonce = randomBytes(16);

    // Await TWO events since get_counter now returns two encrypted outputs
    const counterValueEventsPromise = awaitEvents(program, "counterValueEvent", 2);

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
      provider,
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
});
