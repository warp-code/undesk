import type { MarketDeal } from "../_lib/types";
import { formatTimeRemaining, isUrgent, getTimeProgress } from "../_lib/format";
import { formatPair, getTokenSymbol } from "../_lib/tokens";

interface DealDetailsProps {
  deal: MarketDeal;
  onBack: () => void;
}

export const DealDetails = ({ deal, onBack }: DealDetailsProps) => {
  return (
    <div className="p-4">
      {/* Collapse header */}
      <div
        className="flex items-center gap-2 mb-6 cursor-pointer group"
        onClick={onBack}
      >
        <svg
          className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        <span className="text-muted-foreground group-hover:text-foreground transition-colors text-sm">
          Back to Open Market
        </span>
      </div>

      {/* Deal Details */}
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold text-foreground">
              {formatPair(deal.baseMint, deal.quoteMint)}
            </h2>
            {/* Compact time remaining */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">⏳</span>
              <span
                className={`text-sm font-medium ${
                  isUrgent(deal.expiresAt)
                    ? "text-yellow-400"
                    : "text-foreground"
                }`}
              >
                {formatTimeRemaining(deal.expiresAt)}
              </span>
              <div className="w-24 h-1 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-muted-foreground/50 rounded-full transition-all duration-1000 ease-linear"
                  style={{
                    width: `${getTimeProgress(
                      deal.createdAt,
                      deal.expiresAt
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-success">
              Offering {getTokenSymbol(deal.baseMint)}
            </span>
            <span className="text-muted-foreground">
              (for {getTokenSymbol(deal.quoteMint)})
            </span>
          </div>
        </div>

        {/* Deal info grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-secondary/30 rounded-lg p-4">
            <p className="text-muted-foreground text-sm mb-1">Status</p>
            <div className="flex items-center gap-2">
              {deal.offerCount && deal.offerCount > 0 ? (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                  has offers
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  open
                </span>
              )}
            </div>
          </div>
          <div className="bg-secondary/30 rounded-lg p-4">
            <p className="text-muted-foreground text-sm mb-1">Current Offers</p>
            <p className="text-foreground text-lg font-medium">
              {deal.offerCount || 0}
            </p>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-secondary/30 rounded-md p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-2">How it works</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>You won&apos;t see the creator&apos;s price</li>
            <li>Submit your best offer price</li>
            <li>If your price meets their threshold, your offer passes</li>
            <li>Results are revealed when the deal expires or executes</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
