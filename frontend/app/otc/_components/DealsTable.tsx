import type { Deal } from "../_lib/types";
import { formatTimeRemaining } from "../_lib/format";
import { getTokenSymbol } from "../_lib/tokens";

interface DealsTableProps {
  deals: Deal[];
}

export const DealsTable = ({ deals }: DealsTableProps) => {
  if (deals.length === 0) {
    return (
      <div className="text-muted-foreground text-sm text-center py-8">
        No deals yet. Create your first deal above.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-muted-foreground text-sm border-b border-border">
            <th className="text-left py-3 pr-4 font-medium">
              Selling (you receive)
            </th>
            <th className="text-left py-3 pr-4 font-medium">
              Buying (you send)
            </th>
            <th className="text-right py-3 pr-4 font-medium">Amount</th>
            <th className="text-right py-3 pr-4 font-medium">Price</th>
            <th className="text-right py-3 pr-4 font-medium">Total</th>
            <th className="text-center py-3 pr-4 font-medium">Expires</th>
            <th className="text-left py-3 pr-4 font-medium">Status</th>
            <th className="text-center py-3 pl-4 font-medium w-px whitespace-nowrap">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {deals.map((deal) => {
            const base = getTokenSymbol(deal.baseMint);
            const quote = getTokenSymbol(deal.quoteMint);
            // Deal creator offers BASE in exchange for QUOTE

            return (
              <tr key={deal.id} className="border-b border-border/50">
                <td className="py-3 pr-4 text-foreground">{base}</td>
                <td className="py-3 pr-4 text-foreground">{quote}</td>
                <td className="py-3 pr-4 text-right text-foreground">
                  {deal.amount.toLocaleString()}
                </td>
                <td className="py-3 pr-4 text-right text-foreground">
                  {deal.price.toLocaleString()}
                </td>
                <td className="py-3 pr-4 text-right text-foreground">
                  {deal.total.toLocaleString()}
                </td>
                <td className="py-3 pr-4 text-center text-muted-foreground">
                  {deal.status === "executed"
                    ? "—"
                    : formatTimeRemaining(deal.expiresAt)}
                </td>
                <td className="py-3 pr-4 text-left">
                  {deal.status === "open" ? (
                    <span className="text-muted-foreground">
                      Open
                      {deal.offerCount != null && deal.offerCount > 0 ? (
                        <>
                          {" "}
                          ·{" "}
                          <span className="text-foreground">
                            {deal.offerCount}{" "}
                            {deal.offerCount === 1 ? "offer" : "offers"}
                          </span>
                        </>
                      ) : null}
                    </span>
                  ) : deal.status === "executed" ? (
                    <span className="text-green-500">Executed</span>
                  ) : (
                    <span className="text-muted-foreground">{deal.status}</span>
                  )}
                </td>
                <td className="py-3 pl-4 text-center align-middle w-px whitespace-nowrap">
                  {deal.status === "open" &&
                  deal.offerCount != null &&
                  deal.offerCount > 0 ? (
                    <button className="bg-success/20 hover:bg-success/30 text-success border border-success/50 px-3 py-1 text-sm rounded-md font-medium transition-colors">
                      Execute
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
