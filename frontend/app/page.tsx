"use client";

import { useState, useMemo } from "react";

const PAIRS = [
  { base: "META", quote: "USDC", label: "META/USDC" },
  { base: "ETH", quote: "USDC", label: "ETH/USDC" },
  { base: "SOL", quote: "USDC", label: "SOL/USDC" },
] as const;

type Pair = (typeof PAIRS)[number];

// Your Deals - deals created by user
interface Deal {
  id: string;
  type: "buy" | "sell";
  pair: string;
  amount: number;
  price: number;
  total: number;
  status: "open" | "executed" | "expired";
  isPartial: boolean; // flips true on first valid offer
  allowPartial: boolean; // if true, execute partial fills at expiry
  expiresAt: number;
  createdAt: number;
}

// Open Market - other users' deals (no price shown)
interface MarketDeal {
  id: string;
  type: "buy" | "sell";
  pair: string;
  expiresAt: number;
  isPartial: boolean; // the only fill signal exposed publicly
}

// Your Offers - offers submitted by user
interface Offer {
  id: string;
  pair: string;
  side: "buy" | "sell";
  yourPrice: number;
  submittedAt: string;
  dealStatus: "open" | "executed" | "expired";
  offerStatus: "pending" | "passed" | "partial" | "failed";
}

// Mock data for demonstration
const MOCK_DEALS: Deal[] = [
  { id: "d1", type: "buy", pair: "META/USDC", amount: 4444, price: 444, total: 1973136, status: "open", isPartial: false, allowPartial: true, expiresAt: Date.now() + 83640000, createdAt: Date.now() },
  { id: "d2", type: "sell", pair: "ETH/USDC", amount: 10, price: 3200, total: 32000, status: "open", isPartial: true, allowPartial: true, expiresAt: Date.now() + 20520000, createdAt: Date.now() - 3600000 },
  { id: "d3", type: "buy", pair: "META/USDC", amount: 1000, price: 450, total: 450000, status: "executed", isPartial: true, allowPartial: false, expiresAt: 0, createdAt: Date.now() - 86400000 },
];

const MOCK_MARKET_DEALS: MarketDeal[] = [
  { id: "mkt001", type: "buy", pair: "META/USDC", expiresAt: Date.now() + 9240000, isPartial: true },
  { id: "mkt002", type: "sell", pair: "META/USDC", expiresAt: Date.now() + 51720000, isPartial: false },
  { id: "mkt003", type: "buy", pair: "ETH/USDC", expiresAt: Date.now() + 22140000, isPartial: true },
  { id: "mkt004", type: "sell", pair: "ETH/USDC", expiresAt: Date.now() + 3900000, isPartial: true },
  { id: "mkt005", type: "buy", pair: "SOL/USDC", expiresAt: Date.now() + 67200000, isPartial: false },
];

const MOCK_OFFERS: Offer[] = [
  { id: "off001", pair: "META/USDC", side: "sell", yourPrice: 442, submittedAt: "2h ago", dealStatus: "open", offerStatus: "pending" },
  { id: "off002", pair: "ETH/USDC", side: "sell", yourPrice: 3200, submittedAt: "5h ago", dealStatus: "executed", offerStatus: "passed" },
  { id: "off003", pair: "META/USDC", side: "buy", yourPrice: 448, submittedAt: "1d ago", dealStatus: "expired", offerStatus: "failed" },
  { id: "off004", pair: "SOL/USDC", side: "sell", yourPrice: 185, submittedAt: "3h ago", dealStatus: "open", offerStatus: "pending" },
  { id: "off005", pair: "ETH/USDC", side: "buy", yourPrice: 3150, submittedAt: "6h ago", dealStatus: "executed", offerStatus: "partial" },
];

export default function OTCPage() {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [selectedPair, setSelectedPair] = useState<Pair>(PAIRS[0]);
  const [baseAmount, setBaseAmount] = useState("4444");
  const [pricePerUnit, setPricePerUnit] = useState("444");
  const [expiresIn, setExpiresIn] = useState("24");
  const [allowPartial, setAllowPartial] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<"deals" | "market" | "offers">("market");
  const [deals, setDeals] = useState<Deal[]>(MOCK_DEALS);
  const [marketDeals] = useState<MarketDeal[]>(MOCK_MARKET_DEALS);
  const [offers] = useState<Offer[]>(MOCK_OFFERS);
  const [pairFilter, setPairFilter] = useState<string>("all");

  // Calculate the total (quote amount) from base amount * price
  const calculatedTotal = useMemo(() => {
    const base = parseFloat(baseAmount) || 0;
    const price = parseFloat(pricePerUnit) || 0;
    return base * price;
  }, [baseAmount, pricePerUnit]);

  // Handle number input - allow only valid numbers
  const handleNumberInput = (value: string, setter: (val: string) => void) => {
    if (isLocked) return;
    const cleaned = value.replace(/,/g, "");
    if (cleaned === "" || /^\d*\.?\d*$/.test(cleaned)) {
      setter(cleaned);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    setIsLocked(true);
    setIsLoading(true);

    // Simulate network delay
    setTimeout(() => {
      setIsLoading(false);
      const newDeal: Deal = {
        id: crypto.randomUUID().slice(0, 8),
        type: mode,
        pair: selectedPair.label,
        amount: parseFloat(baseAmount),
        price: parseFloat(pricePerUnit),
        total: calculatedTotal,
        status: "open",
        isPartial: false,
        allowPartial: allowPartial,
        expiresAt: Date.now() + parseFloat(expiresIn) * 3600000,
        createdAt: Date.now(),
      };
      setDeals((prev) => [newDeal, ...prev]);
      setActiveTab("deals");
      setIsLocked(false);
    }, 1000);
  };

  // Helper to format time remaining
  const formatTimeRemaining = (expiresAt: number) => {
    if (expiresAt === 0) return "-";
    const diff = expiresAt - Date.now();
    if (diff <= 0) return "Expired";
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Helper to check if urgent (< 2 hours)
  const isUrgent = (expiresAt: number) => {
    const diff = expiresAt - Date.now();
    return diff > 0 && diff < 7200000;
  };

  // Filter market deals by pair
  const filteredMarketDeals =
    pairFilter === "all"
      ? marketDeals
      : marketDeals.filter((d) => d.pair.startsWith(pairFilter));

  const canSubmit =
    !isLocked &&
    baseAmount &&
    pricePerUnit &&
    expiresIn &&
    parseFloat(baseAmount) > 0 &&
    parseFloat(pricePerUnit) > 0 &&
    parseFloat(expiresIn) > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-card/50">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            {/* Logo */}
            <div className="text-foreground font-semibold text-lg">Veil OTC</div>
            {/* Nav Links */}
            <div className="flex gap-4 text-sm">
              <a href="#" className="text-foreground font-medium">
                Trade
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                History
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                FAQ
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                Settings
              </a>
            </div>
          </div>
          {/* Connect Wallet Button */}
          <button className="bg-primary hover:bg-primary/80 text-primary-foreground px-3 py-1.5 rounded font-medium text-sm transition-colors">
            Connect Wallet
          </button>
        </div>
      </nav>

      {/* Three-column layout */}
      <div className="flex h-[calc(100vh-57px)]">
        {/* Left Panel - RFQ Form */}
        <div className="w-[440px] shrink-0 border-r border-border p-4 overflow-y-auto">
          <div className="bg-card/50 border border-border rounded-lg p-4">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Request for quote
            </h2>

            {/* Buy/Sell Toggle + Pair Selector Row */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => !isLocked && setMode("buy")}
                disabled={isLocked}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  mode === "buy"
                    ? "bg-success text-success-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => !isLocked && setMode("sell")}
                disabled={isLocked}
                className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                  mode === "sell"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                Sell
              </button>
              <div className="flex-1 bg-input rounded px-3 py-1.5 text-foreground/80 text-sm">
                {selectedPair.label}
              </div>
            </div>

            <div className="space-y-4">
              {/* Buy/Sell amount */}
              <div>
                <label className="text-muted-foreground text-sm mb-1 block">
                  {mode === "buy" ? "Buy" : "Sell"} amount
                </label>
                <div className="bg-input rounded px-3 py-2 flex justify-between">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={baseAmount}
                    onChange={(e) =>
                      handleNumberInput(e.target.value, setBaseAmount)
                    }
                    placeholder="0"
                    disabled={isLocked}
                    className="flex-1 bg-transparent text-foreground outline-none"
                  />
                  <span className="text-muted-foreground">{selectedPair.base}</span>
                </div>
              </div>

              {/* Price per unit */}
              <div>
                <label className="text-muted-foreground text-sm mb-1 block">
                  Price per {selectedPair.base}
                </label>
                <div className="bg-input rounded px-3 py-2 flex justify-between">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={pricePerUnit}
                    onChange={(e) =>
                      handleNumberInput(e.target.value, setPricePerUnit)
                    }
                    placeholder="0"
                    disabled={isLocked}
                    className="flex-1 bg-transparent text-foreground outline-none"
                  />
                  <span className="text-muted-foreground">{selectedPair.quote}</span>
                </div>
              </div>

              {/* Expires in */}
              <div>
                <label className="text-muted-foreground text-sm mb-1 block">
                  Expires in
                </label>
                <div className="bg-input rounded px-3 py-2 flex justify-between">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={expiresIn}
                    onChange={(e) =>
                      handleNumberInput(e.target.value, setExpiresIn)
                    }
                    placeholder="24"
                    disabled={isLocked}
                    className="flex-1 bg-transparent text-foreground outline-none"
                  />
                  <span className="text-muted-foreground">hours</span>
                </div>
              </div>

              {/* Allow partial fill checkbox */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowPartial}
                  onChange={(e) => !isLocked && setAllowPartial(e.target.checked)}
                  disabled={isLocked}
                  className="w-4 h-4 rounded border-border bg-input text-primary focus:ring-ring focus:ring-offset-background"
                />
                <span className="text-muted-foreground text-sm">Allow partial fill at expiry</span>
              </label>

              {/* Helper text */}
              <p className="text-muted-foreground/70 text-sm">
                Market makers will respond with quotes. Trades auto-execute when
                fully filled{allowPartial ? ", or partial fills execute at expiry" : ""}.
              </p>

              {/* Total cost */}
              <div>
                <label className="text-muted-foreground text-sm mb-1 block">
                  {mode === "buy" ? "Total cost" : "You receive"}
                </label>
                <div className="bg-input rounded px-3 py-2 flex justify-between">
                  <span className="text-foreground">
                    {calculatedTotal > 0
                      ? calculatedTotal.toLocaleString()
                      : "—"}
                  </span>
                  <span className="text-muted-foreground">{selectedPair.quote}</span>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`w-full py-3 rounded font-medium transition-colors flex items-center justify-center ${
                  canSubmit
                    ? "bg-primary hover:bg-primary/80 text-primary-foreground"
                    : "bg-secondary text-muted-foreground cursor-not-allowed"
                }`}
              >
                {isLoading && (
                  <svg
                    className="animate-spin h-4 w-4 mr-2"
                    xmlns="http://www.w3.org/2000/svg"
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
                Create Deal
              </button>
            </div>
          </div>
        </div>

        {/* Center Panel - Tables */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="bg-card/50 border border-border rounded-lg">
          {/* Tab Navigation - underline style */}
          <div className="border-b border-border px-4">
            <div className="flex gap-2">
              {[
                { id: "deals" as const, label: "Your Deals" },
                { id: "market" as const, label: "Open Market" },
                { id: "offers" as const, label: "Your Offers" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 font-medium transition-colors relative ${
                    activeTab === tab.id
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-4">
            {/* Your Deals Tab */}
            {activeTab === "deals" && (
              <div className="overflow-x-auto">
                {deals.length === 0 ? (
                  <div className="text-muted-foreground text-sm text-center py-8">
                    No deals yet. Create your first deal above.
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="text-muted-foreground text-sm border-b border-border">
                        <th className="text-left py-3 font-medium">Type</th>
                        <th className="text-left py-3 font-medium">Pair</th>
                        <th className="text-right py-3 font-medium">Amount</th>
                        <th className="text-right py-3 font-medium">Price</th>
                        <th className="text-right py-3 font-medium">Total</th>
                        <th className="text-center py-3 font-medium">Expires</th>
                        <th className="text-center py-3 font-medium">Status</th>
                        <th className="text-right py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deals.map((deal) => (
                        <tr
                          key={deal.id}
                          className="border-b border-border/50"
                        >
                          <td
                            className={`py-3 font-medium ${
                              deal.type === "buy"
                                ? "text-success"
                                : "text-destructive"
                            }`}
                          >
                            {deal.type.toUpperCase()}
                          </td>
                          <td className="py-3 text-foreground">{deal.pair}</td>
                          <td className="py-3 text-right text-foreground">
                            {deal.amount.toLocaleString()}
                          </td>
                          <td className="py-3 text-right text-foreground">
                            {deal.price.toLocaleString()}
                          </td>
                          <td className="py-3 text-right text-foreground">
                            {deal.total.toLocaleString()}
                          </td>
                          <td className="py-3 text-center text-muted-foreground">
                            {formatTimeRemaining(deal.expiresAt)}
                          </td>
                          <td className="py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {deal.status === "open" && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                                  open
                                </span>
                              )}
                              {deal.status === "executed" && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-success/20 text-success border border-success/30">
                                  executed
                                </span>
                              )}
                              {deal.status === "expired" && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                                  expired
                                </span>
                              )}
                              {deal.isPartial && deal.status === "open" && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                  has offers
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            {deal.isPartial && deal.status === "open" && (
                              <button className="bg-primary hover:bg-primary/80 text-primary-foreground px-3 py-1 text-sm rounded font-medium transition-colors">
                                Execute
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Open Market Tab */}
            {activeTab === "market" && (
              <div>
                {/* Filter and count row */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2">
                    {["all", "META", "ETH", "SOL"].map((f) => (
                      <button
                        key={f}
                        onClick={() => setPairFilter(f)}
                        className={`px-3 py-1 rounded text-sm transition-colors ${
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
                    {filteredMarketDeals.length} active deals
                  </p>
                </div>

                {/* Market deals table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-muted-foreground text-sm border-b border-border">
                        <th className="text-left py-3 font-medium">Pair</th>
                        <th className="text-left py-3 font-medium">Looking to</th>
                        <th className="text-center py-3 font-medium">Status</th>
                        <th className="text-center py-3 font-medium">Expires</th>
                        <th className="text-right py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMarketDeals.map((deal) => (
                        <tr
                          key={deal.id}
                          className="border-b border-border/50 hover:bg-secondary/20"
                        >
                          <td className="py-3 text-foreground font-medium">
                            {deal.pair}
                          </td>
                          <td className="py-3">
                            <span
                              className={
                                deal.type === "buy"
                                  ? "text-success"
                                  : "text-destructive"
                              }
                            >
                              {deal.type === "buy" ? "Buy" : "Sell"}
                            </span>
                            <span className="text-muted-foreground/70 ml-1">
                              ({deal.type === "buy" ? "you sell" : "you buy"})
                            </span>
                          </td>
                          <td className="py-3 text-center">
                            {deal.isPartial ? (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                has offers
                              </span>
                            ) : (
                              <span className="text-muted-foreground/70 text-sm">—</span>
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
                          <td className="py-3 text-right">
                            <button className="bg-secondary hover:bg-secondary/80 text-secondary-foreground px-3 py-1 text-sm rounded font-medium transition-colors">
                              Make Offer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Hint box */}
                <div className="mt-4 p-3 bg-secondary/30 rounded text-sm text-muted-foreground">
                  You won&apos;t know the deal creator&apos;s price. Submit your best
                  price — if it meets their threshold, your offer passes.
                </div>
              </div>
            )}

            {/* Your Offers Tab */}
            {activeTab === "offers" && (
              <div>
                <div className="overflow-x-auto">
                  {offers.length === 0 ? (
                    <div className="text-muted-foreground text-sm text-center py-8">
                      No offers submitted yet. Browse the Open Market to submit
                      offers.
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-muted-foreground text-sm border-b border-border">
                          <th className="text-left py-3 font-medium">Pair</th>
                          <th className="text-left py-3 font-medium">You</th>
                          <th className="text-right py-3 font-medium">
                            Your Price
                          </th>
                          <th className="text-center py-3 font-medium">
                            Submitted
                          </th>
                          <th className="text-center py-3 font-medium">
                            Deal Status
                          </th>
                          <th className="text-center py-3 font-medium">
                            Your Offer
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {offers.map((offer) => (
                          <tr
                            key={offer.id}
                            className="border-b border-border/50"
                          >
                            <td className="py-3 text-foreground font-medium">
                              {offer.pair}
                            </td>
                            <td className="py-3">
                              <span
                                className={
                                  offer.side === "sell"
                                    ? "text-destructive"
                                    : "text-success"
                                }
                              >
                                {offer.side === "sell" ? "Selling" : "Buying"}
                              </span>
                            </td>
                            <td className="py-3 text-right text-foreground">
                              {offer.yourPrice.toLocaleString()}
                            </td>
                            <td className="py-3 text-center text-muted-foreground">
                              {offer.submittedAt}
                            </td>
                            <td className="py-3 text-center">
                              {offer.dealStatus === "open" && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                                  open
                                </span>
                              )}
                              {offer.dealStatus === "executed" && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-success/20 text-success border border-success/30">
                                  executed
                                </span>
                              )}
                              {offer.dealStatus === "expired" && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                                  expired
                                </span>
                              )}
                            </td>
                            <td className="py-3 text-center">
                              {offer.offerStatus === "pending" && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                  pending
                                </span>
                              )}
                              {offer.offerStatus === "passed" && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-success/20 text-success border border-success/30">
                                  passed
                                </span>
                              )}
                              {offer.offerStatus === "partial" && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                  partial
                                </span>
                              )}
                              {offer.offerStatus === "failed" && (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                                  failed
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Hint box */}
                <div className="mt-4 p-3 bg-secondary/30 rounded text-sm text-muted-foreground">
                  You&apos;ll only know if your offer passed or failed once the
                  deal concludes (executed or expired).
                </div>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Right Panel - Chat Placeholder */}
        <div className="w-[380px] shrink-0 border-l border-border p-4 overflow-y-auto">
          <h3 className="text-foreground font-medium mb-4">Negotiation</h3>
          <div className="bg-card/50 border border-border rounded-lg p-4 h-[calc(100%-2rem)] flex items-center justify-center">
            <p className="text-muted-foreground text-sm text-center">
              Select a deal to start negotiating
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
