import { Connection } from "@solana/web3.js";
import { loadConfig } from "./config";
import { setLogLevel, logger } from "./log";
import { createRpcAdapter } from "./adapters";
import { createSupabaseStorage } from "./storage";
import { createEventHandler } from "./handler";

async function main(): Promise<void> {
  // Load configuration
  const config = loadConfig();
  setLogLevel(config.logLevel);

  logger.info("Starting OTC event indexer", {
    rpcUrl: config.rpcUrl,
    programId: config.programId.toBase58(),
    supabaseUrl: config.supabaseUrl,
  });

  // Create connection
  const connection = new Connection(config.rpcUrl, "confirmed");

  // Create storage and handler
  const storage = createSupabaseStorage({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseServiceRoleKey,
  });
  const handler = createEventHandler(storage);

  // Create and start adapter
  const adapter = createRpcAdapter(connection, config.programId);

  // Handle graceful shutdown
  let isShuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info("Shutting down", { signal });
    await adapter.stop();
    logger.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start listening
  await adapter.start(handler);

  logger.info("Indexer is running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  logger.error("Fatal error", {
    error: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
