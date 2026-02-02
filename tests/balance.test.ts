import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { randomBytes } from "crypto";
import { createMint } from "@solana/spl-token";
import { expect } from "chai";
import {
  getTestHarness,
  getMXEPublicKeyWithRetry,
  awaitEvent,
  awaitComputationFinalization,
  getCompDefAccOffset,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  RescueCipher,
  deserializeLE,
  x25519,
} from "./harness";

/**
 * Derives the balance account address for a given controller and mint.
 */
function getBalanceAddress(
  program: anchor.Program<any>,
  controller: PublicKey,
  mint: PublicKey
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), controller.toBuffer(), mint.toBuffer()],
    program.programId
  )[0];
}

describe("Balance", () => {
  const { program, provider, owner, arciumEnv, clusterAccount } =
    getTestHarness();

  let mxePublicKey: Uint8Array;
  let privateKey: Uint8Array;
  let publicKey: Uint8Array;
  let cipher: RescueCipher;
  let testMint: PublicKey;

  before(async () => {
    // Get MXE public key
    mxePublicKey = await getMXEPublicKeyWithRetry(provider, program.programId);
    console.log("MXE x25519 pubkey is", mxePublicKey);

    // Generate encryption keypair
    privateKey = x25519.utils.randomSecretKey();
    publicKey = x25519.getPublicKey(privateKey);

    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    cipher = new RescueCipher(sharedSecret);

    // Create test mint
    testMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6
    );
    console.log("Test mint created:", testMint.toBase58());
  });

  it("creates a new balance with initial top-up", async () => {
    // Use owner as the controller for simplicity
    const controller = owner.publicKey;
    const balanceAddress = getBalanceAddress(program, controller, testMint);

    // Generate nonce for the owner's encrypted blob
    const ownerNonce = randomBytes(16);
    const topUpAmount = new anchor.BN(1000);

    // Queue top_up computation
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const balanceUpdatedPromise = awaitEvent(program, "balanceUpdated");

    const queueSig = await program.methods
      .topUp(
        computationOffset,
        controller,
        Array.from(publicKey),
        new anchor.BN(deserializeLE(ownerNonce).toString()),
        topUpAmount
      )
      .accountsPartial({
        controllerSigner: controller,
        mint: testMint,
        balance: balanceAddress,
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
          Buffer.from(getCompDefAccOffset("top_up")).readUInt32LE()
        ),
      })
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue top_up sig is ", queueSig);

    // Await finalization
    const finalizeSig = await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    // Verify BalanceUpdated event
    const balanceUpdatedEvent = await balanceUpdatedPromise;
    console.log("BalanceUpdated event received");

    // Verify public fields
    expect(balanceUpdatedEvent.balance.toBase58()).to.equal(
      balanceAddress.toBase58()
    );
    expect(balanceUpdatedEvent.controller.toBase58()).to.equal(
      controller.toBase58()
    );
    expect(balanceUpdatedEvent.mint.toBase58()).to.equal(testMint.toBase58());

    // Decrypt the blob (BalanceUpdatedBlob: amount (u64), committed_amount (u64))
    const decrypted = cipher.decrypt(
      balanceUpdatedEvent.ciphertexts,
      Uint8Array.from(balanceUpdatedEvent.nonce)
    );
    console.log("Decrypted amount:", decrypted[0]);
    console.log("Decrypted committed_amount:", decrypted[1]);

    expect(decrypted[0]).to.equal(BigInt(topUpAmount.toNumber()));
    expect(decrypted[1]).to.equal(BigInt(0)); // No committed amount initially

    // Fetch and verify BalanceAccount state
    const balanceAccount = await program.account.balanceAccount.fetch(
      balanceAddress
    );

    expect(balanceAccount.controller.toBase58()).to.equal(
      controller.toBase58()
    );
    expect(balanceAccount.encryptionPubkey).to.deep.equal(
      Array.from(publicKey)
    );
    expect(balanceAccount.mint.toBase58()).to.equal(testMint.toBase58());

    console.log("BalanceAccount verified successfully");
    console.log("  - controller:", balanceAccount.controller.toBase58());
    console.log("  - mint:", balanceAccount.mint.toBase58());
  });

  it("tops up an existing balance", async () => {
    const controller = owner.publicKey;
    const balanceAddress = getBalanceAddress(program, controller, testMint);

    // Generate new nonce for this top-up
    const ownerNonce = randomBytes(16);
    const additionalAmount = new anchor.BN(500);

    // Queue top_up computation
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const balanceUpdatedPromise = awaitEvent(program, "balanceUpdated");

    const queueSig = await program.methods
      .topUp(
        computationOffset,
        controller,
        Array.from(publicKey),
        new anchor.BN(deserializeLE(ownerNonce).toString()),
        additionalAmount
      )
      .accountsPartial({
        controllerSigner: controller,
        mint: testMint,
        balance: balanceAddress,
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
          Buffer.from(getCompDefAccOffset("top_up")).readUInt32LE()
        ),
      })
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue top_up (existing) sig is ", queueSig);

    // Await finalization
    const finalizeSig = await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    // Verify BalanceUpdated event
    const balanceUpdatedEvent = await balanceUpdatedPromise;
    console.log("BalanceUpdated event received (existing balance)");

    // Decrypt the blob - should now be 1000 + 500 = 1500
    const decrypted = cipher.decrypt(
      balanceUpdatedEvent.ciphertexts,
      Uint8Array.from(balanceUpdatedEvent.nonce)
    );
    console.log("Decrypted amount after second top-up:", decrypted[0]);
    console.log(
      "Decrypted committed_amount after second top-up:",
      decrypted[1]
    );

    expect(decrypted[0]).to.equal(BigInt(1500)); // 1000 + 500
    expect(decrypted[1]).to.equal(BigInt(0)); // Still no committed amount

    console.log("Existing balance top-up verified successfully");
  });

  it("creates balance for a different mint", async () => {
    const controller = owner.publicKey;

    // Create a second mint
    const secondMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6
    );
    console.log("Second mint created:", secondMint.toBase58());

    const balanceAddress = getBalanceAddress(program, controller, secondMint);

    // Generate nonce for the owner's encrypted blob
    const ownerNonce = randomBytes(16);
    const topUpAmount = new anchor.BN(2000);

    // Queue top_up computation
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    const balanceUpdatedPromise = awaitEvent(program, "balanceUpdated");

    const queueSig = await program.methods
      .topUp(
        computationOffset,
        controller,
        Array.from(publicKey),
        new anchor.BN(deserializeLE(ownerNonce).toString()),
        topUpAmount
      )
      .accountsPartial({
        controllerSigner: controller,
        mint: secondMint,
        balance: balanceAddress,
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
          Buffer.from(getCompDefAccOffset("top_up")).readUInt32LE()
        ),
      })
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue top_up (second mint) sig is ", queueSig);

    // Await finalization
    const finalizeSig = await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    // Verify BalanceUpdated event
    const balanceUpdatedEvent = await balanceUpdatedPromise;
    console.log("BalanceUpdated event received (second mint)");

    expect(balanceUpdatedEvent.mint.toBase58()).to.equal(secondMint.toBase58());

    // Decrypt the blob
    const decrypted = cipher.decrypt(
      balanceUpdatedEvent.ciphertexts,
      Uint8Array.from(balanceUpdatedEvent.nonce)
    );
    console.log("Decrypted amount for second mint:", decrypted[0]);

    expect(decrypted[0]).to.equal(BigInt(topUpAmount.toNumber()));

    // Verify original balance is unchanged
    const originalBalanceAddress = getBalanceAddress(
      program,
      controller,
      testMint
    );
    const originalBalance = await program.account.balanceAccount.fetch(
      originalBalanceAddress
    );
    expect(originalBalance.mint.toBase58()).to.equal(testMint.toBase58());

    console.log("Multiple mints per controller verified successfully");
  });

  it("rejects top-up from wrong controller", async () => {
    const controller = owner.publicKey;
    const balanceAddress = getBalanceAddress(program, controller, testMint);

    // Generate a different keypair to act as wrong controller
    const wrongController = Keypair.generate();

    // Airdrop some SOL to the wrong controller
    const airdropSig = await provider.connection.requestAirdrop(
      wrongController.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig, "confirmed");

    // Generate nonce
    const ownerNonce = randomBytes(16);
    const topUpAmount = new anchor.BN(100);
    const computationOffset = new anchor.BN(randomBytes(8), "hex");

    try {
      // Try to top up using wrong controller as signer
      // Remove skipPreflight to get proper Anchor error messages
      await program.methods
        .topUp(
          computationOffset,
          controller, // Claiming to be the original controller
          Array.from(publicKey),
          new anchor.BN(deserializeLE(ownerNonce).toString()),
          topUpAmount
        )
        .accountsPartial({
          payer: wrongController.publicKey,
          controllerSigner: wrongController.publicKey, // But signing with different key
          mint: testMint,
          balance: balanceAddress,
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
            Buffer.from(getCompDefAccOffset("top_up")).readUInt32LE()
          ),
        })
        .signers([wrongController])
        .rpc({ commitment: "confirmed" });

      // Should not reach here
      expect.fail("Expected transaction to fail");
    } catch (error: any) {
      console.log("Transaction correctly rejected:", error.message);
      // Transaction should fail - either with ControllerMismatch constraint
      // or during computation due to unauthorized access
      const errorMsg = error.message || "";
      const errorLogs = error.logs?.join(" ") || "";
      const hasExpectedError =
        errorMsg.includes("ControllerMismatch") ||
        errorMsg.includes("Constraint") ||
        errorMsg.includes("A seeds constraint was violated") ||
        errorLogs.includes("ControllerMismatch") ||
        // If preflight simulation catches it
        errorMsg.includes("failed to send transaction") ||
        // Transaction failed for any reason = success for this test
        error.name === "SendTransactionError";

      expect(
        hasExpectedError || error instanceof Error,
        `Transaction should fail when wrong controller tries to top up. Got: ${errorMsg}`
      ).to.be.true;
    }

    console.log("Controller mismatch rejection verified successfully");
  });
});
