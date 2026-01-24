import { Connection, PublicKey } from "@solana/web3.js";
import type { IngestionAdapter, EventWithContext } from "../types";
import { parseEvents } from "../parser";
import { logger } from "../log";

/**
 * Create an RPC adapter that listens for program logs
 */
export function createRpcAdapter(
  connection: Connection,
  programId: PublicKey
): IngestionAdapter {
  let subscriptionId: number | null = null;

  return {
    async start(
      callback: (events: EventWithContext[]) => Promise<void>
    ): Promise<void> {
      logger.info("Starting RPC log subscription", {
        programId: programId.toBase58(),
      });

      subscriptionId = connection.onLogs(
        programId,
        async (logsResult, ctx) => {
          if (logsResult.err) {
            logger.debug("Transaction failed, skipping", {
              signature: logsResult.signature,
            });
            return;
          }

          try {
            const events = parseEvents(logsResult.logs, programId);

            if (events.length === 0) {
              return;
            }

            const eventsWithContext: EventWithContext[] = events.map((e) => ({
              name: e.name,
              data: e.data,
              context: {
                signature: logsResult.signature,
                slot: ctx.slot,
                blockTime: null, // Not available from onLogs
              },
            }));

            logger.debug("Parsed events from logs", {
              signature: logsResult.signature,
              slot: ctx.slot,
              eventCount: eventsWithContext.length,
            });

            await callback(eventsWithContext);
          } catch (err) {
            logger.error("Failed to process logs", {
              signature: logsResult.signature,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        },
        "confirmed"
      );

      logger.info("RPC log subscription started", { subscriptionId });
    },

    async stop(): Promise<void> {
      if (subscriptionId !== null) {
        logger.info("Stopping RPC log subscription", { subscriptionId });
        await connection.removeOnLogsListener(subscriptionId);
        subscriptionId = null;
      }
    },
  };
}
