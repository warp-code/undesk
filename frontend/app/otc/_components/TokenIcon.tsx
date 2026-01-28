import Image from "next/image";
import { getTokenSymbol } from "../_lib/tokens";

export const TokenIcon = ({
  mint,
  className = "w-5 h-5",
}: {
  mint: string;
  className?: string;
}) => {
  const symbol = getTokenSymbol(mint);

  // Check if we have a local icon for this symbol
  const knownSymbols = ["META", "SOL", "USDC", "JTO"];
  if (knownSymbols.includes(symbol)) {
    return (
      <Image
        src={`/tokens/${symbol}.png`}
        alt={symbol}
        width={64}
        height={64}
        className={`${className} rounded-full`}
      />
    );
  }

  // Fallback for unknown tokens
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <text x="12" y="16" textAnchor="middle" fontSize="10" fill="currentColor">
        ?
      </text>
    </svg>
  );
};
