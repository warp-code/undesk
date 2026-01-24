import {
  Connection,
  ConfirmedSignatureInfo,
  ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { loadConfig } from "./config";
import { setLogLevel, logger } from "./log";
import { createSupabaseStorage } from "./storage";
import { createEventHandler } from "./handler";
import { parseEvents } from "./parser";
import type { EventWithContext } from "./types";

interface BackfillOptions {
  limit?: number;
  before?: string;
  batchSize?: number;
}

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--limit":
        options.limit = parseInt(args[++i], 10);
        break;
      case "--before":
        options.before = args[++i];
        break;
      case "--batch-size":
        options.batchSize = parseInt(args[++i], 10);
        break;
    }
  }

  return options;
}

async function fetchSignatures(
  connection: Connection,
  config: ReturnType<typeof loadConfig>,
  options: BackfillOptions
): Promise<ConfirmedSignatureInfo[]> {
  const allSignatures: ConfirmedSignatureInfo[] = [];
  let before = options.before;
  const limit = options.limit ?? 1000;
  const batchSize = Math.min(options.batchSize ?? 1000, 1000); // Max 1000 per request

  logger.info("Fetching signatures", { limit, before });

  while (allSignatures.length < limit) {
    const fetchLimit = Math.min(batchSize, limit - allSignatures.length);

    const signatures = await connection.getSignaturesForAddress(
      config.programId,
      {
        limit: fetchLimit,
        before,
      }
    );

    if (signatures.length === 0) {
      break;
    }

    allSignatures.push(...signatures);
    before = signatures[signatures.length - 1].signature;

    logger.debug("Fetched signature batch", {
      batchSize: signatures.length,
      total: allSignatures.length,
    });
  }

  logger.info("Fetched all signatures", { count: allSignatures.length });

  // Reverse to process in chronological order (oldest first)
  // This ensures DealCreated events are processed before their OfferCreated events
  return allSignatures.reverse();
}

async function processTransactions(
  connection: Connection,
  signatures: ConfirmedSignatureInfo[],
  config: ReturnType<typeof loadConfig>,
  handler: (events: EventWithContext[]) => Promise<void>,
  batchSize: number
): Promise<void> {
  let processed = 0;

  // Process in batches
  for (let i = 0; i < signatures.length; i += batchSize) {
    const batch = signatures.slice(i, i + batchSize);
    const signatureBatch = batch.map((s) => s.signature);

    logger.debug("Fetching transaction batch", {
      batchStart: i,
      batchSize: batch.length,
    });

    const transactions = await connection.getParsedTransactions(
      signatureBatch,
      {
        maxSupportedTransactionVersion: 0,
      }
    );

    for (let j = 0; j < transactions.length; j++) {
      const tx = transactions[j];
      const sigInfo = batch[j];

      if (!tx || tx.meta?.err) {
        continue;
      }

      // Get logs from transaction meta
      const logs = tx.meta?.logMessages ?? [];
      if (logs.length === 0) {
        continue;
      }

      try {
        const events = parseEvents(logs, config.programId);

        if (events.length === 0) {
          continue;
        }

        const eventsWithContext: EventWithContext[] = events.map((e) => ({
          name: e.name,
          data: e.data,
          context: {
            signature: sigInfo.signature,
            slot: sigInfo.slot,
            blockTime: sigInfo.blockTime ?? null,
          },
        }));

        await handler(eventsWithContext);
        processed += eventsWithContext.length;
      } catch (err) {
        logger.error("Failed to process transaction", {
          signature: sigInfo.signature,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("Processed transaction batch", {
      batchEnd: Math.min(i + batchSize, signatures.length),
      total: signatures.length,
      eventsProcessed: processed,
    });
  }

  logger.info("Backfill complete", { eventsProcessed: processed });
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Load configuration
  const config = loadConfig();
  setLogLevel(config.logLevel);

  logger.info("Starting OTC event backfill", {
    rpcUrl: config.rpcUrl,
    programId: config.programId.toBase58(),
    supabaseUrl: config.supabaseUrl,
    options,
  });

  // Create connection
  const connection = new Connection(config.rpcUrl, "confirmed");

  // Create storage and handler
  const storage = createSupabaseStorage({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
  });
  const handler = createEventHandler(storage);

  // Fetch signatures
  const signatures = await fetchSignatures(connection, config, options);

  if (signatures.length === 0) {
    logger.info("No signatures found for program");
    return;
  }

  // Process transactions
  const batchSize = options.batchSize ?? 100;
  await processTransactions(connection, signatures, config, handler, batchSize);
}

main().catch((err) => {
  logger.error("Fatal error", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
