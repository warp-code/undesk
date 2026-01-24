"use client";

import { useState, useMemo } from "react";
import type { MarketDeal } from "../_lib/types";
import { sanitizeNumberInput } from "../_lib/format";
import { getTokenSymbol } from "../_lib/tokens";

interface MakeOfferFormProps {
  deal: MarketDeal;
  onOfferPlaced: () => void;
  onClose: () => void;
}

export const MakeOfferForm = ({
  deal,
  onOfferPlaced,
  onClose,
}: MakeOfferFormProps) => {
  const [offerAmount, setOfferAmount] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [isOfferLoading, setIsOfferLoading] = useState(false);

  const offerTotal = useMemo(() => {
    const amount = parseFloat(offerAmount) || 0;
    const price = parseFloat(offerPrice) || 0;
    return amount * price;
  }, [offerAmount, offerPrice]);

  const canPlaceOffer =
    offerAmount &&
    offerPrice &&
    parseFloat(offerAmount) > 0 &&
    parseFloat(offerPrice) > 0;

  const handlePlaceOffer = () => {
    if (!canPlaceOffer) return;
    setIsOfferLoading(true);

    setTimeout(() => {
      setIsOfferLoading(false);
      onOfferPlaced();
    }, 1000);
  };

  const base = getTokenSymbol(deal.baseMint);
  const quote = getTokenSymbol(deal.quoteMint);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Make Offer</h2>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Deal context */}
      <div className="bg-secondary/30 rounded-md px-3 py-2 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Offering</span>
          <span className="text-success font-medium">{base}</span>
          <span className="text-muted-foreground">for {quote}</span>
        </div>
      </div>

      <div className="space-y-4">
        {/* Amount */}
        <div>
          <label className="text-muted-foreground text-base mb-1 block">
            Amount
          </label>
          <div className="bg-input rounded-md px-3 py-2 flex justify-between border border-transparent hover:border-border focus-within:border-primary hover:focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
            <input
              type="text"
              inputMode="decimal"
              value={offerAmount}
              onChange={(e) => {
                const sanitized = sanitizeNumberInput(e.target.value);
                if (sanitized !== null) setOfferAmount(sanitized);
              }}
              placeholder="0"
              className="flex-1 bg-transparent text-foreground outline-none"
            />
            <span className="text-muted-foreground">{base}</span>
          </div>
        </div>

        {/* Price */}
        <div>
          <label className="text-muted-foreground text-base mb-1 block">
            Your price per {base}
          </label>
          <div className="bg-input rounded-md px-3 py-2 flex justify-between border border-transparent hover:border-border focus-within:border-primary hover:focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
            <input
              type="text"
              inputMode="decimal"
              value={offerPrice}
              onChange={(e) => {
                const sanitized = sanitizeNumberInput(e.target.value);
                if (sanitized !== null) setOfferPrice(sanitized);
              }}
              placeholder="0"
              className="flex-1 bg-transparent text-foreground outline-none"
            />
            <span className="text-muted-foreground">{quote}</span>
          </div>
        </div>

        {/* Total */}
        <div>
          <label className="text-muted-foreground text-base mb-1 block">
            Total
          </label>
          <div className="bg-input rounded-md px-3 py-2 flex justify-between border border-transparent hover:border-border transition-colors">
            <span
              className={
                offerTotal > 0 ? "text-foreground" : "text-muted-foreground"
              }
            >
              {offerTotal > 0 ? offerTotal.toLocaleString() : "—"}
            </span>
            <span className="text-muted-foreground">{quote}</span>
          </div>
        </div>

        {/* Helper text */}
        <p className="text-muted-foreground/70 text-sm">
          Your price is private. If it meets the creator&apos;s threshold, your
          offer will pass.
        </p>

        {/* Place Offer Button */}
        <button
          onClick={handlePlaceOffer}
          disabled={!canPlaceOffer}
          className={`w-full py-3 rounded-md font-medium transition-colors flex items-center justify-center ${
            canPlaceOffer
              ? "bg-primary hover:bg-primary/80 text-primary-foreground"
              : "bg-secondary text-muted-foreground cursor-not-allowed"
          }`}
        >
          {isOfferLoading && (
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
          Place Offer
        </button>
      </div>
    </>
  );
};
