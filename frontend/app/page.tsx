"use client";

import { useState, useMemo } from "react";

const PAIRS = [{ base: "META", quote: "USDC", label: "META/USDC" }] as const;

type Pair = (typeof PAIRS)[number];

interface Order {
  id: string;
  type: "buy" | "sell";
  pair: string;
  amount: number;
  price: number;
  total: number;
  status: "open" | "filled" | "partial";
  createdAt: number;
}

export default function OTCPage() {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [selectedPair, setSelectedPair] = useState<Pair>(PAIRS[0]);
  const [baseAmount, setBaseAmount] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);

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
      const newOrder: Order = {
        id: crypto.randomUUID().slice(0, 8),
        type: mode,
        pair: selectedPair.label,
        amount: parseFloat(baseAmount),
        price: parseFloat(pricePerUnit),
        total: calculatedTotal,
        status: "open",
        createdAt: Date.now(),
      };
      setOrders([newOrder]);
    }, 1000);
  };

  const handleCopyLink = (orderId: string) => {
    const url = `${window.location.origin}/order/${orderId}`;
    navigator.clipboard.writeText(url);
  };

  const canSubmit =
    !isLocked &&
    baseAmount &&
    pricePerUnit &&
    parseFloat(baseAmount) > 0 &&
    parseFloat(pricePerUnit) > 0;

  // Labels based on mode
  const baseLabel = mode === "buy" ? "Buy amount" : "Sell amount";
  const totalLabel = mode === "buy" ? "Total cost" : "You receive";

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-start p-4 pt-16">
      {/* RFQ Form Card */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md">
        {/* Title */}
        <h1 className="text-white text-xl font-semibold mb-6">
          Request for quote
        </h1>

        {/* Buy/Sell Toggle + Pair Selector Row */}
        <div className="flex gap-3 mb-6">
          {/* Buy/Sell Toggle */}
          <div className="flex bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => !isLocked && setMode("buy")}
              disabled={isLocked}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "buy"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:text-slate-300"
              } ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
            >
              Buy
            </button>
            <button
              onClick={() => !isLocked && setMode("sell")}
              disabled={isLocked}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "sell"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:text-slate-300"
              } ${isLocked ? "cursor-not-allowed opacity-60" : ""}`}
            >
              Sell
            </button>
          </div>

          {/* Pair Selector */}
          <select
            value={selectedPair.label}
            onChange={(e) => {
              if (isLocked) return;
              const pair = PAIRS.find((p) => p.label === e.target.value);
              if (pair) setSelectedPair(pair);
            }}
            disabled={isLocked}
            className={`flex-1 bg-slate-800 border border-slate-700/50 rounded-lg px-4 py-2 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/50 appearance-none ${
              isLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            }`}
          >
            {PAIRS.map((pair) => (
              <option key={pair.label} value={pair.label}>
                {pair.label}
              </option>
            ))}
          </select>
        </div>

        {/* Base Amount Input (Editable) */}
        <label className="block text-slate-400 text-xs font-medium mb-2">
          {baseLabel}
        </label>
        <div
          className={`bg-slate-800 border border-slate-700/50 rounded-lg px-4 py-3 mb-4 flex items-center ${
            isLocked ? "opacity-60" : ""
          }`}
        >
          <input
            type="text"
            inputMode="decimal"
            value={baseAmount}
            onChange={(e) => handleNumberInput(e.target.value, setBaseAmount)}
            placeholder="0.00"
            disabled={isLocked}
            className={`flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none ${
              isLocked ? "cursor-not-allowed" : ""
            }`}
          />
          <span className="text-slate-400 text-sm font-medium ml-3">
            {selectedPair.base}
          </span>
        </div>

        {/* Price Per Unit Input (Editable) */}
        <label className="block text-slate-400 text-xs font-medium mb-2">
          Price per {selectedPair.base}
        </label>
        <div
          className={`bg-slate-800 border border-slate-700/50 rounded-lg px-4 py-3 mb-2 flex items-center ${
            isLocked ? "opacity-60" : ""
          }`}
        >
          <input
            type="text"
            inputMode="decimal"
            value={pricePerUnit}
            onChange={(e) => handleNumberInput(e.target.value, setPricePerUnit)}
            placeholder="0.00"
            disabled={isLocked}
            className={`flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none ${
              isLocked ? "cursor-not-allowed" : ""
            }`}
          />
          <span className="text-slate-400 text-sm font-medium ml-3">
            {selectedPair.quote}
          </span>
        </div>

        {/* Helper text */}
        <p className="text-slate-500 text-xs mb-6">
          Market makers will respond with quotes. No trade is executed until you
          accept a quote.
        </p>

        {/* Calculated Total (Read-only) */}
        <label className="block text-slate-400 text-xs font-medium mb-2">
          {totalLabel}
        </label>
        <div className="bg-slate-800/50 border border-slate-700/30 rounded-lg px-4 py-3 mb-6 flex items-center">
          <span className="flex-1 text-slate-300 text-sm">
            {calculatedTotal > 0
              ? calculatedTotal.toLocaleString("en-US", {
                  maximumFractionDigits: 6,
                })
              : "—"}
          </span>
          <span className="text-slate-400 text-sm font-medium ml-3">
            {selectedPair.quote}
          </span>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full rounded-lg py-3 text-sm font-medium transition-colors flex items-center justify-center ${
            canSubmit
              ? "bg-purple-600 hover:bg-purple-700 text-white"
              : "bg-slate-700 text-slate-500 cursor-not-allowed"
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
          {isLocked ? "Request sent" : "Place request"}
        </button>
      </div>

      {/* Orders Section */}
      {isLocked && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 w-full max-w-3xl mt-4">
          <h2 className="text-white text-lg font-semibold mb-4">Your Orders</h2>

          {isLoading || orders.length === 0 ? (
            <div className="text-slate-500 text-sm text-center py-8 flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
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
              Creating order…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 text-xs border-b border-slate-700/50">
                    <th className="text-left py-3 font-medium">Type</th>
                    <th className="text-left py-3 font-medium">Pair</th>
                    <th className="text-right py-3 font-medium">Amount</th>
                    <th className="text-right py-3 font-medium">Price</th>
                    <th className="text-right py-3 font-medium">Total</th>
                    <th className="text-center py-3 font-medium">Status</th>
                    <th className="text-right py-3 font-medium">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-slate-700/30 last:border-b-0"
                    >
                      <td className="py-3">
                        <span
                          className={
                            order.type === "buy"
                              ? "text-emerald-400 font-medium"
                              : "text-red-400 font-medium"
                          }
                        >
                          {order.type.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 text-white">{order.pair}</td>
                      <td className="py-3 text-right text-white">
                        {order.amount.toLocaleString()}
                      </td>
                      <td className="py-3 text-right text-white">
                        {order.price.toLocaleString()}
                      </td>
                      <td className="py-3 text-right text-white">
                        {order.total.toLocaleString()}
                      </td>
                      <td className="py-3 text-center">
                        <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400">
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleCopyLink(order.id)}
                          className="text-purple-400 hover:text-purple-300 text-xs font-medium"
                        >
                          Copy
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
