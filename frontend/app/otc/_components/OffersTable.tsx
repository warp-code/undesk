import type { Offer } from "../_lib/types";
import { getTokenSymbol } from "../_lib/tokens";
import { toHumanAmount, formatNumber, formatTimeRemaining } from "../_lib/format";

interface OffersTableProps {
  offers: Offer[];
  onOfferClick: (offer: Offer) => void;
}

export const OffersTable = ({ offers, onOfferClick }: OffersTableProps) => {
  if (offers.length === 0) {
    return (
      <div className="text-muted-foreground text-sm text-center py-8">
        No offers submitted yet. Browse the Open Market to submit offers.
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-muted-foreground text-sm border-b border-border">
              <th className="text-left py-3 font-medium">
                Selling (you receive)
              </th>
              <th className="text-left py-3 font-medium">Buying (you send)</th>
              <th className="text-right py-3 font-medium">Your price</th>
              <th className="text-right py-3 font-medium">You send</th>
              <th className="text-right py-3 font-medium">You receive</th>
              <th className="text-center py-3 font-medium">Deal closes</th>
              <th className="text-left py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => {
              const base = getTokenSymbol(offer.baseMint);
              const quote = getTokenSymbol(offer.quoteMint);
              // Amount is raw, price is human-readable (from X64.64 conversion)
              const humanAmount = toHumanAmount(offer.amount, offer.baseMint);
              const humanTotal = humanAmount * offer.yourPrice;
              // When making an offer, you send QUOTE and receive BASE
              const youSend = `${formatNumber(humanTotal)} ${quote}`;
              const youReceive = `${formatNumber(humanAmount)} ${base}`;

              return (
                <tr
                  key={offer.id}
                  className={`border-b border-border/50 cursor-pointer hover:bg-secondary/30 transition-colors ${
                    offer.dealStatus === "expired" &&
                    offer.offerStatus === "failed"
                      ? "opacity-50"
                      : ""
                  }`}
                  onClick={() => onOfferClick(offer)}
                >
                  <td className="py-3 text-foreground">{base}</td>
                  <td className="py-3 text-foreground">{quote}</td>
                  <td className="py-3 text-right text-foreground">
                    {formatNumber(offer.yourPrice)}
                  </td>
                  <td className="py-3 text-right text-foreground">{youSend}</td>
                  <td className="py-3 text-right text-foreground">
                    {youReceive}
                  </td>
                  <td className="py-3 text-center text-muted-foreground">
                    {formatTimeRemaining(offer.dealExpiresAt)}
                  </td>
                  <td className="py-3 text-left">
                    {offer.dealStatus === "open" &&
                    offer.offerStatus === "pending" ? (
                      <span className="text-muted-foreground">Pending</span>
                    ) : offer.dealStatus === "executed" &&
                      offer.offerStatus === "executed" ? (
                      <span className="text-green-500">Filled</span>
                    ) : offer.dealStatus === "executed" &&
                      offer.offerStatus === "partial" ? (
                      <span className="text-yellow-500">Partial</span>
                    ) : offer.dealStatus === "expired" &&
                      offer.offerStatus === "failed" ? (
                      <span className="text-muted-foreground/50">Unfilled</span>
                    ) : (
                      <span className="text-muted-foreground">
                        {offer.offerStatus}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-3 bg-secondary/30 rounded-md text-sm text-muted-foreground">
        You&apos;ll only know if your offer passed or failed once the deal
        concludes.
      </div>
    </div>
  );
};
