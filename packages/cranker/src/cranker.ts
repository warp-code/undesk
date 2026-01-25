import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { getArciumEnv } from "@arcium-hq/client";
import { createServiceClient, TypedSupabaseClient } from "@otc/supabase";
import { Otc } from "../../../target/types/otc";
import { Config } from "./config";
import { logger } from "./log";
import { getExpiredOpenDeals, getOpenOffersForSettledDeals } from "./queries";
import { executeCrankDeal, executeCrankOffer } from "./execute";
import * as fs from "fs";

// IDL import
import idl from "../../../target/idl/otc.json";

/**
 * Read keypair from JSON file
 */
function readKeypair(path: string): Keypair {
  const file = fs.readFileSync(path);
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(file.toString())));
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CrankerState {
  running: boolean;
}

/**
 * Run one iteration of the crank loop
 */
async function runCrankIteration(
  provider: anchor.AnchorProvider,
  program: Program<Otc>,
  payer: Keypair,
  supabase: TypedSupabaseClient,
  clusterOffset: number,
  batchSize: number
): Promise<{ dealsCranked: number; offersCranked: number }> {
  let dealsCranked = 0;
  let offersCranked = 0;

  // 1. Crank expired deals first (order matters - offers depend on deal status)
  try {
    const deals = await getExpiredOpenDeals(supabase, batchSize);

    if (deals.length > 0) {
      logger.info("Found expired deals to crank", { count: deals.length });
    }

    for (const deal of deals) {
      const result = await executeCrankDeal(
        provider,
        program,
        payer,
        deal.address,
        clusterOffset
      );

      if (result.success) {
        dealsCranked++;
      }
    }
  } catch (error) {
    logger.error("Error in deal crank phase", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 2. Crank offers for settled deals
  try {
    const offers = await getOpenOffersForSettledDeals(supabase, batchSize);

    if (offers.length > 0) {
      logger.info("Found offers to crank", { count: offers.length });
    }

    for (const offer of offers) {
      const result = await executeCrankOffer(
        provider,
        program,
        payer,
        offer.address,
        offer.dealAddress,
        clusterOffset
      );

      if (result.success) {
        offersCranked++;
      }
    }
  } catch (error) {
    logger.error("Error in offer crank phase", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { dealsCranked, offersCranked };
}

/**
 * Start the cranker service
 */
export async function startCranker(config: Config): Promise<CrankerState> {
  const state: CrankerState = { running: true };

  // Set up connection and provider
  const connection = new Connection(config.rpcUrl, "confirmed");
  const payer = readKeypair(config.payerKeyPath);

  const wallet = new anchor.Wallet(payer);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    skipPreflight: true,
  });

  // Create program instance
  const program = new Program<Otc>(idl as Otc, provider);

  // Get cluster offset from Arcium env
  const arciumEnv = getArciumEnv();
  const clusterOffset = arciumEnv.arciumClusterOffset;

  // Create Supabase client
  const supabase = createServiceClient({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
  });

  logger.info("Cranker started", {
    rpcUrl: config.rpcUrl,
    programId: config.programId.toBase58(),
    payer: payer.publicKey.toBase58(),
    clusterOffset,
    intervalMs: config.crankIntervalMs,
    batchSize: config.crankBatchSize,
  });

  // Main loop
  const loop = async () => {
    while (state.running) {
      try {
        const { dealsCranked, offersCranked } = await runCrankIteration(
          provider,
          program,
          payer,
          supabase,
          clusterOffset,
          config.crankBatchSize
        );

        if (dealsCranked > 0 || offersCranked > 0) {
          logger.info("Crank iteration complete", {
            dealsCranked,
            offersCranked,
          });
        } else {
          logger.debug("Crank iteration complete, nothing to crank");
        }
      } catch (error) {
        logger.error("Unexpected error in crank loop", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await sleep(config.crankIntervalMs);
    }

    logger.info("Cranker stopped");
  };

  // Start loop in background
  loop();

  return state;
}

/**
 * Stop the cranker service
 */
export function stopCranker(state: CrankerState): void {
  state.running = false;
}
