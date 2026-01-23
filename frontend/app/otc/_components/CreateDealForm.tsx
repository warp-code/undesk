"use client";

import { useState, useMemo } from "react";
import { type Token, type Deal } from "../_lib/types";
import { sanitizeNumberInput } from "../_lib/format";
import { TokenDropdown } from "./TokenDropdown";

interface CreateDealFormProps {
  onDealCreated: (deal: Deal) => void;
}

export const CreateDealForm = ({ onDealCreated }: CreateDealFormProps) => {
  const [sellToken, setSellToken] = useState<Token>("META");
  const [quoteToken, setQuoteToken] = useState<Token>("USDC");
  const [sellAmount, setSellAmount] = useState("4444");
  const [pricePerUnit, setPricePerUnit] = useState("444");
  const [expiresIn, setExpiresIn] = useState("24");
  const [allowPartial, setAllowPartial] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const calculatedTotal = useMemo(() => {
    const amount = parseFloat(sellAmount) || 0;
    const price = parseFloat(pricePerUnit) || 0;
    return amount * price;
  }, [sellAmount, pricePerUnit]);

  const canSubmit =
    !isLocked &&
    sellAmount &&
    pricePerUnit &&
    expiresIn &&
    parseFloat(sellAmount) > 0 &&
    parseFloat(pricePerUnit) > 0 &&
    parseFloat(expiresIn) > 0 &&
    sellToken !== quoteToken;

  const handleSubmit = () => {
    if (!canSubmit || isLocked) return;
    setIsLocked(true);
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      const newDeal: Deal = {
        id: crypto.randomUUID().slice(0, 8),
        type: "sell",
        pair: `${sellToken}/${quoteToken}`,
        amount: parseFloat(sellAmount),
        price: parseFloat(pricePerUnit),
        total: calculatedTotal,
        status: "open",
        isPartial: false,
        allowPartial: allowPartial,
        expiresAt: Date.now() + parseFloat(expiresIn) * 3600000,
        createdAt: Date.now(),
      };
      onDealCreated(newDeal);
      setIsLocked(false);
    }, 1000);
  };

  return (
    <>
      <h2 className="text-lg font-semibold text-foreground mb-4">
        Create private OTC deal
      </h2>

      <div className="space-y-4">
        {/* You sell */}
        <div>
          <label className="text-muted-foreground text-base mb-1 block">
            You sell
          </label>
          <div className="bg-input rounded-md px-3 py-2 flex justify-between items-center border border-transparent hover:border-border focus-within:border-primary hover:focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
            <input
              type="text"
              inputMode="decimal"
              value={sellAmount}
              onChange={(e) => {
                const sanitized = sanitizeNumberInput(e.target.value);
                if (sanitized !== null) setSellAmount(sanitized);
              }}
              placeholder="0"
              disabled={isLocked}
              className="flex-1 bg-transparent text-foreground outline-none"
            />
            <TokenDropdown
              selected={sellToken}
              onSelect={setSellToken}
              exclude={quoteToken}
              disabled={isLocked}
            />
          </div>
        </div>

        {/* Price per sell token */}
        <div>
          <label className="text-muted-foreground text-base mb-1 block">
            Price per {sellToken}
          </label>
          <div className="bg-input rounded-md px-3 py-2 flex justify-between items-center border border-transparent hover:border-border focus-within:border-primary hover:focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
            <input
              type="text"
              inputMode="decimal"
              value={pricePerUnit}
              onChange={(e) => {
                const sanitized = sanitizeNumberInput(e.target.value);
                if (sanitized !== null) setPricePerUnit(sanitized);
              }}
              placeholder="0"
              disabled={isLocked}
              className="flex-1 bg-transparent text-foreground outline-none"
            />
            <TokenDropdown
              selected={quoteToken}
              onSelect={setQuoteToken}
              exclude={sellToken}
              disabled={isLocked}
            />
          </div>
        </div>

        {/* Expires in */}
        <div>
          <label className="text-muted-foreground text-base mb-1 block">
            Expires in
          </label>
          <div className="bg-input rounded-md px-3 py-2 flex justify-between border border-transparent hover:border-border focus-within:border-primary hover:focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
            <input
              type="text"
              inputMode="decimal"
              value={expiresIn}
              onChange={(e) => {
                const sanitized = sanitizeNumberInput(e.target.value);
                if (sanitized !== null) setExpiresIn(sanitized);
              }}
              placeholder="24"
              disabled={isLocked}
              className="flex-1 bg-transparent text-foreground outline-none"
            />
            <span className="text-muted-foreground">hours</span>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer group">
          <div className="relative">
            <input
              type="checkbox"
              checked={allowPartial}
              onChange={(e) => !isLocked && setAllowPartial(e.target.checked)}
              disabled={isLocked}
              className="peer sr-only"
            />
            <div className="w-4 h-4 rounded border border-muted-foreground bg-input group-hover:border-transparent peer-checked:bg-primary peer-checked:border-primary group-hover:peer-checked:border-primary peer-focus-visible:ring-1 peer-focus-visible:ring-primary/30 transition-colors" />
            <svg
              className="absolute top-0.5 left-0.5 w-3 h-3 text-primary-foreground opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={3}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span className="text-muted-foreground text-sm">Allow partial fill at expiry</span>
        </label>

        <p className="text-muted-foreground/70 text-sm">
          Market makers will respond with private quotes. Trades auto-execute
          when fully filled{allowPartial ? " or partial fills execute at expiry" : " with private viable quotes"}.
        </p>

        {/* You receive (read-only) */}
        <div>
          <label className="text-muted-foreground text-base mb-1 block">
            You receive
          </label>
          <div className="bg-input/50 rounded-md px-3 py-2 flex justify-between items-center border border-transparent">
            <span className={calculatedTotal > 0 ? "text-foreground" : "text-muted-foreground"}>
              {calculatedTotal > 0 ? calculatedTotal.toLocaleString() : "—"}
            </span>
            <span className="text-muted-foreground">{quoteToken}</span>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full py-3 rounded-md font-medium transition-colors flex items-center justify-center ${
            canSubmit
              ? "bg-primary hover:bg-primary/80 text-primary-foreground"
              : "bg-secondary text-muted-foreground cursor-not-allowed"
          }`}
        >
          {isLoading && (
            <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          Create Deal
        </button>
      </div>
    </>
  );
};
