import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
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
  getDealAddress,
  RescueCipher,
  deserializeLE,
  x25519,
} from "./harness";

describe("Create Deal", () => {
  const { program, provider, owner, arciumEnv, clusterAccount } = getTestHarness();

  it("creates a deal with encrypted parameters", async () => {
    // 1. Get MXE public key
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider,
      program.programId
    );
    console.log("MXE x25519 pubkey is", mxePublicKey);

    // 2. Generate encryption keypair
    const privateKey = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(privateKey);

    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    // 3. Create base and quote mints
    const baseMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6
    );
    console.log("Base mint created:", baseMint.toBase58());

    const quoteMint = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      null,
      6
    );
    console.log("Quote mint created:", quoteMint.toBase58());

    // 4. Encrypt amount (u64) and price (u128)
    const amount = BigInt(1000);        // Base amount to sell
    const price = BigInt(2) << BigInt(64);  // X64.64 fixed-point: 2.0 as price
    const plaintext = [amount, price];

    const nonce = randomBytes(16);
    const ciphertext = cipher.encrypt(plaintext, nonce);
    console.log("Encrypted amount and price");

    // 5. Generate ephemeral create_key
    const createKey = Keypair.generate();

    // 6. Set deal parameters
    const expiresAt = new anchor.BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    const allowPartial = true;

    // 7. Queue create_deal computation
    const computationOffset = new anchor.BN(randomBytes(8), "hex");
    const dealAddress = getDealAddress(program, createKey.publicKey);

    const dealCreatedEventPromise = awaitEvent(program, "dealCreated");

    const queueSig = await program.methods
      .createDeal(
        computationOffset,
        owner.publicKey,  // controller
        Array.from(publicKey),
        new anchor.BN(deserializeLE(nonce).toString()),
        expiresAt,
        allowPartial,
        Array.from(ciphertext[0]),
        Array.from(ciphertext[1])
      )
      .accountsPartial({
        createKey: createKey.publicKey,
        deal: dealAddress,
        baseMint: baseMint,
        quoteMint: quoteMint,
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          computationOffset
        ),
        clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("create_deal")).readUInt32LE()
        ),
      })
      .signers([createKey])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    console.log("Queue create_deal sig is ", queueSig);

    // 8. Await finalization
    const finalizeSig = await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Finalize sig is ", finalizeSig);

    // 9. Verify DealCreated event
    const dealCreatedEvent = await dealCreatedEventPromise;
    console.log("DealCreated event received");

    // Verify public fields
    expect(dealCreatedEvent.deal.toBase58()).to.equal(dealAddress.toBase58());
    expect(dealCreatedEvent.baseMint.toBase58()).to.equal(baseMint.toBase58());
    expect(dealCreatedEvent.quoteMint.toBase58()).to.equal(quoteMint.toBase58());
    expect(dealCreatedEvent.expiresAt.toNumber()).to.equal(expiresAt.toNumber());
    expect(dealCreatedEvent.allowPartial).to.equal(allowPartial);

    // Decrypt the blob
    const decrypted = cipher.decrypt(
      dealCreatedEvent.ciphertexts,
      Uint8Array.from(dealCreatedEvent.nonce)
    );
    console.log("Decrypted amount:", decrypted[0]);
    console.log("Decrypted price:", decrypted[1]);

    expect(decrypted[0]).to.equal(amount);
    expect(decrypted[1]).to.equal(price);

    // 10. Fetch and verify DealAccount state
    const dealAccount = await program.account.dealAccount.fetch(dealAddress);

    expect(dealAccount.createKey.toBase58()).to.equal(createKey.publicKey.toBase58());
    expect(dealAccount.controller.toBase58()).to.equal(owner.publicKey.toBase58());
    expect(dealAccount.encryptionPubkey).to.deep.equal(Array.from(publicKey));
    expect(dealAccount.baseMint.toBase58()).to.equal(baseMint.toBase58());
    expect(dealAccount.quoteMint.toBase58()).to.equal(quoteMint.toBase58());
    expect(dealAccount.expiresAt.toNumber()).to.equal(expiresAt.toNumber());
    expect(dealAccount.status).to.equal(0); // OPEN
    expect(dealAccount.allowPartial).to.equal(allowPartial);
    expect(dealAccount.createdAt.toNumber()).to.be.greaterThan(0);
    expect(dealAccount.numOffers).to.equal(0);

    console.log("DealAccount verified successfully");
    console.log("  - create_key:", dealAccount.createKey.toBase58());
    console.log("  - controller:", dealAccount.controller.toBase58());
    console.log("  - base_mint:", dealAccount.baseMint.toBase58());
    console.log("  - quote_mint:", dealAccount.quoteMint.toBase58());
    console.log("  - created_at:", dealAccount.createdAt.toNumber());
    console.log("  - expires_at:", dealAccount.expiresAt.toNumber());
    console.log("  - status:", dealAccount.status);
  });
});
