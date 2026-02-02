import type { Storage } from "./storage";
import type {
  EventWithContext,
  DealCreatedData,
  OfferCreatedData,
  DealSettledData,
  OfferSettledData,
  BalanceUpdatedData,
} from "./types";
import { logger } from "./log";

/**
 * Create an event handler that routes events to appropriate storage functions
 */
export function createEventHandler(storage: Storage) {
  return async (events: EventWithContext[]): Promise<void> => {
    for (const event of events) {
      try {
        // Always store raw event first
        await storage.insertRawEvent(event);

        // Route to appropriate handler based on event name
        switch (event.name) {
          case "DealCreated":
            await storage.upsertDealCreated(
              event as EventWithContext<DealCreatedData>
            );
            break;

          case "DealSettled":
            await storage.upsertDealSettled(
              event as EventWithContext<DealSettledData>
            );
            break;

          case "OfferCreated":
            await storage.upsertOfferCreated(
              event as EventWithContext<OfferCreatedData>
            );
            break;

          case "OfferSettled":
            await storage.upsertOfferSettled(
              event as EventWithContext<OfferSettledData>
            );
            break;

          case "BalanceUpdated":
            await storage.upsertBalanceUpdated(
              event as EventWithContext<BalanceUpdatedData>
            );
            break;

          default:
            logger.warn("Unknown event type", { name: event.name });
        }
      } catch (err) {
        logger.error("Failed to handle event", {
          name: event.name,
          signature: event.context.signature,
          error: err instanceof Error ? err.message : String(err),
        });
        // Continue processing other events
      }
    }
  };
}
