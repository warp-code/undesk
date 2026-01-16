"use client";

import { useState, useMemo, useEffect } from "react";

const PAIRS = [{ base: "META", quote: "USDC", label: "META/USDC" }] as const;

type Pair = (typeof PAIRS)[number];

interface Quote {
  id: string;
  price: number;
  size: number;
  expiresAt: number;
  status: "pending" | "accepted" | "rejected" | "expired";
}

// Mock quote data generator
const generateMockQuotes = (basePrice: number): Quote[] => [
  {
    id: "1",
    price: basePrice * (1 + 0.004),
    size: 10000,
    expiresAt: Date.now() + 25000,
    status: "pending",
  },
  {
    id: "2",
    price: basePrice * (1 - 0.004),
    size: 15000,
    expiresAt: Date.now() + 20000,
    status: "pending",
  },
  {
    id: "3",
    price: basePrice * (1 + 0.01),
    size: 8000,
    expiresAt: Date.now() + 15000,
    status: "pending",
  },
];

export default function OTCPage() {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [selectedPair, setSelectedPair] = useState<Pair>(PAIRS[0]);
  const [baseAmount, setBaseAmount] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [, setTick] = useState(0); // Force re-render for countdown

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

    // Simulate network delay before quotes arrive
    setTimeout(() => {
      setIsLoading(false);
      const basePrice = parseFloat(pricePerUnit) || 5;
      setQuotes(generateMockQuotes(basePrice));
    }, 2000);
  };

  // Expiry countdown effect
  useEffect(() => {
    if (quotes.length === 0) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1); // Force re-render

      setQuotes((prev) =>
        prev.map((q) => {
          if (q.status !== "pending") return q;
          if (Date.now() > q.expiresAt) {
            return { ...q, status: "expired" };
          }
          return q;
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [quotes.length]);

  const handleAcceptQuote = (id: string) => {
    setQuotes((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: "accepted" } : q))
    );
  };

  const handleRejectQuote = (id: string) => {
    setQuotes((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: "rejected" } : q))
    );
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

  // Get remaining seconds for a quote
  const getExpirySeconds = (expiresAt: number) => {
    const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    return remaining;
  };

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

      {/* Quotes Section */}
      {isLocked && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md mt-4">
          <h2 className="text-white text-lg font-semibold mb-4">Quotes</h2>

          {isLoading || quotes.length === 0 ? (
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
              Waiting for market makers…
            </div>
          ) : (
            <div className="space-y-3">
              {quotes.map((quote) => {
                const expirySeconds = getExpirySeconds(quote.expiresAt);
                const isExpired = quote.status === "expired";
                const isAccepted = quote.status === "accepted";
                const isRejected = quote.status === "rejected";
                const isPending = quote.status === "pending";

                return (
                  <div
                    key={quote.id}
                    className={`bg-slate-800/50 border rounded-xl p-4 transition-all ${
                      isAccepted
                        ? "border-emerald-500/50"
                        : isExpired || isRejected
                          ? "border-slate-700/30 opacity-50"
                          : "border-slate-700/50"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-white font-medium">
                          {quote.price.toLocaleString("en-US", {
                            maximumFractionDigits: 4,
                          })}{" "}
                          {selectedPair.quote}/{selectedPair.base}
                        </div>
                        <div className="text-slate-400 text-sm">
                          {quote.size.toLocaleString("en-US")}{" "}
                          {selectedPair.base} available
                        </div>
                      </div>
                      <div
                        className={`text-xs font-medium ${
                          isAccepted
                            ? "text-emerald-400"
                            : isRejected
                              ? "text-slate-500"
                              : isExpired
                                ? "text-red-400"
                                : expirySeconds <= 5
                                  ? "text-red-400"
                                  : "text-amber-400"
                        }`}
                      >
                        {isAccepted
                          ? "Accepted"
                          : isRejected
                            ? "Rejected"
                            : isExpired
                              ? "Expired"
                              : `Expires in ${expirySeconds}s`}
                      </div>
                    </div>

                    {isPending && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptQuote(quote.id)}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-sm font-medium transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleRejectQuote(quote.id)}
                          className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg py-2 text-sm font-medium transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
