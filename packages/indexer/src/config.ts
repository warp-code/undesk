import { PublicKey } from "@solana/web3.js";

export interface Config {
  rpcUrl: string;
  programId: PublicKey;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

// Default local Supabase credentials
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    throw new Error("RPC_URL environment variable is required");
  }

  const programIdStr = process.env.PROGRAM_ID;
  if (!programIdStr) {
    throw new Error("PROGRAM_ID environment variable is required");
  }

  let programId: PublicKey;
  try {
    programId = new PublicKey(programIdStr);
  } catch {
    throw new Error(`Invalid PROGRAM_ID: ${programIdStr}`);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? LOCAL_SUPABASE_URL;
  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE_KEY;

  const logLevel = (process.env.LOG_LEVEL ?? "info") as Config["logLevel"];
  if (!["debug", "info", "warn", "error"].includes(logLevel)) {
    throw new Error(`Invalid LOG_LEVEL: ${logLevel}`);
  }

  return {
    rpcUrl,
    programId,
    supabaseUrl,
    supabaseServiceRoleKey,
    logLevel,
  };
}
