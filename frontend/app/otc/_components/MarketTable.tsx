import type { MarketDeal } from "../_lib/types";
import { formatTimeRemaining, isUrgent } from "../_lib/format";
import { getTokenSymbol } from "../_lib/tokens";

interface MarketTableProps {
  deals: MarketDeal[];
  filteredDeals: MarketDeal[];
  pairFilter: string;
  onPairFilterChange: (filter: string) => void;
  onDealClick: (deal: MarketDeal) => void;
}

export const MarketTable = ({
  filteredDeals,
  pairFilter,
  onPairFilterChange,
  onDealClick,
}: MarketTableProps) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {["all", "META", "ETH", "SOL"].map((f) => (
            <button
              key={f}
              onClick={() => onPairFilterChange(f)}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                pairFilter === f
                  ? "bg-accent text-accent-foreground"
                  : "bg-secondary/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All Pairs" : f}
            </button>
          ))}
        </div>
        <p className="text-muted-foreground/70 text-sm">
          {filteredDeals.length} active deals
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-muted-foreground text-sm border-b border-border">
              <th className="text-left py-3 font-medium">
                Selling (you receive)
              </th>
              <th className="text-left py-3 font-medium">Buying (you send)</th>
              <th className="text-left py-3 font-medium">Status</th>
              <th className="text-center py-3 font-medium">Expires</th>
            </tr>
          </thead>
          <tbody>
            {filteredDeals.map((deal) => {
              const base = getTokenSymbol(deal.baseMint);
              const quote = getTokenSymbol(deal.quoteMint);
              // Deal creator offers BASE in exchange for QUOTE

              return (
                <tr
                  key={deal.id}
                  className="border-b border-border/50 hover:bg-secondary/20 cursor-pointer transition-colors"
                  onClick={() => onDealClick(deal)}
                >
                  <td className="py-3 text-foreground">{base}</td>
                  <td className="py-3 text-foreground">{quote}</td>
                  <td className="py-3 text-left">
                    {deal.offerCount != null && deal.offerCount > 0 ? (
                      <span className="text-foreground">
                        {deal.offerCount}{" "}
                        {deal.offerCount === 1 ? "offer" : "offers"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Open</span>
                    )}
                  </td>
                  <td className="py-3 text-center">
                    <span
                      className={
                        isUrgent(deal.expiresAt)
                          ? "text-yellow-400"
                          : "text-muted-foreground"
                      }
                    >
                      {formatTimeRemaining(deal.expiresAt)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-3 bg-secondary/30 rounded-md text-sm text-muted-foreground">
        Click a row to view deal details and make an offer.
      </div>
    </div>
  );
};
