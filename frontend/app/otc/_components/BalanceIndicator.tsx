"use client";

import { useMyBalances } from "../_providers/MyBalancesProvider";
import { useDerivedKeysContext } from "../_providers/DerivedKeysProvider";
import { getTokenInfo } from "../_lib/tokens";

interface BalanceIndicatorProps {
  mint: string;
  /** Called when user clicks the balance. Receives the available amount as a decimal string. */
  onClickBalance?: (amount: string) => void;
}

/** Format for display (with locale formatting, 2 decimal places) */
function formatBalanceDisplay(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, "0");
  const trimmedFrac = fracStr.replace(/0+$/, "") || "00";
  const displayFrac = trimmedFrac.slice(0, 2).padEnd(2, "0");
  return `${whole.toLocaleString()}.${displayFrac}`;
}

/** Format for input fields (raw decimal string, no locale formatting) */
function formatBalanceRaw(amount: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, "0");
  const trimmedFrac = fracStr.replace(/0+$/, "");
  if (!trimmedFrac) return whole.toString();
  return `${whole}.${trimmedFrac}`;
}

export const BalanceIndicator = ({ mint, onClickBalance }: BalanceIndicatorProps) => {
  const { hasDerivedKeys, deriveKeysFromWallet, isDerivingKeys } =
    useDerivedKeysContext();
  const { getBalance, isLoading } = useMyBalances();

  if (!hasDerivedKeys) {
    return (
      <div className="mt-1 flex justify-end">
        <button
          onClick={deriveKeysFromWallet}
          disabled={isDerivingKeys}
          className="text-xs text-primary hover:underline disabled:opacity-50 cursor-pointer"
        >
          {isDerivingKeys ? "signing..." : "sign to check your balances"}
        </button>
      </div>
    );
  }

  const balance = getBalance(mint);
  const tokenInfo = getTokenInfo(mint);
  const totalAmount = balance?.amount ?? BigInt(0);
  const committedAmount = balance?.committedAmount ?? BigInt(0);
  const availableAmount = totalAmount - committedAmount;

  const handleClick = () => {
    if (onClickBalance && !isLoading) {
      onClickBalance(formatBalanceRaw(availableAmount, tokenInfo.decimals));
    }
  };

  const isClickable = !!onClickBalance && !isLoading;

  return (
    <div
      className={`mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground ${
        isClickable ? "cursor-pointer hover:text-foreground transition-colors" : ""
      }`}
      onClick={handleClick}
    >
      {isLoading ? (
        <span className="animate-pulse">loading...</span>
      ) : (
        <>
          <WalletIcon className="w-3 h-3" />
          <span>
            {formatBalanceDisplay(availableAmount, tokenInfo.decimals)}{" "}
            {tokenInfo.symbol}
          </span>
        </>
      )}
    </div>
  );
};

const WalletIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M19 7V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2v-2" />
    <path d="M19 7h-4a2 2 0 00-2 2v2a2 2 0 002 2h4a2 2 0 002-2V9a2 2 0 00-2-2z" />
  </svg>
);
