"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createAnonClient, type TypedSupabaseClient } from "@otc/supabase";

interface SupabaseContextValue {
  client: TypedSupabaseClient;
}

const SupabaseContext = createContext<SupabaseContextValue | null>(null);

interface SupabaseProviderProps {
  children: ReactNode;
}

export function SupabaseProvider({ children }: SupabaseProviderProps) {
  // Create client once on mount
  // createAnonClient() reads from NEXT_PUBLIC_* env vars with local fallbacks
  const client = useMemo(() => createAnonClient(), []);

  const value: SupabaseContextValue = { client };

  return (
    <SupabaseContext.Provider value={value}>
      {children}
    </SupabaseContext.Provider>
  );
}

/**
 * Access the Supabase client
 */
export function useSupabase(): TypedSupabaseClient {
  const context = useContext(SupabaseContext);
  if (!context) {
    throw new Error("useSupabase must be used within a SupabaseProvider");
  }
  return context.client;
}
