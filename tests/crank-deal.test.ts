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
  getOfferAddress,
  RescueCipher,
  deserializeLE,
  x25519,
} from "./harness";

describe("Crank Deal", () => {
  const { program, provider, owner, arciumEnv, clusterAccount } = getTestHarness();

  it("successfully cranks a fully-filled deal", async () => {
    // ==========================================
    // SETUP: Get MXE public key and create mints
    // ==========================================
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider,
      program.programId
    );
    console.log("MXE x25519 pubkey is", mxePublicKey);

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

    // ==========================================
    // STEP 1: Create a deal
    // ==========================================
    console.log("\n--- Creating Deal ---");

    // Generate deal creator's encryption keypair (SAVE FOR CRANK)
    const dealCreatorPrivateKey = x25519.utils.randomSecretKey();
    const dealCreatorPublicKey = x25519.getPublicKey(dealCreatorPrivateKey);
    const dealCreatorSharedSecret = x25519.getSharedSecret(dealCreatorPrivateKey, mxePublicKey);
    const dealCreatorCipher = new RescueCipher(dealCreatorSharedSecret);

    // Encrypt deal parameters: amount (u64), price (u128)
    const dealAmount = BigInt(1000);
    const dealPrice = BigInt(2) << BigInt(64);  // X64.64: 2.0
    const dealPlaintext = [dealAmount, dealPrice];

    const dealNonce = randomBytes(16);
    const dealCiphertext = dealCreatorCipher.encrypt(dealPlaintext, dealNonce);

    const dealCreateKey = Keypair.generate();
    const expiresAt = new anchor.BN(Math.floor(Date.now() / 1000) + 3600);
    const allowPartial = true;

    const dealComputationOffset = new anchor.BN(randomBytes(8), "hex");
    const dealAddress = getDealAddress(program, dealCreateKey.publicKey);

    const dealCreatedEventPromise = awaitEvent(program, "dealCreated");

    await program.methods
      .createDeal(
        dealComputationOffset,
        owner.publicKey,
        Array.from(dealCreatorPublicKey),
        new anchor.BN(deserializeLE(dealNonce).toString()),
        expiresAt,
        allowPartial,
        Array.from(dealCiphertext[0]),
        Array.from(dealCiphertext[1])
      )
      .accountsPartial({
        createKey: dealCreateKey.publicKey,
        deal: dealAddress,
        baseMint,
        quoteMint,
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          dealComputationOffset
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
      .signers([dealCreateKey])
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    await awaitComputationFinalization(
      provider,
      dealComputationOffset,
      program.programId,
      "confirmed"
    );

    await dealCreatedEventPromise;
    console.log("Deal created at:", dealAddress.toBase58());

    // ==========================================
    // STEP 2: Submit an offer that FULLY fills the deal
    // ==========================================
    console.log("\n--- Submitting Filling Offer ---");

    const offerorPrivateKey = x25519.utils.randomSecretKey();
    const offerorPublicKey = x25519.getPublicKey(offerorPrivateKey);
    const offerorSharedSecret = x25519.getSharedSecret(offerorPrivateKey, mxePublicKey);
    const offerorCipher = new RescueCipher(offerorSharedSecret);

    // Offer at same price, same amount to FULLY fill the deal
    const offerPrice = BigInt(2) << BigInt(64);  // Same price: 2.0
    const offerAmount = BigInt(1000);            // Full amount
    const offerPlaintext = [offerPrice, offerAmount];

    const offerNonce = randomBytes(16);
    const offerCiphertext = offerorCipher.encrypt(offerPlaintext, offerNonce);

    const offerCreateKey = Keypair.generate();
    const offerComputationOffset = new anchor.BN(randomBytes(8), "hex");
    const offerAddress = getOfferAddress(program, dealAddress, offerCreateKey.publicKey);

    const offerCreatedEventPromise = awaitEvent(program, "offerCreated");

    await program.methods
      .submitOffer(
        offerComputationOffset,
        owner.publicKey,
        Array.from(offerorPublicKey),
        new anchor.BN(deserializeLE(offerNonce).toString()),
        Array.from(offerCiphertext[0]),
        Array.from(offerCiphertext[1])
      )
      .accountsPartial({
        createKey: offerCreateKey.publicKey,
        deal: dealAddress,
        offer: offerAddress,
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          offerComputationOffset
        ),
        clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("submit_offer")).readUInt32LE()
        ),
      })
      .signers([offerCreateKey])
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    await awaitComputationFinalization(
      provider,
      offerComputationOffset,
      program.programId,
      "confirmed"
    );

    await offerCreatedEventPromise;
    console.log("Offer submitted at:", offerAddress.toBase58());

    // ==========================================
    // STEP 3: Crank the deal
    // ==========================================
    console.log("\n--- Cranking Deal ---");

    const crankComputationOffset = new anchor.BN(randomBytes(8), "hex");
    const crankNonce = randomBytes(16);

    const dealSettledEventPromise = awaitEvent(program, "dealSettled");

    await program.methods
      .crankDeal(
        crankComputationOffset,
        Array.from(dealCreatorPublicKey),  // Creator's encryption pubkey
        new anchor.BN(deserializeLE(crankNonce).toString())  // Nonce for output encryption
      )
      .accountsPartial({
        payer: owner.publicKey,
        deal: dealAddress,
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          crankComputationOffset
        ),
        clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(getCompDefAccOffset("crank_deal")).readUInt32LE()
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    console.log("Crank deal queued");

    await awaitComputationFinalization(
      provider,
      crankComputationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Crank deal finalized");

    // ==========================================
    // STEP 4: Verify DealSettled event
    // ==========================================
    const dealSettledEvent = await dealSettledEventPromise;
    console.log("DealSettled event received");

    expect(dealSettledEvent.deal.toBase58()).to.equal(dealAddress.toBase58());
    expect(dealSettledEvent.status).to.equal(1);  // EXECUTED
    expect(dealSettledEvent.settledAt.toNumber()).to.be.greaterThan(0);

    // Decrypt the settlement blob using creator's private key
    const decrypted = dealCreatorCipher.decrypt(
      dealSettledEvent.ciphertexts,
      Uint8Array.from(dealSettledEvent.nonce)
    );

    // DealSettledBlob: [total_filled: u64, creator_receives: u64, creator_refund: u64]
    const totalFilled = decrypted[0];
    const creatorReceives = decrypted[1];
    const creatorRefund = decrypted[2];

    console.log("Decrypted settlement blob:");
    console.log("  - total_filled:", totalFilled.toString());
    console.log("  - creator_receives:", creatorReceives.toString());
    console.log("  - creator_refund:", creatorRefund.toString());

    expect(totalFilled).to.equal(BigInt(1000));  // Full amount filled
    // creator_receives = (1000 * (2 << 64)) >> 64 = 2000
    expect(creatorReceives).to.equal(BigInt(2000));
    expect(creatorRefund).to.equal(BigInt(0));  // No refund

    // ==========================================
    // STEP 5: Verify DealAccount state
    // ==========================================
    const dealAccount = await program.account.dealAccount.fetch(dealAddress);
    expect(dealAccount.status).to.equal(1);  // EXECUTED
    console.log("Deal status verified: EXECUTED (1)");
  });
});
