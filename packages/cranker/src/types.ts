import { PublicKey } from "@solana/web3.js";

/**
 * A deal that is ready to be cranked (expired and still open)
 */
export interface CrankableDeal {
  address: string;
}

/**
 * An offer that is ready to be cranked (open but deal is no longer open)
 */
export interface CrankableOffer {
  address: string;
  dealAddress: string;
}

/**
 * Result of a crank operation
 */
export interface CrankResult {
  success: boolean;
  address: string;
  signature?: string;
  error?: string;
}
