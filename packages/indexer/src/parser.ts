import { BorshCoder, Idl, Event } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as path from "path";
import * as fs from "fs";

// Load IDL from target directory
const idlPath = path.resolve(__dirname, "../../../target/idl/otc.json");
const idl: Idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

// Create coder once for reuse
const coder = new BorshCoder(idl);

/**
 * Convert camelCase to PascalCase (e.g., "dealCreated" -> "DealCreated")
 */
function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Parse events from transaction logs using Anchor's BorshCoder.
 * Uses coder.events.decode() which properly deserializes PublicKey and BN types.
 */
export function parseEvents(logs: string[], _programId: PublicKey): Event[] {
  const events: Event[] = [];

  for (const log of logs) {
    // Look for "Program data:" log lines which contain base64-encoded event data
    if (!log.startsWith("Program data:")) continue;

    const base64Data = log.slice("Program data: ".length).trim();
    if (!base64Data) continue;

    try {
      const decoded = coder.events.decode(base64Data);
      if (decoded) {
        // Convert camelCase event name to PascalCase to match handler expectations
        events.push({
          name: toPascalCase(decoded.name),
          data: decoded.data,
        });
      }
    } catch {
      // Ignore decode errors (not all "Program data:" logs are events)
    }
  }

  return events;
}

/**
 * Get the program IDL
 */
export function getIdl(): Idl {
  return idl;
}
