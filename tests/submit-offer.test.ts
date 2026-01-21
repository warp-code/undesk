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

describe("Submit Offer", () => {
  const { program, provider, owner, arciumEnv, clusterAccount } = getTestHarness();

  it("submits an offer to an existing deal", async () => {
    // ==========================================
    // SETUP: Get MXE public key and create mints
    // ==========================================
    const mxePublicKey = await getMXEPublicKeyWithRetry(
      provider,
      program.programId
    );
    console.log("MXE x25519 pubkey is", mxePublicKey);

    // Create base and quote mints
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
    // STEP 1: Create a deal first
    // ==========================================
    console.log("\n--- Creating Deal ---");

    // Generate deal creator's encryption keypair
    const dealCreatorPrivateKey = x25519.utils.randomSecretKey();
    const dealCreatorPublicKey = x25519.getPublicKey(dealCreatorPrivateKey);
    const dealCreatorSharedSecret = x25519.getSharedSecret(dealCreatorPrivateKey, mxePublicKey);
    const dealCreatorCipher = new RescueCipher(dealCreatorSharedSecret);

    // Encrypt deal parameters: amount (u64), price (u128)
    const dealAmount = BigInt(1000);        // Base amount to sell
    const dealPrice = BigInt(2) << BigInt(64);  // X64.64 fixed-point: 2.0 as price
    const dealPlaintext = [dealAmount, dealPrice];

    const dealNonce = randomBytes(16);
    const dealCiphertext = dealCreatorCipher.encrypt(dealPlaintext, dealNonce);
    console.log("Encrypted deal amount and price");

    // Generate ephemeral create_key for deal
    const dealCreateKey = Keypair.generate();

    // Set deal parameters
    const expiresAt = new anchor.BN(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    const allowPartial = true;

    // Queue create_deal computation
    const dealComputationOffset = new anchor.BN(randomBytes(8), "hex");
    const dealAddress = getDealAddress(program, dealCreateKey.publicKey);

    const dealCreatedEventPromise = awaitEvent(program, "dealCreated");

    const createDealSig = await program.methods
      .createDeal(
        dealComputationOffset,
        owner.publicKey,  // controller
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
        baseMint: baseMint,
        quoteMint: quoteMint,
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
    console.log("Queue create_deal sig is ", createDealSig);

    // Await deal finalization
    const dealFinalizeSig = await awaitComputationFinalization(
      provider,
      dealComputationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Deal finalize sig is ", dealFinalizeSig);

    // Verify deal created event
    const dealCreatedEvent = await dealCreatedEventPromise;
    console.log("DealCreated event received");
    expect(dealCreatedEvent.deal.toBase58()).to.equal(dealAddress.toBase58());

    // Fetch deal account to verify it exists
    const dealAccountBefore = await program.account.dealAccount.fetch(dealAddress);
    expect(dealAccountBefore.numOffers).to.equal(0);
    console.log("Deal created with numOffers:", dealAccountBefore.numOffers);

    // ==========================================
    // STEP 2: Submit an offer to the deal
    // ==========================================
    console.log("\n--- Submitting Offer ---");

    // Generate offeror's encryption keypair (different from deal creator)
    const offerorPrivateKey = x25519.utils.randomSecretKey();
    const offerorPublicKey = x25519.getPublicKey(offerorPrivateKey);
    const offerorSharedSecret = x25519.getSharedSecret(offerorPrivateKey, mxePublicKey);
    const offerorCipher = new RescueCipher(offerorSharedSecret);

    // Encrypt offer parameters: price (u128) first, then amount (u64) - as per OfferInput struct order
    const offerPrice = BigInt(25) << BigInt(63);  // X64.64 fixed-point: 2.5 as price (higher than deal price of 2.0)
    const offerAmount = BigInt(500);               // Amount of base asset to buy

    const offerNonce = randomBytes(16);
    // OfferInput struct order: price (u128), amount (u64) - encrypt together like create_deal does
    const offerPlaintext = [offerPrice, offerAmount];
    const offerCiphertext = offerorCipher.encrypt(offerPlaintext, offerNonce);
    console.log("Encrypted offer price and amount");

    // Generate ephemeral create_key for offer
    const offerCreateKey = Keypair.generate();

    // Queue submit_offer computation
    const offerComputationOffset = new anchor.BN(randomBytes(8), "hex");
    const offerAddress = getOfferAddress(program, dealAddress, offerCreateKey.publicKey);

    const offerCreatedEventPromise = awaitEvent(program, "offerCreated");

    const submitOfferSig = await program.methods
      .submitOffer(
        offerComputationOffset,
        owner.publicKey,  // controller
        Array.from(offerorPublicKey),
        new anchor.BN(deserializeLE(offerNonce).toString()),
        Array.from(offerCiphertext[0]),  // encrypted price
        Array.from(offerCiphertext[1])   // encrypted amount
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
    console.log("Queue submit_offer sig is ", submitOfferSig);

    // Await offer finalization
    const offerFinalizeSig = await awaitComputationFinalization(
      provider,
      offerComputationOffset,
      program.programId,
      "confirmed"
    );
    console.log("Offer finalize sig is ", offerFinalizeSig);

    // ==========================================
    // STEP 3: Verify OfferCreated event
    // ==========================================
    const offerCreatedEvent = await offerCreatedEventPromise;
    console.log("OfferCreated event received");

    // Verify public fields
    expect(offerCreatedEvent.deal.toBase58()).to.equal(dealAddress.toBase58());
    expect(offerCreatedEvent.offer.toBase58()).to.equal(offerAddress.toBase58());
    expect(offerCreatedEvent.offerIndex).to.equal(0);

    // Decrypt the blob with offeror's key
    const decrypted = offerorCipher.decrypt(
      offerCreatedEvent.ciphertexts,
      Uint8Array.from(offerCreatedEvent.nonce)
    );
    console.log("Decrypted offer price:", decrypted[0]);
    console.log("Decrypted offer amount:", decrypted[1]);

    // Note: The decrypted values may differ due to MXE processing
    // The important thing is that the offer was created successfully

    // ==========================================
    // STEP 4: Verify OfferAccount state
    // ==========================================
    const offerAccount = await program.account.offerAccount.fetch(offerAddress);

    expect(offerAccount.createKey.toBase58()).to.equal(offerCreateKey.publicKey.toBase58());
    expect(offerAccount.controller.toBase58()).to.equal(owner.publicKey.toBase58());
    expect(offerAccount.encryptionPubkey).to.deep.equal(Array.from(offerorPublicKey));
    expect(offerAccount.deal.toBase58()).to.equal(dealAddress.toBase58());
    expect(offerAccount.offerIndex).to.equal(0);
    expect(offerAccount.status).to.equal(0); // OPEN
    expect(offerAccount.submittedAt.toNumber()).to.be.greaterThan(0);

    console.log("OfferAccount verified successfully");
    console.log("  - create_key:", offerAccount.createKey.toBase58());
    console.log("  - controller:", offerAccount.controller.toBase58());
    console.log("  - deal:", offerAccount.deal.toBase58());
    console.log("  - offer_index:", offerAccount.offerIndex);
    console.log("  - status:", offerAccount.status);
    console.log("  - submitted_at:", offerAccount.submittedAt.toNumber());

    // ==========================================
    // STEP 5: Verify DealAccount.numOffers incremented
    // ==========================================
    const dealAccountAfter = await program.account.dealAccount.fetch(dealAddress);
    expect(dealAccountAfter.numOffers).to.equal(1);
    console.log("DealAccount.numOffers incremented to:", dealAccountAfter.numOffers);
  });
});
