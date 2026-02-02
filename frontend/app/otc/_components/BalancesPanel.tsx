"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { useMxePublicKey } from "../_providers/OtcProvider";
import { useMyBalances } from "../_providers/MyBalancesProvider";
import { useTopUp } from "../_hooks/useTopUp";
import { SUPPORTED_MINTS, getTokenInfo } from "../_lib/tokens";
import { TokenIcon } from "./TokenIcon";

/**
 * Format a raw balance amount to human-readable form
 */
function formatBalance(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;

  // Pad fractional part with leading zeros
  const fracStr = frac.toString().padStart(decimals, "0");
  // Trim trailing zeros but keep at least 2 decimal places for display
  const trimmedFrac = fracStr.replace(/0+$/, "") || "00";
  const displayFrac = trimmedFrac.slice(0, 2).padEnd(2, "0");

  // Format whole part with commas
  const wholeFormatted = whole.toLocaleString();

  return `${wholeFormatted}.${displayFrac}`;
}

export const BalancesPanel = () => {
  const { connected } = useWallet();
  const { hasDerivedKeys, deriveKeysFromWallet, isDerivingKeys } =
    useDerivedKeysContext();
  const mxePublicKey = useMxePublicKey();
  const {
    balances,
    isLoading: balancesLoading,
    error: balancesError,
    getBalance,
  } = useMyBalances();
  const {
    topUp,
    isLoading: topUpLoading,
    error: topUpError,
    loadingMint,
  } = useTopUp();

  // Determine ready state
  const isReady = connected && hasDerivedKeys && mxePublicKey !== null;
  const mxeKeyLoading = connected && hasDerivedKeys && mxePublicKey === null;

  const handleTopUp = async (mint: string) => {
    try {
      await topUp(mint);
    } catch (err) {
      // Error is already set in the hook
      console.error("Top-up failed:", err);
    }
  };

  return (
    <div className="bg-card/50 border border-border rounded-lg mb-4">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <h4 className="text-foreground font-medium">Balances</h4>
          {(balancesLoading || topUpLoading) && (
            <svg
              className="w-4 h-4 animate-spin text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          )}
        </div>

        {/* Content based on state */}
        {!connected ? (
          <p className="text-muted-foreground text-sm">
            Connect wallet to view balances
          </p>
        ) : !hasDerivedKeys ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Sign to view and manage your encrypted balances.
            </p>
            <button
              onClick={deriveKeysFromWallet}
              disabled={isDerivingKeys}
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isDerivingKeys ? "Signing..." : "Sign to view balances"}
            </button>
          </div>
        ) : mxeKeyLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <svg
              className="w-4 h-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading MXE key...</span>
          </div>
        ) : isReady ? (
          <div className="space-y-2">
            {SUPPORTED_MINTS.map((mint) => {
              const balance = getBalance(mint);
              const tokenInfo = getTokenInfo(mint);
              const totalAmount = balance?.amount ?? BigInt(0);
              const committedAmount = balance?.committedAmount ?? BigInt(0);
              const availableAmount = totalAmount - committedAmount;
              const isThisMintLoading = loadingMint === mint;

              return (
                <div
                  key={mint}
                  className="flex items-center justify-between py-2 px-3 bg-secondary/50 rounded-md"
                >
                  {/* Token info */}
                  <div className="flex items-center gap-3">
                    <TokenIcon mint={mint} className="w-6 h-6" />
                    <span className="text-foreground text-sm font-medium">
                      {tokenInfo.symbol}
                    </span>
                  </div>

                  {/* Balance and top-up button */}
                  <div className="flex items-center gap-3">
                    <span className="text-foreground text-sm tabular-nums">
                      {formatBalance(availableAmount, tokenInfo.decimals)}
                    </span>
                    <button
                      onClick={() => handleTopUp(mint)}
                      disabled={topUpLoading}
                      className="px-2 py-1 text-xs font-medium rounded bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      {isThisMintLoading ? (
                        <svg
                          className="w-3 h-3 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      ) : (
                        "+1000"
                      )}
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Error display */}
            {(balancesError || topUpError) && (
              <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-destructive text-xs">
                {topUpError || balancesError}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
