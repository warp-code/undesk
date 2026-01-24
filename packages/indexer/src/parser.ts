import { BorshCoder, EventParser, Idl, Event } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import * as path from "path";
import * as fs from "fs";

// Load IDL from target directory
const idlPath = path.resolve(__dirname, "../../../target/idl/otc.json");
const idl: Idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));

/**
 * Parse events from transaction logs using Anchor's EventParser
 */
export function parseEvents(logs: string[], programId: PublicKey): Event[] {
  const coder = new BorshCoder(idl);
  const eventParser = new EventParser(programId, coder);

  return Array.from(eventParser.parseLogs(logs));
}

/**
 * Get the program IDL
 */
export function getIdl(): Idl {
  return idl;
}
