import { config as dotenvConfig } from "dotenv";
import { PublicKey } from "@solana/web3.js";
import * as path from "path";
import * as os from "os";

// Load .env from package directory
dotenvConfig({ path: path.resolve(__dirname, "../.env") });

export interface Config {
  rpcUrl: string;
  programId: PublicKey;
  payerKeyPath: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  crankIntervalMs: number;
  crankBatchSize: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

// Localnet defaults
const DEFAULT_RPC_URL = "http://127.0.0.1:8899";
const DEFAULT_PROGRAM_ID = "8wCCLUv68ofgoNg3AKbahgeqZitorLcgbRXQeHj7FpMd";
const DEFAULT_PAYER_KEY_PATH = "~/.config/solana/id.json";
const DEFAULT_SUPABASE_URL = "http://127.0.0.1:54321";
const DEFAULT_SUPABASE_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DEFAULT_CRANK_INTERVAL_MS = 10000;
const DEFAULT_CRANK_BATCH_SIZE = 10;

/**
 * Expand ~ to home directory
 */
function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Load configuration from environment variables with localnet defaults
 */
export function loadConfig(): Config {
  const rpcUrl = process.env.RPC_URL ?? DEFAULT_RPC_URL;

  const programIdStr = process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID;
  let programId: PublicKey;
  try {
    programId = new PublicKey(programIdStr);
  } catch {
    throw new Error(`Invalid PROGRAM_ID: ${programIdStr}`);
  }

  const payerKeyPath = expandPath(
    process.env.PAYER_KEY_PATH ?? DEFAULT_PAYER_KEY_PATH
  );

  const supabaseUrl = process.env.SUPABASE_URL ?? DEFAULT_SUPABASE_URL;
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? DEFAULT_SUPABASE_SERVICE_ROLE_KEY;

  const crankIntervalMs = parseInt(
    process.env.CRANK_INTERVAL_MS ?? String(DEFAULT_CRANK_INTERVAL_MS),
    10
  );
  if (isNaN(crankIntervalMs) || crankIntervalMs < 1000) {
    throw new Error(
      `Invalid CRANK_INTERVAL_MS: ${process.env.CRANK_INTERVAL_MS}`
    );
  }

  const crankBatchSize = parseInt(
    process.env.CRANK_BATCH_SIZE ?? String(DEFAULT_CRANK_BATCH_SIZE),
    10
  );
  if (isNaN(crankBatchSize) || crankBatchSize < 1) {
    throw new Error(
      `Invalid CRANK_BATCH_SIZE: ${process.env.CRANK_BATCH_SIZE}`
    );
  }

  const logLevel = (process.env.LOG_LEVEL ?? "info") as Config["logLevel"];
  if (!["debug", "info", "warn", "error"].includes(logLevel)) {
    throw new Error(`Invalid LOG_LEVEL: ${logLevel}`);
  }

  return {
    rpcUrl,
    programId,
    payerKeyPath,
    supabaseUrl,
    supabaseServiceRoleKey,
    crankIntervalMs,
    crankBatchSize,
    logLevel,
  };
}
