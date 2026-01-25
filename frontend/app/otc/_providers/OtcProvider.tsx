"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import {
  getArciumEnv,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getClusterAccAddress,
  getComputationAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
} from "@arcium-hq/client";

import { idl, type Otc } from "../_lib/idl/otc";
import {
  OTC_PROGRAM_ID,
  CLUSTER_OFFSET,
  COMP_DEF_NAMES,
} from "../_lib/constants";

// MXE key fetch state
type MxeKeyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; key: Uint8Array }
  | { status: "error"; error: string };

// Arcium account address helpers
interface ArciumAccounts {
  getMXEAccAddress: () => PublicKey;
  getMempoolAccAddress: () => PublicKey;
  getExecutingPoolAccAddress: () => PublicKey;
  getClusterAccAddress: () => PublicKey;
  getComputationAccAddress: (offset: BN) => PublicKey;
  getCompDefAccAddress: (name: keyof typeof COMP_DEF_NAMES) => PublicKey;
}

// Context value interface
interface OtcContextValue {
  program: Program<Otc> | null;
  provider: AnchorProvider | null;
  programId: PublicKey;
  mxeKeyState: MxeKeyState;
  mxePublicKey: Uint8Array | null;
  clusterOffset: number;
  refetchMxeKey: () => void;
  arciumAccounts: ArciumAccounts;
}

const OtcContext = createContext<OtcContextValue | null>(null);

/**
 * Creates an AnchorProvider-compatible wallet adapter
 */
function createAnchorWallet(wallet: ReturnType<typeof useWallet>) {
  if (
    !wallet.publicKey ||
    !wallet.signTransaction ||
    !wallet.signAllTransactions
  ) {
    return null;
  }
  return {
    publicKey: wallet.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(
      tx: T
    ): Promise<T> => {
      return wallet.signTransaction!(tx);
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(
      txs: T[]
    ): Promise<T[]> => {
      return wallet.signAllTransactions!(txs);
    },
  };
}

interface OtcProviderProps {
  children: ReactNode;
}

export function OtcProvider({ children }: OtcProviderProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [mxeKeyState, setMxeKeyState] = useState<MxeKeyState>({
    status: "idle",
  });

  // Resolve cluster offset (use env for localnet, or explicit offset for devnet/testnet)
  const clusterOffset = useMemo(() => {
    if (CLUSTER_OFFSET !== null) {
      return CLUSTER_OFFSET;
    }
    try {
      return getArciumEnv().arciumClusterOffset;
    } catch {
      // Env not available (e.g., during SSR), default to 0
      return 0;
    }
  }, []);

  // Create AnchorProvider when wallet is connected
  const provider = useMemo(() => {
    const anchorWallet = createAnchorWallet(wallet);
    if (!anchorWallet) return null;
    return new AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
    });
  }, [connection, wallet]);

  // Create Program instance when provider is available
  const program = useMemo(() => {
    if (!provider) return null;
    return new Program<Otc>(idl as Otc, provider);
  }, [provider]);

  // MXE key fetch with retry logic
  const fetchMxeKey = useCallback(async () => {
    if (!provider) {
      setMxeKeyState({ status: "idle" });
      return;
    }

    setMxeKeyState({ status: "loading" });

    const maxRetries = 10;
    const retryDelayMs = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const key = await getMXEPublicKey(provider, OTC_PROGRAM_ID);
        if (key) {
          console.log(`MXE key fetched successfully on attempt ${attempt}`);
          setMxeKeyState({ status: "success", key });
          return;
        }
      } catch (error) {
        console.log(`MXE key fetch attempt ${attempt} failed:`, error);
      }

      if (attempt < maxRetries) {
        console.log(
          `Retrying MXE key fetch in ${retryDelayMs}ms... (${attempt}/${maxRetries})`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    setMxeKeyState({
      status: "error",
      error: `Failed to fetch MXE public key after ${maxRetries} attempts`,
    });
  }, [provider]);

  // Fetch MXE key when provider becomes available
  useEffect(() => {
    if (provider) {
      fetchMxeKey();
    } else {
      setMxeKeyState({ status: "idle" });
    }
  }, [provider, fetchMxeKey]);

  // Arcium account address helpers
  const arciumAccounts: ArciumAccounts = useMemo(
    () => ({
      getMXEAccAddress: () => getMXEAccAddress(OTC_PROGRAM_ID),
      getMempoolAccAddress: () => getMempoolAccAddress(clusterOffset),
      getExecutingPoolAccAddress: () =>
        getExecutingPoolAccAddress(clusterOffset),
      getClusterAccAddress: () => getClusterAccAddress(clusterOffset),
      getComputationAccAddress: (offset: BN) =>
        getComputationAccAddress(clusterOffset, offset),
      getCompDefAccAddress: (name: keyof typeof COMP_DEF_NAMES) => {
        const compDefName = COMP_DEF_NAMES[name];
        const offset = getCompDefAccOffset(compDefName);
        return getCompDefAccAddress(
          OTC_PROGRAM_ID,
          Buffer.from(offset).readUInt32LE()
        );
      },
    }),
    [clusterOffset]
  );

  // Derive mxePublicKey for convenience
  const mxePublicKey =
    mxeKeyState.status === "success" ? mxeKeyState.key : null;

  const value: OtcContextValue = {
    program,
    provider,
    programId: OTC_PROGRAM_ID,
    mxeKeyState,
    mxePublicKey,
    clusterOffset,
    refetchMxeKey: fetchMxeKey,
    arciumAccounts,
  };

  return <OtcContext.Provider value={value}>{children}</OtcContext.Provider>;
}

/**
 * Access the full OTC context
 */
export function useOtc(): OtcContextValue {
  const context = useContext(OtcContext);
  if (!context) {
    throw new Error("useOtc must be used within an OtcProvider");
  }
  return context;
}

/**
 * Access the OTC program (throws if unavailable)
 */
export function useOtcProgram(): Program<Otc> {
  const { program } = useOtc();
  if (!program) {
    throw new Error(
      "useOtcProgram requires a connected wallet. Make sure the wallet is connected before calling this hook."
    );
  }
  return program;
}

/**
 * Access the MXE public key (null during loading)
 */
export function useMxePublicKey(): Uint8Array | null {
  const { mxePublicKey } = useOtc();
  return mxePublicKey;
}
