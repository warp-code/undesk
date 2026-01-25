import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Keypair } from "@solana/web3.js";
import { awaitComputationFinalization } from "@arcium-hq/client";
import { Otc } from "../../../target/types/otc";
import { CrankResult } from "./types";
import { logger } from "./log";
import {
  buildCrankDealAccounts,
  buildCrankOfferAccounts,
  generateComputationOffset,
  generateNonce,
} from "./transactions";

/**
 * Execute crank_deal instruction for an expired deal
 */
export async function executeCrankDeal(
  provider: anchor.AnchorProvider,
  program: Program<Otc>,
  payer: Keypair,
  dealAddress: string,
  clusterOffset: number
): Promise<CrankResult> {
  const deal = new PublicKey(dealAddress);
  const computationOffset = generateComputationOffset();
  const nonce = generateNonce();

  logger.debug("Executing crank_deal", {
    deal: dealAddress,
    computationOffset: computationOffset.toString(),
  });

  try {
    const accounts = buildCrankDealAccounts(
      program.programId,
      payer.publicKey,
      deal,
      computationOffset,
      clusterOffset
    );

    const signature = await program.methods
      .crankDeal(computationOffset, nonce)
      .accountsPartial(accounts)
      .signers([payer])
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    logger.debug("Crank deal queued", { deal: dealAddress, signature });

    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );

    logger.info("Crank deal finalized", { deal: dealAddress, signature });

    return {
      success: true,
      address: dealAddress,
      signature,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn("Failed to crank deal", {
      deal: dealAddress,
      error: errorMessage,
    });

    return {
      success: false,
      address: dealAddress,
      error: errorMessage,
    };
  }
}

/**
 * Execute crank_offer instruction for an offer on a settled deal
 */
export async function executeCrankOffer(
  provider: anchor.AnchorProvider,
  program: Program<Otc>,
  payer: Keypair,
  offerAddress: string,
  dealAddress: string,
  clusterOffset: number
): Promise<CrankResult> {
  const offer = new PublicKey(offerAddress);
  const deal = new PublicKey(dealAddress);
  const computationOffset = generateComputationOffset();
  const nonce = generateNonce();

  logger.debug("Executing crank_offer", {
    offer: offerAddress,
    deal: dealAddress,
    computationOffset: computationOffset.toString(),
  });

  try {
    const accounts = buildCrankOfferAccounts(
      program.programId,
      payer.publicKey,
      deal,
      offer,
      computationOffset,
      clusterOffset
    );

    const signature = await program.methods
      .crankOffer(computationOffset, nonce)
      .accountsPartial(accounts)
      .signers([payer])
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    logger.debug("Crank offer queued", { offer: offerAddress, signature });

    await awaitComputationFinalization(
      provider,
      computationOffset,
      program.programId,
      "confirmed"
    );

    logger.info("Crank offer finalized", { offer: offerAddress, signature });

    return {
      success: true,
      address: offerAddress,
      signature,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn("Failed to crank offer", {
      offer: offerAddress,
      error: errorMessage,
    });

    return {
      success: false,
      address: offerAddress,
      error: errorMessage,
    };
  }
}
