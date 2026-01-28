import type { OfferWithSettlement } from "../_lib/types";
import { formatTimeAgo, toHumanAmount, formatNumber } from "../_lib/format";
import { formatPair, getTokenSymbol } from "../_lib/tokens";

interface OfferDetailsProps {
  offer: OfferWithSettlement;
  onBack: () => void;
  onViewDeal: (dealId: string) => void;
}

export const OfferDetails = ({
  offer,
  onBack,
  onViewDeal,
}: OfferDetailsProps) => {
  const base = getTokenSymbol(offer.baseMint);
  const quote = getTokenSymbol(offer.quoteMint);

  // Amount is raw, price is human-readable
  const humanAmount = toHumanAmount(offer.amount, offer.baseMint);
  const humanTotal = humanAmount * offer.yourPrice;

  // Determine status display
  const getStatusDisplay = () => {
    if (offer.dealStatus === "open" && offer.offerStatus === "pending") {
      return {
        label: "Pending",
        color: "text-muted-foreground",
        bgColor: "bg-secondary/50",
        borderColor: "border-border",
      };
    }
    if (offer.dealStatus === "executed" && offer.offerStatus === "executed") {
      return {
        label: "Filled",
        color: "text-green-400",
        bgColor: "bg-green-500/10",
        borderColor: "border-green-500/30",
      };
    }
    if (offer.dealStatus === "executed" && offer.offerStatus === "partial") {
      return {
        label: "Partially Filled",
        color: "text-yellow-400",
        bgColor: "bg-yellow-500/10",
        borderColor: "border-yellow-500/30",
      };
    }
    if (offer.dealStatus === "expired" && offer.offerStatus === "failed") {
      return {
        label: "Unfilled",
        color: "text-muted-foreground/50",
        bgColor: "bg-secondary/30",
        borderColor: "border-border/50",
      };
    }
    return {
      label: offer.offerStatus,
      color: "text-muted-foreground",
      bgColor: "bg-secondary/50",
      borderColor: "border-border",
    };
  };

  const status = getStatusDisplay();
  const isSettled = offer.offerStatus !== "pending";
  const hasSettlementData =
    offer.executedAmt !== undefined || offer.refundAmt !== undefined;

  return (
    <div className="p-4">
      {/* Back header */}
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
          Back to Your Offers
        </span>
      </div>

      {/* Offer Details */}
      <div className="space-y-6">
        {/* Header with pair and status */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold text-foreground">
              {formatPair(offer.baseMint, offer.quoteMint)}
            </h2>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${status.bgColor} ${status.color} border ${status.borderColor}`}
            >
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-success">Buying {base}</span>
            <span className="text-muted-foreground">(sending {quote})</span>
          </div>
        </div>

        {/* Offer details grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-secondary/30 rounded-lg p-4">
            <p className="text-muted-foreground text-sm mb-1">Amount</p>
            <p className="text-foreground text-lg font-medium">
              {formatNumber(humanAmount)} {base}
            </p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-4">
            <p className="text-muted-foreground text-sm mb-1">Your Price</p>
            <p className="text-foreground text-lg font-medium">
              {formatNumber(offer.yourPrice)} {quote}
            </p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-4">
            <p className="text-muted-foreground text-sm mb-1">Total Value</p>
            <p className="text-foreground text-lg font-medium">
              {formatNumber(humanTotal)} {quote}
            </p>
          </div>
          <div className="bg-secondary/30 rounded-lg p-4">
            <p className="text-muted-foreground text-sm mb-1">Submitted</p>
            <p className="text-foreground text-lg font-medium">
              {formatTimeAgo(offer.submittedAt)}
            </p>
          </div>
        </div>

        {/* Settlement section (only when settled with data) */}
        {isSettled && hasSettlementData && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-foreground">
              Settlement Details
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/30 rounded-lg p-4">
                <p className="text-muted-foreground text-sm mb-1">
                  Executed Amount
                </p>
                <p
                  className={`text-lg font-medium ${
                    offer.executedAmt && offer.executedAmt > 0
                      ? "text-green-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {offer.executedAmt !== undefined
                    ? `${formatNumber(offer.executedAmt)} ${base}`
                    : "-"}
                </p>
              </div>
              <div className="bg-secondary/30 rounded-lg p-4">
                <p className="text-muted-foreground text-sm mb-1">
                  Refunded Amount
                </p>
                <p
                  className={`text-lg font-medium ${
                    offer.refundAmt && offer.refundAmt > 0
                      ? "text-yellow-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {offer.refundAmt !== undefined
                    ? `${formatNumber(offer.refundAmt)} ${quote}`
                    : "-"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info box */}
        <div className="bg-secondary/30 rounded-md p-4 text-sm text-muted-foreground">
          {offer.offerStatus === "pending" ? (
            <>
              <p className="font-medium text-foreground mb-2">
                Awaiting Result
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Your offer is waiting for the deal to conclude</li>
                <li>
                  If your price meets the threshold, you&apos;ll receive {base}
                </li>
                <li>
                  Results will be revealed when the deal expires or executes
                </li>
              </ul>
            </>
          ) : offer.offerStatus === "executed" ? (
            <>
              <p className="font-medium text-green-400 mb-2">Offer Filled</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Your offer was fully matched</li>
                <li>
                  You received {formatNumber(offer.executedAmt ?? humanAmount)}{" "}
                  {base}
                </li>
              </ul>
            </>
          ) : offer.offerStatus === "partial" ? (
            <>
              <p className="font-medium text-yellow-400 mb-2">
                Partially Filled
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Your offer was partially matched</li>
                <li>
                  You received {formatNumber(offer.executedAmt ?? 0)} {base}
                </li>
                <li>
                  {formatNumber(offer.refundAmt ?? 0)} {quote} was refunded
                </li>
              </ul>
            </>
          ) : (
            <>
              <p className="font-medium text-muted-foreground/70 mb-2">
                Offer Not Filled
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Your price did not meet the deal threshold</li>
                <li>Your {quote} has been refunded</li>
              </ul>
            </>
          )}
        </div>

        {/* View Deal button */}
        <button
          onClick={() => onViewDeal(offer.dealId)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg transition-colors"
        >
          <span>View Deal</span>
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
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};
