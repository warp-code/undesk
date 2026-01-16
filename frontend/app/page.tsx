"use client";

import { useState, useMemo } from "react";

const TOKENS = ["META", "USDC"] as const;
type Token = (typeof TOKENS)[number];

export default function OTCPage() {
  const [mode, setMode] = useState<"buy" | "sell">("sell");
  const [sellToken, setSellToken] = useState<Token>("USDC");
  const [sellAmount, setSellAmount] = useState("");
  const [buyToken, setBuyToken] = useState<Token>("META");
  const [buyAmount, setBuyAmount] = useState("");

  // Calculate price per unit (quote token per base token)
  const pricePerUnit = useMemo(() => {
    const sell = parseFloat(sellAmount) || 0;
    const buy = parseFloat(buyAmount) || 0;
    if (buy === 0) return 0;
    return sell / buy;
  }, [sellAmount, buyAmount]);

  // Format number with commas
  const formatNumber = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "";
    return num.toLocaleString("en-US");
  };

  // Handle amount input - allow only valid numbers
  const handleAmountChange = (
    value: string,
    setter: (val: string) => void
  ) => {
    // Remove commas for processing
    const cleaned = value.replace(/,/g, "");
    // Allow empty, or valid positive numbers
    if (cleaned === "" || /^\d*\.?\d*$/.test(cleaned)) {
      setter(cleaned);
    }
  };

  const handleSubmit = () => {
    console.log({
      mode,
      sellToken,
      sellAmount: parseFloat(sellAmount),
      buyToken,
      buyAmount: parseFloat(buyAmount),
      pricePerUnit,
    });
  };

  const canSubmit =
    sellAmount && buyAmount && parseFloat(sellAmount) > 0 && parseFloat(buyAmount) > 0;

  return (
    <div className="min-h-screen bg-gray-100 bg-dots flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-md">
        {/* Buy/Sell Toggle */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setMode("buy")}
            className={`flex-1 rounded-full py-3 font-semibold text-lg transition-colors ${
              mode === "buy"
                ? "bg-cyan-400 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => setMode("sell")}
            className={`flex-1 rounded-full py-3 font-semibold text-lg transition-colors ${
              mode === "sell"
                ? "bg-cyan-400 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Sell
          </button>
        </div>

        {/* Selling Section */}
        <div className="mb-6">
          <label className="block text-gray-700 mb-3 text-lg">
            I&apos;m {mode === "sell" ? "selling" : "paying"}
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              inputMode="decimal"
              value={formatNumber(sellAmount)}
              onChange={(e) => handleAmountChange(e.target.value, setSellAmount)}
              placeholder="0"
              className="flex-1 rounded-full px-6 py-4 bg-cyan-300 text-gray-900 text-xl font-medium text-center focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-500"
            />
            <select
              value={sellToken}
              onChange={(e) => setSellToken(e.target.value as Token)}
              className="rounded-full px-6 py-4 bg-cyan-300 text-gray-900 text-xl font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer appearance-none text-center min-w-[110px]"
            >
              {TOKENS.map((token) => (
                <option key={token} value={token}>
                  {token}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Receiving Section */}
        <div className="mb-6">
          <label className="block text-gray-700 mb-3 text-lg">For</label>
          <div className="flex gap-3">
            <input
              type="text"
              inputMode="decimal"
              value={formatNumber(buyAmount)}
              onChange={(e) => handleAmountChange(e.target.value, setBuyAmount)}
              placeholder="0"
              className="flex-1 rounded-full px-6 py-4 bg-cyan-300 text-gray-900 text-xl font-medium text-center focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-500"
            />
            <select
              value={buyToken}
              onChange={(e) => setBuyToken(e.target.value as Token)}
              className="rounded-full px-6 py-4 bg-cyan-300 text-gray-900 text-xl font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer appearance-none text-center min-w-[110px]"
            >
              {TOKENS.map((token) => (
                <option key={token} value={token}>
                  {token}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Price Display */}
        <div className="text-gray-600 text-lg mb-8">
          Price:{" "}
          {pricePerUnit > 0
            ? `${pricePerUnit.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${sellToken}/${buyToken}`
            : `- ${sellToken}/${buyToken}`}
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-full py-4 bg-green-400 hover:bg-green-500 text-white font-semibold text-xl transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Place request
        </button>
      </div>
    </div>
  );
}
