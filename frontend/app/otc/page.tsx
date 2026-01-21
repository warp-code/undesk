"use client";

import { useState, useMemo, useEffect, useRef } from "react";

const TOKENS = ["META", "ETH", "SOL", "USDC"] as const;
type Token = (typeof TOKENS)[number];

const PAIRS = [
  { base: "META", quote: "USDC", label: "META/USDC" },
  { base: "ETH", quote: "USDC", label: "ETH/USDC" },
  { base: "SOL", quote: "USDC", label: "SOL/USDC" },
] as const;

type Pair = (typeof PAIRS)[number];

// Token icon component
const TokenIcon = ({ token, className = "w-4 h-4" }: { token: Token; className?: string }) => {
  const icons: Record<Token, JSX.Element> = {
    META: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 4h4l4 12 4-12h4v16h-3V8.5L13.5 20h-3L7 8.5V20H4V4z" />
      </svg>
    ),
    ETH: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 1.5l-8 13 8 4.5 8-4.5-8-13zM12 22.5l-8-5.5 8 11 8-11-8 5.5z" />
      </svg>
    ),
    SOL: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 17.5h13.5l2.5-2.5H6.5L4 17.5zM4 6.5L6.5 4H20l-2.5 2.5H4zM17.5 12L20 9.5H6.5L4 12l2.5 2.5H20L17.5 12z" />
      </svg>
    ),
    USDC: (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 6v2m0 8v2m-2-10.5c2 0 3.5 1 3.5 2.5s-1.5 2.5-3.5 2.5-3.5 1-3.5 2.5 1.5 2.5 3.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  };
  return icons[token];
};

// Your Deals - deals created by user
interface Deal {
  id: string;
  type: "buy" | "sell";
  pair: string;
  amount: number;
  price: number;
  total: number;
  status: "open" | "executed" | "expired";
  isPartial: boolean;
  allowPartial: boolean;
  expiresAt: number;
  createdAt: number;
}

// Open Market - other users' deals (no price shown)
interface MarketDeal {
  id: string;
  type: "buy" | "sell";
  pair: string;
  expiresAt: number;
  createdAt: number;
  isPartial: boolean;
  // Mock data for deal details view
  size?: number;
  offerCount?: number;
}

// Your Offers - offers submitted by user
interface Offer {
  id: string;
  pair: string;
  side: "buy" | "sell";
  amount: number;
  yourPrice: number;
  submittedAt: string;
  dealStatus: "open" | "executed" | "expired";
  offerStatus: "pending" | "passed" | "partial" | "failed";
}

// Mock data
const MOCK_DEALS: Deal[] = [
  { id: "d1", type: "buy", pair: "META/USDC", amount: 4444, price: 444, total: 1973136, status: "open", isPartial: false, allowPartial: true, expiresAt: Date.now() + 83640000, createdAt: Date.now() },
  { id: "d2", type: "sell", pair: "ETH/USDC", amount: 10, price: 3200, total: 32000, status: "open", isPartial: true, allowPartial: true, expiresAt: Date.now() + 20520000, createdAt: Date.now() - 3600000 },
  { id: "d3", type: "buy", pair: "META/USDC", amount: 1000, price: 450, total: 450000, status: "executed", isPartial: true, allowPartial: false, expiresAt: 0, createdAt: Date.now() - 86400000 },
];

const MOCK_MARKET_DEALS: MarketDeal[] = [
  { id: "mkt001", type: "buy", pair: "META/USDC", expiresAt: Date.now() + 9240000, createdAt: Date.now() - 14760000, isPartial: true, size: 5000, offerCount: 3 },
  { id: "mkt002", type: "sell", pair: "META/USDC", expiresAt: Date.now() + 51720000, createdAt: Date.now() - 34680000, isPartial: false, size: 2500, offerCount: 0 },
  { id: "mkt003", type: "buy", pair: "ETH/USDC", expiresAt: Date.now() + 22140000, createdAt: Date.now() - 64260000, isPartial: true, size: 15, offerCount: 2 },
  { id: "mkt004", type: "sell", pair: "ETH/USDC", expiresAt: Date.now() + 3900000, createdAt: Date.now() - 82500000, isPartial: true, size: 8, offerCount: 4 },
  { id: "mkt005", type: "buy", pair: "SOL/USDC", expiresAt: Date.now() + 67200000, createdAt: Date.now() - 19200000, isPartial: false, size: 100, offerCount: 0 },
];

const MOCK_OFFERS: Offer[] = [
  { id: "off001", pair: "META/USDC", side: "sell", amount: 10, yourPrice: 442, submittedAt: "2h ago", dealStatus: "open", offerStatus: "pending" },
  { id: "off002", pair: "ETH/USDC", side: "sell", amount: 2, yourPrice: 3200, submittedAt: "5h ago", dealStatus: "executed", offerStatus: "passed" },
  { id: "off003", pair: "META/USDC", side: "buy", amount: 25, yourPrice: 448, submittedAt: "1d ago", dealStatus: "expired", offerStatus: "failed" },
  { id: "off004", pair: "SOL/USDC", side: "sell", amount: 50, yourPrice: 185, submittedAt: "3h ago", dealStatus: "open", offerStatus: "pending" },
  { id: "off005", pair: "ETH/USDC", side: "buy", amount: 1, yourPrice: 3150, submittedAt: "6h ago", dealStatus: "executed", offerStatus: "partial" },
];

export default function OTCPage() {
  // Create Deal form state
  const [sellToken, setSellToken] = useState<Token>("META");
  const [quoteToken, setQuoteToken] = useState<Token>("USDC");
  const [sellAmount, setSellAmount] = useState("4444");
  const [pricePerUnit, setPricePerUnit] = useState("444");
  const [expiresIn, setExpiresIn] = useState("24");
  const [allowPartial, setAllowPartial] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sellTokenDropdownOpen, setSellTokenDropdownOpen] = useState(false);
  const [quoteTokenDropdownOpen, setQuoteTokenDropdownOpen] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<"deals" | "market" | "offers">("market");
  const [deals, setDeals] = useState<Deal[]>(MOCK_DEALS);
  const [marketDeals] = useState<MarketDeal[]>(MOCK_MARKET_DEALS);
  const [offers] = useState<Offer[]>(MOCK_OFFERS);
  const [pairFilter, setPairFilter] = useState<string>("all");

  // Selected market deal for expanded view
  const [selectedMarketDeal, setSelectedMarketDeal] = useState<MarketDeal | null>(null);

  // Make Offer form state
  const [offerAmount, setOfferAmount] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [isOfferLoading, setIsOfferLoading] = useState(false);

  // Negotiation panel state
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // Tab underline animation
  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 });

  // Real-time countdown state
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!selectedMarketDeal) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [selectedMarketDeal]);

  // Update underline position when activeTab changes
  useEffect(() => {
    const activeButton = tabRefs.current[activeTab];
    if (activeButton) {
      setUnderlineStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      });
    }
  }, [activeTab]);

  // Refs for click-outside detection
  const sellDropdownRef = useRef<HTMLDivElement>(null);
  const quoteDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sellDropdownRef.current && !sellDropdownRef.current.contains(e.target as Node)) {
        setSellTokenDropdownOpen(false);
      }
      if (quoteDropdownRef.current && !quoteDropdownRef.current.contains(e.target as Node)) {
        setQuoteTokenDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // FAQ data for negotiation panel
  const faqItems = [
    {
      q: "What is an OTC RFQ?",
      a: "OTC RFQ (Request for Quote) lets you request private quotes from market makers for large trades without exposing your order to public markets."
    },
    {
      q: "How does private price discovery work?",
      a: "Your order details are encrypted. Market makers submit sealed bids that only you can see, preventing front-running and information leakage."
    },
    {
      q: "How is confidentiality preserved?",
      a: "All trade parameters are encrypted using Arcium's MPC network. Neither party sees the other's limits until a match is confirmed."
    },
    {
      q: "What happens after both sides agree?",
      a: "Once prices match, the trade executes atomically on-chain. Funds are swapped directly between wallets with no counterparty risk."
    }
  ];

  // Calculate totals
  const calculatedTotal = useMemo(() => {
    const amount = parseFloat(sellAmount) || 0;
    const price = parseFloat(pricePerUnit) || 0;
    return amount * price;
  }, [sellAmount, pricePerUnit]);

  const offerTotal = useMemo(() => {
    const amount = parseFloat(offerAmount) || 0;
    const price = parseFloat(offerPrice) || 0;
    return amount * price;
  }, [offerAmount, offerPrice]);

  // Handle number input
  const handleNumberInput = (value: string, setter: (val: string) => void) => {
    const cleaned = value.replace(/,/g, "");
    if (cleaned === "" || /^\d*\.?\d*$/.test(cleaned)) {
      setter(cleaned);
    }
  };

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
      setDeals((prev) => [newDeal, ...prev]);
      setActiveTab("deals");
      setIsLocked(false);
    }, 1000);
  };

  const handlePlaceOffer = () => {
    if (!canPlaceOffer || !selectedMarketDeal) return;
    setIsOfferLoading(true);

    setTimeout(() => {
      setIsOfferLoading(false);
      // Reset form and collapse
      setOfferAmount("");
      setOfferPrice("");
      setSelectedMarketDeal(null);
      setActiveTab("offers");
    }, 1000);
  };

  // Helper functions
  const formatTimeRemaining = (expiresAt: number) => {
    if (expiresAt === 0) return "-";
    const diff = expiresAt - Date.now();
    if (diff <= 0) return "Expired";
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const isUrgent = (expiresAt: number) => {
    const diff = expiresAt - Date.now();
    return diff > 0 && diff < 7200000;
  };

  const getPairFromLabel = (label: string): { base: string; quote: string } => {
    const [base, quote] = label.split("/");
    return { base, quote };
  };

  const getTimeProgress = (createdAt: number, expiresAt: number) => {
    const totalDuration = expiresAt - createdAt;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0 || totalDuration <= 0) return 0;
    return Math.min(100, Math.max(0, (remaining / totalDuration) * 100));
  };

  // Filter market deals
  const filteredMarketDeals =
    pairFilter === "all"
      ? marketDeals
      : marketDeals.filter((d) => d.pair.startsWith(pairFilter));

  const canSubmit =
    !isLocked &&
    sellAmount &&
    pricePerUnit &&
    expiresIn &&
    parseFloat(sellAmount) > 0 &&
    parseFloat(pricePerUnit) > 0 &&
    parseFloat(expiresIn) > 0 &&
    sellToken !== quoteToken;

  const canPlaceOffer =
    offerAmount &&
    offerPrice &&
    parseFloat(offerAmount) > 0 &&
    parseFloat(offerPrice) > 0;

  // Handle row click
  const handleMarketDealClick = (deal: MarketDeal) => {
    setSelectedMarketDeal(deal);
    setOfferAmount("");
    setOfferPrice("");
  };

  // Collapse back to table
  const handleCollapse = () => {
    setSelectedMarketDeal(null);
    setOfferAmount("");
    setOfferPrice("");
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-card/50 shrink-0">
        <div className="px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/" className="text-foreground font-semibold text-lg hover:text-primary transition-colors">Veil OTC</a>
            <div className="flex gap-4 text-sm">
              <a href="/otc" className="text-foreground font-medium">Trade</a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">History</a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">Settings</a>
            </div>
          </div>
          <button className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50 px-3 py-1.5 rounded-md font-medium text-sm transition-colors">
            Connect Wallet
          </button>
        </div>
      </nav>

      {/* Three-column layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left Panel - Create Deal or Make Offer form */}
        <div className="w-[440px] shrink-0 border-r border-border p-4 overflow-y-auto">
          <div className="bg-card/50 border border-border rounded-lg p-4">
            {/* Show Make Offer form when deal is selected, otherwise Create Deal */}
            {selectedMarketDeal ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Make Offer</h2>
                  <button
                    onClick={handleCollapse}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    aria-label="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Deal context */}
                <div className="bg-secondary/30 rounded-md px-3 py-2 mb-6">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium">{selectedMarketDeal.pair}</span>
                    <span className={selectedMarketDeal.type === "buy" ? "text-success" : "text-destructive"}>
                      {selectedMarketDeal.type === "buy" ? "Buy" : "Sell"}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      (you {selectedMarketDeal.type === "buy" ? "sell" : "buy"})
                    </span>
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
                        onChange={(e) => handleNumberInput(e.target.value, setOfferAmount)}
                        placeholder="0"
                        className="flex-1 bg-transparent text-foreground outline-none"
                      />
                      <span className="text-muted-foreground">{getPairFromLabel(selectedMarketDeal.pair).base}</span>
                    </div>
                  </div>

                  {/* Price */}
                  <div>
                    <label className="text-muted-foreground text-base mb-1 block">
                      Your price per {getPairFromLabel(selectedMarketDeal.pair).base}
                    </label>
                    <div className="bg-input rounded-md px-3 py-2 flex justify-between border border-transparent hover:border-border focus-within:border-primary hover:focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={offerPrice}
                        onChange={(e) => handleNumberInput(e.target.value, setOfferPrice)}
                        placeholder="0"
                        className="flex-1 bg-transparent text-foreground outline-none"
                      />
                      <span className="text-muted-foreground">{getPairFromLabel(selectedMarketDeal.pair).quote}</span>
                    </div>
                  </div>

                  {/* Total */}
                  <div>
                    <label className="text-muted-foreground text-base mb-1 block">
                      Total
                    </label>
                    <div className="bg-input rounded-md px-3 py-2 flex justify-between border border-transparent hover:border-border transition-colors">
                      <span className={offerTotal > 0 ? "text-foreground" : "text-muted-foreground"}>
                        {offerTotal > 0 ? offerTotal.toLocaleString() : "—"}
                      </span>
                      <span className="text-muted-foreground">{getPairFromLabel(selectedMarketDeal.pair).quote}</span>
                    </div>
                  </div>

                  {/* Helper text */}
                  <p className="text-muted-foreground/70 text-sm">
                    Your price is private. If it meets the creator&apos;s threshold, your offer will pass.
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
                      <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    )}
                    Place Offer
                  </button>
                </div>
              </>
            ) : (
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
                        onChange={(e) => handleNumberInput(e.target.value, setSellAmount)}
                        placeholder="0"
                        disabled={isLocked}
                        className="flex-1 bg-transparent text-foreground outline-none"
                      />
                      <div className="relative" ref={sellDropdownRef}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isLocked) {
                              setSellTokenDropdownOpen(!sellTokenDropdownOpen);
                              setQuoteTokenDropdownOpen(false);
                            }
                          }}
                          disabled={isLocked}
                          className="flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
                        >
                          <TokenIcon token={sellToken} className="w-4 h-4" />
                          <span>{sellToken}</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {sellTokenDropdownOpen && (
                          <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg z-10 min-w-[100px]">
                            {TOKENS.filter(t => t !== quoteToken).map((token) => (
                              <button
                                key={token}
                                onClick={() => {
                                  setSellToken(token);
                                  setSellTokenDropdownOpen(false);
                                }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors flex items-center gap-2 ${
                                  token === sellToken ? "text-primary" : "text-foreground"
                                }`}
                              >
                                <TokenIcon token={token} className="w-4 h-4" />
                                {token}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
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
                        onChange={(e) => handleNumberInput(e.target.value, setPricePerUnit)}
                        placeholder="0"
                        disabled={isLocked}
                        className="flex-1 bg-transparent text-foreground outline-none"
                      />
                      <div className="relative" ref={quoteDropdownRef}>
                        <button
                          type="button"
                          onClick={() => {
                            if (!isLocked) {
                              setQuoteTokenDropdownOpen(!quoteTokenDropdownOpen);
                              setSellTokenDropdownOpen(false);
                            }
                          }}
                          disabled={isLocked}
                          className="flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
                        >
                          <TokenIcon token={quoteToken} className="w-4 h-4" />
                          <span>{quoteToken}</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {quoteTokenDropdownOpen && (
                          <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg z-10 min-w-[100px]">
                            {TOKENS.filter(t => t !== sellToken).map((token) => (
                              <button
                                key={token}
                                onClick={() => {
                                  setQuoteToken(token);
                                  setQuoteTokenDropdownOpen(false);
                                }}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary transition-colors flex items-center gap-2 ${
                                  token === quoteToken ? "text-primary" : "text-foreground"
                                }`}
                              >
                                <TokenIcon token={token} className="w-4 h-4" />
                                {token}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
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
                        onChange={(e) => handleNumberInput(e.target.value, setExpiresIn)}
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
            )}
          </div>
        </div>

        {/* Center Panel - Tables or Deal Details */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="bg-card/50 border border-border rounded-lg">
            {/* Show Deal Details when a market deal is selected */}
            {selectedMarketDeal ? (
              <div className="p-4">
                {/* Collapse header */}
                <div
                  className="flex items-center gap-2 mb-6 cursor-pointer group"
                  onClick={handleCollapse}
                >
                  <svg
                    className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors text-sm">
                    Back to Open Market
                  </span>
                </div>

                {/* Deal Details */}
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h2 className="text-xl font-semibold text-foreground">
                        {selectedMarketDeal.pair}
                      </h2>
                      {/* Compact time remaining */}
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground text-sm">⏳</span>
                        <span className={`text-sm font-medium ${isUrgent(selectedMarketDeal.expiresAt) ? "text-yellow-400" : "text-foreground"}`}>
                          {formatTimeRemaining(selectedMarketDeal.expiresAt)}
                        </span>
                        <div className="w-24 h-1 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-muted-foreground/50 rounded-full transition-all duration-1000 ease-linear"
                            style={{ width: `${getTimeProgress(selectedMarketDeal.createdAt, selectedMarketDeal.expiresAt)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${selectedMarketDeal.type === "buy" ? "text-success" : "text-destructive"}`}>
                        {selectedMarketDeal.type === "buy" ? "Buying" : "Selling"}
                      </span>
                      <span className="text-muted-foreground">
                        (you {selectedMarketDeal.type === "buy" ? "sell" : "buy"})
                      </span>
                    </div>
                  </div>

                  {/* Deal info grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <p className="text-muted-foreground text-sm mb-1">Status</p>
                      <div className="flex items-center gap-2">
                        {selectedMarketDeal.isPartial ? (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                            has offers
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30">
                            open
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="bg-secondary/30 rounded-lg p-4">
                      <p className="text-muted-foreground text-sm mb-1">Current Offers</p>
                      <p className="text-foreground text-lg font-medium">
                        {selectedMarketDeal.offerCount || 0}
                      </p>
                    </div>
                  </div>

                  {/* Info box */}
                  <div className="bg-secondary/30 rounded-md p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-2">How it works</p>
                    <ul className="space-y-1 list-disc list-inside">
                      <li>You won&apos;t see the creator&apos;s price</li>
                      <li>Submit your best offer price</li>
                      <li>If your price meets their threshold, your offer passes</li>
                      <li>Results are revealed when the deal expires or executes</li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Tab Navigation */}
                <div className="border-b border-border px-4">
                  <div className="relative flex gap-2">
                    {/* Animated underline */}
                    <div
                      className="absolute bottom-0 h-0.5 bg-primary transition-all duration-200 ease-out"
                      style={{ left: underlineStyle.left, width: underlineStyle.width }}
                    />
                    {[
                      { id: "deals" as const, label: "Your Deals" },
                      { id: "market" as const, label: "Open Market" },
                      { id: "offers" as const, label: "Your Offers" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        ref={(el) => { tabRefs.current[tab.id] = el; }}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 font-medium transition-colors ${
                          activeTab === tab.id
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
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
                              <th className="text-left py-3 font-medium">Selling (you receive)</th>
                              <th className="text-left py-3 font-medium">Buying (you send)</th>
                              <th className="text-right py-3 font-medium">Amount</th>
                              <th className="text-right py-3 font-medium">Price</th>
                              <th className="text-right py-3 font-medium">Total</th>
                              <th className="text-center py-3 font-medium">Expires</th>
                              <th className="text-center py-3 font-medium">Status</th>
                              <th className="py-3"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {deals.map((deal) => {
                              const [base, quote] = deal.pair.split("/");
                              // For your deals: "buy" means you're buying BASE (receiving it), sending QUOTE
                              // "sell" means you're selling BASE (sending it), receiving QUOTE
                              const selling = deal.type === "buy" ? base : quote;
                              const buying = deal.type === "buy" ? quote : base;

                              return (
                                <tr key={deal.id} className="border-b border-border/50">
                                  <td className="py-3 text-foreground">{selling}</td>
                                  <td className="py-3 text-foreground">{buying}</td>
                                  <td className="py-3 text-right text-foreground">{deal.amount.toLocaleString()}</td>
                                  <td className="py-3 text-right text-foreground">{deal.price.toLocaleString()}</td>
                                  <td className="py-3 text-right text-foreground">{deal.total.toLocaleString()}</td>
                                  <td className="py-3 text-center text-muted-foreground">
                                    {deal.status === "executed" ? "—" : formatTimeRemaining(deal.expiresAt)}
                                  </td>
                                  <td className="py-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      {deal.status === "open" && (
                                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30">open</span>
                                      )}
                                      {deal.status === "executed" && (
                                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-success/20 text-success border border-success/30">executed</span>
                                      )}
                                      {deal.status === "expired" && (
                                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">expired</span>
                                      )}
                                      {deal.isPartial && deal.status === "open" && (
                                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">has offers</span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 text-right">
                                    {deal.isPartial && deal.status === "open" && (
                                      <button className="bg-success/20 hover:bg-success/30 text-success border border-success/50 px-3 py-1 text-sm rounded-md font-medium transition-colors">
                                        Execute
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* Open Market Tab */}
                  {activeTab === "market" && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex gap-2">
                          {["all", "META", "ETH", "SOL"].map((f) => (
                            <button
                              key={f}
                              onClick={() => setPairFilter(f)}
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
                          {filteredMarketDeals.length} active deals
                        </p>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="text-muted-foreground text-sm border-b border-border">
                              <th className="text-left py-3 font-medium">Selling (you receive)</th>
                              <th className="text-left py-3 font-medium">Buying (you send)</th>
                              <th className="text-center py-3 font-medium">Status</th>
                              <th className="text-center py-3 font-medium">Expires</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredMarketDeals.map((deal) => {
                              const [base, quote] = deal.pair.split("/");
                              // If deal creator is buying BASE, you're selling BASE (receiving QUOTE)
                              // If deal creator is selling BASE, you're buying BASE (sending QUOTE)
                              const selling = deal.type === "buy" ? base : quote;
                              const buying = deal.type === "buy" ? quote : base;

                              return (
                                <tr
                                  key={deal.id}
                                  className="border-b border-border/50 hover:bg-secondary/20 cursor-pointer transition-colors"
                                  onClick={() => handleMarketDealClick(deal)}
                                >
                                  <td className="py-3 text-foreground">{selling}</td>
                                  <td className="py-3 text-foreground">{buying}</td>
                                  <td className="py-3 text-center">
                                    {deal.offerCount && deal.offerCount > 0 ? (
                                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                        has offers
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30">
                                        open
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 text-center">
                                    <span className={isUrgent(deal.expiresAt) ? "text-yellow-400" : "text-muted-foreground"}>
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
                  )}

                  {/* Your Offers Tab */}
                  {activeTab === "offers" && (
                    <div>
                      <div className="overflow-x-auto">
                        {offers.length === 0 ? (
                          <div className="text-muted-foreground text-sm text-center py-8">
                            No offers submitted yet. Browse the Open Market to submit offers.
                          </div>
                        ) : (
                          <table className="w-full">
                            <thead>
                              <tr className="text-muted-foreground text-sm border-b border-border">
                                <th className="text-left py-3 font-medium">Selling (you receive)</th>
                                <th className="text-left py-3 font-medium">Buying (you send)</th>
                                <th className="text-right py-3 font-medium">Your price</th>
                                <th className="text-right py-3 font-medium">You send</th>
                                <th className="text-right py-3 font-medium">You receive</th>
                                <th className="text-center py-3 font-medium">Submitted</th>
                                <th className="text-left py-3 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {offers.map((offer) => {
                                const [base, quote] = offer.pair.split("/");
                                const total = offer.amount * offer.yourPrice;
                                const youSend = offer.side === "sell"
                                  ? `${offer.amount} ${base}`
                                  : `${total.toLocaleString()} ${quote}`;
                                const youReceive = offer.side === "sell"
                                  ? `${total.toLocaleString()} ${quote}`
                                  : `${offer.amount} ${base}`;

                                return (
                                  <tr key={offer.id} className={`border-b border-border/50 ${offer.dealStatus === "expired" && offer.offerStatus === "failed" ? "opacity-50" : ""}`}>
                                    <td className="py-3 text-foreground">{base}</td>
                                    <td className="py-3 text-foreground">{quote}</td>
                                    <td className="py-3 text-right text-foreground">{offer.yourPrice.toLocaleString()}</td>
                                    <td className="py-3 text-right text-foreground">{youSend}</td>
                                    <td className="py-3 text-right text-foreground">{youReceive}</td>
                                    <td className="py-3 text-center text-muted-foreground">{offer.submittedAt}</td>
                                    <td className="py-3 text-left">
                                      {offer.dealStatus === "open" && offer.offerStatus === "pending" ? (
                                        <span className="text-muted-foreground">Pending</span>
                                      ) : offer.dealStatus === "executed" && offer.offerStatus === "passed" ? (
                                        <span className="text-green-500">Filled</span>
                                      ) : offer.dealStatus === "executed" && offer.offerStatus === "partial" ? (
                                        <span className="text-yellow-500">Partial</span>
                                      ) : offer.dealStatus === "expired" && offer.offerStatus === "failed" ? (
                                        <span className="text-muted-foreground/50">Unfilled</span>
                                      ) : (
                                        <span className="text-muted-foreground">{offer.offerStatus}</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>

                      <div className="mt-4 p-3 bg-secondary/30 rounded-md text-sm text-muted-foreground">
                        You&apos;ll only know if your offer passed or failed once the deal concludes.
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right Panel - Negotiation */}
        <div className="shrink-0 w-[380px] border-l border-border p-4">
          <div className="bg-card/50 border border-border rounded-lg">
            {/* Content */}
            <div className="p-4 space-y-6">
              {/* Header */}
              <div className="flex items-center gap-2">
                <h4 className="text-foreground font-medium">Private Negotiation Chat</h4>
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                  Coming Soon
                </span>
              </div>

              {/* Description */}
              <p className="text-muted-foreground text-sm">
                Negotiate directly with counterparties in an encrypted chat. All messages are private and settled on-chain.
              </p>

              {/* Divider */}
              <div className="border-t border-border" />

              {/* FAQ Section */}
              <div>
                <h5 className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-3">
                  FAQ
                </h5>
                <div className="space-y-2">
                  {faqItems.map((item, index) => (
                    <div key={index} className="border border-border rounded-md overflow-hidden">
                      <button
                        onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                        className="w-full flex items-center justify-between p-3 text-left hover:bg-secondary/50 transition-colors"
                      >
                        <span className="text-foreground text-sm">{item.q}</span>
                        <svg
                          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
                            expandedFaq === index ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <div
                        className={`overflow-hidden transition-all duration-200 ${
                          expandedFaq === index ? "max-h-40" : "max-h-0"
                        }`}
                      >
                        <p className="px-3 pb-3 text-muted-foreground text-sm">
                          {item.a}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer border */}
      <div className="border-t border-border h-3 shrink-0" />
    </div>
  );
}
