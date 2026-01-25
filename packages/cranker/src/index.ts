import { loadConfig } from "./config";
import { setLogLevel, logger } from "./log";
import { startCranker, stopCranker, CrankerState } from "./cranker";

async function main(): Promise<void> {
  // Load configuration
  const config = loadConfig();
  setLogLevel(config.logLevel);

  logger.info("Loading cranker configuration", {
    rpcUrl: config.rpcUrl,
    programId: config.programId.toBase58(),
  });

  // Start cranker
  let state: CrankerState | null = null;

  try {
    state = await startCranker(config);

    // Handle graceful shutdown
    const shutdown = () => {
      logger.info("Shutdown signal received");
      if (state) {
        stopCranker(state);
      }
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep process alive
    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (state && !state.running) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);
    });
  } catch (error) {
    logger.error("Fatal error", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

main();
