import type { Token } from "../_lib/types";

export const TokenIcon = ({
  token,
  className = "w-4 h-4",
}: {
  token: Token;
  className?: string;
}) => {
  const icons: Record<Token, JSX.Element> = {
    META: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 4h4l4 12 4-12h4v16h-3V8.5L13.5 20h-3L7 8.5V20H4V4z" />
      </svg>
    ),
    ETH: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 1.5l-8 13 8 4.5 8-4.5-8-13zM12 22.5l-8-5.5 8 11 8-11-8 5.5z" />
      </svg>
    ),
    SOL: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 17.5h13.5l2.5-2.5H6.5L4 17.5zM4 6.5L6.5 4H20l-2.5 2.5H4zM17.5 12L20 9.5H6.5L4 12l2.5 2.5H20L17.5 12z" />
      </svg>
    ),
    USDC: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M12 6v2m0 8v2m-2-10.5c2 0 3.5 1 3.5 2.5s-1.5 2.5-3.5 2.5-3.5 1-3.5 2.5 1.5 2.5 3.5 2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  };
  return icons[token];
};
