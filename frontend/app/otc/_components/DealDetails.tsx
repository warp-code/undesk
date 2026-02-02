import { useState } from "react";
import type { DealWithDetails } from "../_lib/types";
import {
  formatTimeRemaining,
  isUrgent,
  getTimeProgress,
  toHumanAmount,
  formatNumber,
} from "../_lib/format";
import { formatPair, getTokenSymbol } from "../_lib/tokens";

interface DealDetailsProps {
  deal: DealWithDetails;
  onBack: () => void;
}

export const DealDetails = ({ deal, onBack }: DealDetailsProps) => {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  // For own deals, calculate human-readable values
  const humanAmount =
    deal.isOwner && deal.amount !== undefined
      ? toHumanAmount(deal.amount, deal.baseMint)
      : null;
  const humanTotal =
    humanAmount !== null && deal.price !== undefined
      ? humanAmount * deal.price
      : null;

  return (
    <div className="p-4">
      {/* Header with back button and share */}
      <div className="flex items-center justify-between mb-6">
        <div
          className="flex items-center gap-2 cursor-pointer group"
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

        <button
          onClick={handleShare}
          className="px-2 py-1 text-xs font-medium rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors flex items-center gap-1 cursor-pointer"
        >
          {copied ? (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              <span>Share</span>
            </>
          )}
        </button>
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
        {deal.isOwner && humanAmount !== null && deal.price !== undefined ? (
          // Own deal: show full details
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-secondary/30 rounded-lg p-4">
              <p className="text-muted-foreground text-sm mb-1">Amount</p>
              <p className="text-foreground text-lg font-medium">
                {formatNumber(humanAmount)} {getTokenSymbol(deal.baseMint)}
              </p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-4">
              <p className="text-muted-foreground text-sm mb-1">Your Price</p>
              <p className="text-foreground text-lg font-medium">
                {formatNumber(deal.price)} {getTokenSymbol(deal.quoteMint)}
              </p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-4">
              <p className="text-muted-foreground text-sm mb-1">Total Value</p>
              <p className="text-foreground text-lg font-medium">
                {formatNumber(humanTotal!)} {getTokenSymbol(deal.quoteMint)}
              </p>
            </div>
            <div className="bg-secondary/30 rounded-lg p-4">
              <p className="text-muted-foreground text-sm mb-1">
                Current Offers
              </p>
              <p className="text-foreground text-lg font-medium">
                {deal.offerCount || 0}
              </p>
            </div>
          </div>
        ) : (
          // Other's deal: limited info
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
              <p className="text-muted-foreground text-sm mb-1">
                Current Offers
              </p>
              <p className="text-foreground text-lg font-medium">
                {deal.offerCount || 0}
              </p>
            </div>
          </div>
        )}

        {/* Settlement Details - only for owner's settled deals */}
        {deal.isOwner &&
          deal.status !== "open" &&
          deal.totalFilled !== undefined && (
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-foreground">
                Settlement Details
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary/30 rounded-lg p-4">
                  <p className="text-muted-foreground text-sm mb-1">
                    Total Filled
                  </p>
                  <p
                    className={`text-lg font-medium ${
                      deal.totalFilled > 0 ? "text-success" : "text-foreground"
                    }`}
                  >
                    {formatNumber(deal.totalFilled)}{" "}
                    {getTokenSymbol(deal.baseMint)}
                  </p>
                </div>
                <div className="bg-secondary/30 rounded-lg p-4">
                  <p className="text-muted-foreground text-sm mb-1">
                    You Received
                  </p>
                  <p
                    className={`text-lg font-medium ${
                      (deal.creatorReceives ?? 0) > 0
                        ? "text-success"
                        : "text-foreground"
                    }`}
                  >
                    {formatNumber(deal.creatorReceives ?? 0)}{" "}
                    {getTokenSymbol(deal.quoteMint)}
                  </p>
                </div>
                {(deal.creatorRefund ?? 0) > 0 && (
                  <div className="bg-secondary/30 rounded-lg p-4">
                    <p className="text-muted-foreground text-sm mb-1">
                      Refunded
                    </p>
                    <p className="text-lg font-medium text-yellow-400">
                      {formatNumber(deal.creatorRefund ?? 0)}{" "}
                      {getTokenSymbol(deal.baseMint)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

        {/* Info box */}
        <div className="bg-secondary/30 rounded-md p-4 text-sm text-muted-foreground">
          {deal.isOwner ? (
            deal.status === "open" ? (
              <>
                <p className="font-medium text-foreground mb-2">Your Deal</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>This is your deal - you can see full details</li>
                  <li>Offers can now be submitted until the deal expires</li>
                  <li>
                    The deal will execute automatically using best offers once
                    it expires
                  </li>
                </ul>
              </>
            ) : deal.status === "executed" ? (
              <>
                <p className="font-medium text-success mb-2">Deal Executed</p>
                <p>
                  Your deal was filled! You received{" "}
                  {formatNumber(deal.creatorReceives ?? 0)}{" "}
                  {getTokenSymbol(deal.quoteMint)} for{" "}
                  {formatNumber(deal.totalFilled ?? 0)}{" "}
                  {getTokenSymbol(deal.baseMint)}.
                </p>
              </>
            ) : (deal.totalFilled ?? 0) > 0 ? (
              <>
                <p className="font-medium text-yellow-400 mb-2">
                  Deal Expired (Partial Fill)
                </p>
                <p>
                  Your deal expired with partial fill. You received{" "}
                  {formatNumber(deal.creatorReceives ?? 0)}{" "}
                  {getTokenSymbol(deal.quoteMint)} and{" "}
                  {formatNumber(deal.creatorRefund ?? 0)}{" "}
                  {getTokenSymbol(deal.baseMint)} was refunded.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-muted-foreground mb-2">
                  Deal Expired
                </p>
                <p>
                  Your deal expired without any matching offers. Your{" "}
                  {getTokenSymbol(deal.baseMint)} has been refunded.
                </p>
              </>
            )
          ) : (
            <>
              <p className="font-medium text-foreground mb-2">How it works</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>You won&apos;t see the creator&apos;s price</li>
                <li>Submit your best offer price</li>
                <li>If your price meets their threshold, your offer passes</li>
                <li>Results are revealed when the deal expires or executes</li>
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
