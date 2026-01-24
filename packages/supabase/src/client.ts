import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type TypedSupabaseClient = SupabaseClient<Database>;

// Default local Supabase URLs
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

export interface SupabaseConfig {
  url?: string;
  anonKey?: string;
  serviceRoleKey?: string;
}

/**
 * Create a Supabase client for frontend use (anon key, respects RLS)
 */
export function createAnonClient(config?: SupabaseConfig): TypedSupabaseClient {
  const url =
    config?.url ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_SUPABASE_URL;
  const key =
    config?.anonKey ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    LOCAL_ANON_KEY;

  return createClient<Database>(url, key);
}

/**
 * Create a Supabase client for backend use (service_role key, bypasses RLS)
 * Only use in server-side code (indexer, cranker)
 */
export function createServiceClient(
  config?: SupabaseConfig
): TypedSupabaseClient {
  const url = config?.url ?? process.env.SUPABASE_URL ?? LOCAL_SUPABASE_URL;
  const key =
    config?.serviceRoleKey ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    LOCAL_SERVICE_ROLE_KEY;

  return createClient<Database>(url, key);
}
