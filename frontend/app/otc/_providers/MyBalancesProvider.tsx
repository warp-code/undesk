"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useSupabase } from "./SupabaseProvider";
import { useDerivedKeysContext } from "./DerivedKeysProvider";
import { useMxePublicKey } from "./OtcProvider";
import {
  createDecryptionCipher,
  decryptBalanceData,
  bytesToHex,
} from "../_lib/decryption";

export interface Balance {
  /** Balance account address (base58) */
  address: string;
  /** Controller pubkey (base58) */
  controller: string;
  /** Token mint address (base58) */
  mint: string;
  /** Available balance amount (raw, not adjusted for decimals) */
  amount: bigint;
  /** Amount committed to open deals/offers */
  committedAmount: bigint;
}

interface MyBalancesContextValue {
  balances: Balance[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  getBalance: (mint: string) => Balance | undefined;
}

const MyBalancesContext = createContext<MyBalancesContextValue | null>(null);

export function MyBalancesProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabase();
  const { derivedKeys, hasDerivedKeys } = useDerivedKeysContext();
  const mxePublicKey = useMxePublicKey();

  const [balances, setBalances] = useState<Balance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User's encryption public key as hex for database comparison
  const userPubKeyHex = useMemo(() => {
    if (!hasDerivedKeys || !derivedKeys) return null;
    return "\\x" + bytesToHex(derivedKeys.encryption.publicKey);
  }, [derivedKeys, hasDerivedKeys]);

  const fetchBalances = useCallback(async () => {
    if (!userPubKeyHex || !mxePublicKey || !derivedKeys) {
      setBalances([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from("balances")
        .select("*")
        .eq("encryption_key", userPubKeyHex);

      if (queryError) throw queryError;

      const cipher = createDecryptionCipher(
        derivedKeys.encryption.privateKey,
        mxePublicKey
      );

      const decrypted: Balance[] = (data ?? []).map((row) => {
        console.log("[MyBalancesProvider] Raw row:", {
          address: row.address,
          mint: row.mint,
          ciphertexts: row.ciphertexts?.slice(0, 50) + "...",
          nonce: row.nonce,
        });

        const { amount, committedAmount } = decryptBalanceData(
          row.ciphertexts,
          row.nonce,
          cipher
        );

        console.log("[MyBalancesProvider] Decrypted:", {
          amount: amount.toString(),
          committedAmount: committedAmount.toString(),
        });

        return {
          address: row.address,
          controller: row.controller,
          mint: row.mint,
          amount,
          committedAmount,
        };
      });

      setBalances(decrypted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch balances");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, userPubKeyHex, mxePublicKey, derivedKeys]);

  // Keep a ref to the latest fetchBalances
  const fetchBalancesRef = useRef(fetchBalances);
  useEffect(() => {
    fetchBalancesRef.current = fetchBalances;
  }, [fetchBalances]);

  // Initial fetch
  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // Single realtime subscription for the entire app
  useEffect(() => {
    if (!userPubKeyHex) return;

    console.log("[MyBalancesProvider] Setting up realtime subscription");

    const channel = supabase
      .channel("my-balances-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "balances" },
        (payload) => {
          console.log("[MyBalancesProvider] Realtime event received:", payload);
          fetchBalancesRef.current();
        }
      )
      .subscribe((status) => {
        console.log("[MyBalancesProvider] Subscription status:", status);
      });

    return () => {
      console.log("[MyBalancesProvider] Removing channel");
      supabase.removeChannel(channel);
    };
  }, [supabase, userPubKeyHex]);

  const getBalance = useCallback(
    (mint: string): Balance | undefined => {
      return balances.find((b) => b.mint === mint);
    },
    [balances]
  );

  const value: MyBalancesContextValue = {
    balances,
    isLoading,
    error,
    refetch: fetchBalances,
    getBalance,
  };

  return (
    <MyBalancesContext.Provider value={value}>
      {children}
    </MyBalancesContext.Provider>
  );
}

/**
 * Hook to access balances from the provider.
 * Must be used within a MyBalancesProvider.
 */
export function useMyBalances(): MyBalancesContextValue {
  const context = useContext(MyBalancesContext);
  if (!context) {
    throw new Error("useMyBalances must be used within a MyBalancesProvider");
  }
  return context;
}
