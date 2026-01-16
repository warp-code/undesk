"use client";

import { useState, useMemo } from "react";

const PAIRS = [{ base: "META", quote: "USDC", label: "META/USDC" }] as const;

type Pair = (typeof PAIRS)[number];

export default function OTCPage() {
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [selectedPair, setSelectedPair] = useState<Pair>(PAIRS[0]);
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");

  // Calculate price per unit (quote per base)
  const pricePerUnit = useMemo(() => {
    const qty = parseFloat(quantity) || 0;
    const amt = parseFloat(amount) || 0;
    if (qty === 0) return 0;
    return amt / qty;
  }, [quantity, amount]);

  // Handle amount input - allow only valid numbers
  const handleNumberInput = (
    value: string,
    setter: (val: string) => void
  ) => {
    const cleaned = value.replace(/,/g, "");
    if (cleaned === "" || /^\d*\.?\d*$/.test(cleaned)) {
      setter(cleaned);
    }
  };

  const handleSubmit = () => {
    console.log({
      mode,
      pair: selectedPair.label,
      quantity: parseFloat(quantity),
      amount: parseFloat(amount),
      pricePerUnit,
    });
  };

  const canSubmit =
    quantity && amount && parseFloat(quantity) > 0 && parseFloat(amount) > 0;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
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
              onClick={() => setMode("buy")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "buy"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => setMode("sell")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "sell"
                  ? "bg-emerald-600 text-white"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Sell
            </button>
          </div>

          {/* Pair Selector */}
          <select
            value={selectedPair.label}
            onChange={(e) => {
              const pair = PAIRS.find((p) => p.label === e.target.value);
              if (pair) setSelectedPair(pair);
            }}
            className="flex-1 bg-slate-800 border border-slate-700/50 rounded-lg px-4 py-2 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/50 cursor-pointer appearance-none"
          >
            {PAIRS.map((pair) => (
              <option key={pair.label} value={pair.label}>
                {pair.label}
              </option>
            ))}
          </select>
        </div>

        {/* Quantity Input */}
        <div className="bg-slate-800 border border-slate-700/50 rounded-lg px-4 py-3 mb-3 flex items-center">
          <input
            type="text"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => handleNumberInput(e.target.value, setQuantity)}
            placeholder="Quantity"
            className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none"
          />
          <span className="text-slate-400 text-sm font-medium ml-3">
            {selectedPair.base}
          </span>
        </div>

        {/* Amount Input */}
        <div className="bg-slate-800 border border-slate-700/50 rounded-lg px-4 py-3 mb-6 flex items-center">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => handleNumberInput(e.target.value, setAmount)}
            placeholder="Amount"
            className="flex-1 bg-transparent text-white text-sm placeholder-slate-500 outline-none"
          />
          <span className="text-slate-400 text-sm font-medium ml-3">
            {selectedPair.quote}
          </span>
        </div>

        {/* Price Display */}
        <div className="text-slate-400 text-sm mb-6">
          Price:{" "}
          {pricePerUnit > 0
            ? `${pricePerUnit.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${selectedPair.quote}/${selectedPair.base}`
            : `- ${selectedPair.quote}/${selectedPair.base}`}
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full rounded-lg py-3 text-sm font-medium transition-colors ${
            canSubmit
              ? "bg-purple-600 hover:bg-purple-700 text-white"
              : "bg-slate-700 text-slate-500 cursor-not-allowed"
          }`}
        >
          Get quote
        </button>
      </div>
    </div>
  );
}
