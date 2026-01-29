import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { randomBytes } from "crypto";
import {
  getArciumEnv,
  getCompDefAccOffset,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  deserializeLE,
} from "@arcium-hq/client";
import { Otc } from "../../../target/types/otc";

/**
 * Build accounts for crank_deal instruction
 */
export function buildCrankDealAccounts(
  programId: PublicKey,
  payer: PublicKey,
  deal: PublicKey,
  dealController: PublicKey,
  baseMint: PublicKey,
  computationOffset: anchor.BN,
  clusterOffset: number
): Record<string, PublicKey> {
  // Derive creator's BASE token balance PDA
  const [creatorBalance] = PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), dealController.toBuffer(), baseMint.toBuffer()],
    programId
  );

  return {
    payer,
    deal,
    creatorBalance,
    computationAccount: getComputationAccAddress(
      clusterOffset,
      computationOffset
    ),
    clusterAccount: getClusterAccAddress(clusterOffset),
    mxeAccount: getMXEAccAddress(programId),
    mempoolAccount: getMempoolAccAddress(clusterOffset),
    executingPool: getExecutingPoolAccAddress(clusterOffset),
    compDefAccount: getCompDefAccAddress(
      programId,
      Buffer.from(getCompDefAccOffset("crank_deal")).readUInt32LE()
    ),
  };
}

/**
 * Build accounts for crank_offer instruction
 */
export function buildCrankOfferAccounts(
  programId: PublicKey,
  payer: PublicKey,
  deal: PublicKey,
  offer: PublicKey,
  offerController: PublicKey,
  quoteMint: PublicKey,
  computationOffset: anchor.BN,
  clusterOffset: number
): Record<string, PublicKey> {
  // Derive offeror's QUOTE token balance PDA
  const [offerorBalance] = PublicKey.findProgramAddressSync(
    [Buffer.from("balance"), offerController.toBuffer(), quoteMint.toBuffer()],
    programId
  );

  return {
    payer,
    deal,
    offer,
    offerorBalance,
    computationAccount: getComputationAccAddress(
      clusterOffset,
      computationOffset
    ),
    clusterAccount: getClusterAccAddress(clusterOffset),
    mxeAccount: getMXEAccAddress(programId),
    mempoolAccount: getMempoolAccAddress(clusterOffset),
    executingPool: getExecutingPoolAccAddress(clusterOffset),
    compDefAccount: getCompDefAccAddress(
      programId,
      Buffer.from(getCompDefAccOffset("crank_offer")).readUInt32LE()
    ),
  };
}

/**
 * Generate a random computation offset (8 bytes)
 */
export function generateComputationOffset(): anchor.BN {
  return new anchor.BN(randomBytes(8), "hex");
}

/**
 * Generate a random nonce for output encryption (16 bytes)
 */
export function generateNonce(): anchor.BN {
  const nonceBytes = randomBytes(16);
  return new anchor.BN(deserializeLE(nonceBytes).toString());
}
