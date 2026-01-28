"use client";

import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";

const faqs = [
  {
    question: "What is Undesk?",
    answer:
      "Undesk is a private over-the-counter trading platform built on Solana. It uses Arcium's confidential computing network to enable encrypted order matching. Your trade intentions stay completely private, even during execution.",
  },
  {
    question: "How does the privacy work?",
    answer:
      "Your trade data is encrypted end-to-end using Arcium's multi-party computation (MPC). No single party, not even the network operators, can see your order details.",
  },
  {
    question: "What tokens can I trade?",
    answer:
      "You can trade any SPL token on Solana. If you can't find your token in the list, you can simply specify its mint address, also known as Token Address (TA) or Contract Address (CA), when creating a deal.",
  },
  {
    question: "Is there a minimum trade size?",
    answer:
      "There's no minimum trade size, but Undesk is designed for larger trades where privacy and zero price impact matter most.",
  },
  {
    question: "How are trades settled?",
    answer:
      "Trades settle through encrypted execution inside the MPC network. Shared pool user balances are updated, and users may withdraw their funds at any time.",
  },
  {
    question: "How do I get started?",
    answer:
      "Connect your Solana wallet, then either create a new deal with your terms or browse and accept existing deals from other traders.",
  },
  {
    question: "How are my on-chain accounts created privately?",
    answer:
      "All deal, deposit, and balance accounts are created using deterministically derived private addresses paired with random keypairs for frontrunning protection. Accounts on mainnet will be created through a private SOL pre-deposit scheme using Privacy Cash.",
  },
  {
    question: "Can Undesk also do RFQ?",
    answer:
      "Undesk is our first step towards fully private OTC trading. We are building an RFQ system on top of Undesk that will allow you to make and receive quotes through a fully private market structure. Coming soon.",
  },
];

interface LineData {
  x: number;
  yStart: number;
  yEnd: number;
  weight: "thin" | "medium" | "thick";
  opacity: number;
  isAccent: boolean;
  accentColor: string;
}

function StaticLineBackground() {
  // SVG pattern tile: 48px wide (3 lines per tier), 300px tall (3 tiers of 100px each)
  const svgPattern = `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="300">
      <line x1="0" y1="0" x2="0" y2="100" stroke="rgba(255,255,255,0.025)" stroke-width="2"/>
      <line x1="16" y1="0" x2="16" y2="100" stroke="rgba(255,255,255,0.025)" stroke-width="2"/>
      <line x1="32" y1="0" x2="32" y2="100" stroke="rgba(255,255,255,0.025)" stroke-width="2"/>
      <line x1="5.33" y1="100" x2="5.33" y2="200" stroke="rgba(255,255,255,0.025)" stroke-width="2"/>
      <line x1="21.33" y1="100" x2="21.33" y2="200" stroke="rgba(255,255,255,0.025)" stroke-width="2"/>
      <line x1="37.33" y1="100" x2="37.33" y2="200" stroke="rgba(255,255,255,0.025)" stroke-width="2"/>
      <line x1="10.67" y1="200" x2="10.67" y2="300" stroke="rgba(255,255,255,0.025)" stroke-width="2"/>
      <line x1="26.67" y1="200" x2="26.67" y2="300" stroke="rgba(255,255,255,0.025)" stroke-width="2"/>
      <line x1="42.67" y1="200" x2="42.67" y2="300" stroke="rgba(255,255,255,0.025)" stroke-width="2"/>
    </svg>
  `;

  const encodedSvg = `data:image/svg+xml,${encodeURIComponent(svgPattern.trim())}`;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: `url("${encodedSvg}")`,
        backgroundRepeat: "repeat",
      }}
    />
  );
}

function BackgroundPattern({ activeLines }: { activeLines: Set<string> }) {
  const tierLines = useMemo(() => {
    const tiers: LineData[][] = [[], [], [], []];

    const tierConfigs = [
      { yStart: 0, yEnd: 25, spacing: 16, offset: 0 },
      { yStart: 25, yEnd: 50, spacing: 16, offset: 5.33 },
      { yStart: 50, yEnd: 75, spacing: 16, offset: 10.67 },
      { yStart: 75, yEnd: 100, spacing: 16, offset: 0 },
    ];

    // Use a fixed width for calculations (will scale with viewBox)
    const width = 600;

    tierConfigs.forEach((config, tierIdx) => {
      const lineCount = Math.floor(width / config.spacing);

      for (let i = 0; i < lineCount; i++) {
        const x = config.offset + i * config.spacing;
        const xPercent = x / width;

        // Calculate opacity for fade-in zone (first 20%)
        let opacity = 1;
        if (xPercent < 0.2) {
          opacity = xPercent / 0.2;
        }

        // Random weight distribution: 60% thin, 30% medium, 10% thick
        const rand = Math.random();
        let weight: "thin" | "medium" | "thick" = "thin";
        if (rand > 0.9) weight = "thick";
        else if (rand > 0.6) weight = "medium";

        // No fixed accent lines - all white by default, orange only when active
        const isAccent = false;
        const accentColor = "";

        tiers[tierIdx].push({
          x,
          yStart: config.yStart,
          yEnd: config.yEnd,
          weight,
          opacity,
          isAccent,
          accentColor,
        });
      }
    });
    return tiers;
  }, []);

  const getLineKey = (tierIdx: number, lineIdx: number) =>
    `${tierIdx}-${lineIdx}`;

  // 1.5x stroke widths from v12 spec
  const getStrokeWidth = (
    line: { weight: string; isAccent: boolean },
    isActive: boolean
  ) => {
    if (isActive) return 2.5;
    if (line.isAccent) return 1.2;
    if (line.weight === "thick") return 1.0;
    if (line.weight === "medium") return 0.7;
    return 0.4;
  };

  return (
    <svg
      className="absolute top-0 right-0 bottom-0 w-1/2 h-full"
      viewBox="0 0 600 600"
      preserveAspectRatio="none"
      style={{ pointerEvents: "none" }}
    >
      {tierLines.map((tier, tierIdx) =>
        tier.map((line, lineIdx) => {
          const key = getLineKey(tierIdx, lineIdx);
          const isActive = activeLines.has(key);

          let strokeColor = `rgba(255,255,255,${line.opacity * 0.7})`;
          if (isActive) {
            strokeColor = "#f97316";
          } else if (line.isAccent) {
            strokeColor = line.accentColor;
          }

          return (
            <line
              key={key}
              x1={line.x}
              y1={`${line.yStart}%`}
              x2={line.x}
              y2={`${line.yEnd}%`}
              stroke={strokeColor}
              strokeWidth={getStrokeWidth(line, isActive)}
              strokeLinecap="round"
              style={{
                filter: isActive
                  ? "drop-shadow(0 0 4px #f97316) drop-shadow(0 0 8px #f97316)"
                  : "none",
                transition: "stroke 0.3s ease, stroke-width 0.3s ease",
              }}
            />
          );
        })
      )}
    </svg>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [answer]);

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 flex items-center justify-between text-left group cursor-pointer"
      >
        <span className="font-medium text-foreground">{question}</span>
        <svg
          className={`w-4 h-4 transition-all duration-300 ease-out group-hover:text-primary ${
            isOpen ? "text-primary" : "text-muted-foreground"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 5v14"
            className={`transition-opacity duration-300 ${isOpen ? "opacity-0" : "opacity-100"}`}
          />
        </svg>
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ maxHeight: isOpen ? contentHeight : 0 }}
      >
        <div className="pb-6 text-muted-foreground text-base">{answer}</div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [activeLines, setActiveLines] = useState<Set<string>>(new Set());

  const getLineKey = (tierIdx: number, lineIdx: number) =>
    `${tierIdx}-${lineIdx}`;

  // Idle animation - "deal matching" sequence
  useEffect(() => {
    const runSequence = () => {
      const t1 = Math.floor(Math.random() * 4);
      const t2 = (t1 + 1 + Math.floor(Math.random() * 3)) % 4;
      const l1 = Math.floor(Math.random() * 30) + 7;
      const l2 = Math.floor(Math.random() * 30) + 7;
      const key1 = getLineKey(t1, l1);
      const key2 = getLineKey(t2, l2);

      // Line 1 lights up (searching for deal)
      setActiveLines((prev) => new Set([...prev, key1]));

      // After delay, line 2 blinks twice (deal accepted)
      setTimeout(() => {
        // First blink on
        setActiveLines((prev) => new Set([...prev, key2]));

        // First blink off
        setTimeout(() => {
          setActiveLines((prev) => {
            const next = new Set(prev);
            next.delete(key2);
            return next;
          });

          // Second blink on
          setTimeout(() => {
            setActiveLines((prev) => new Set([...prev, key2]));

            // Both turn off together
            setTimeout(() => {
              setActiveLines((prev) => {
                const next = new Set(prev);
                next.delete(key1);
                next.delete(key2);
                return next;
              });
            }, 800);
          }, 120);
        }, 150);
      }, 600);
    };

    const interval = setInterval(runSequence, 3500);
    runSequence(); // Run immediately on mount

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Navbar */}
      <nav className="relative z-50 bg-background py-4 shrink-0 border-b border-border">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <span className="text-foreground font-semibold text-lg">Undesk</span>

          {/* Center Nav Links */}
          <div className="flex gap-8 text-sm">
            <a
              href="#how-it-works"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              How it works
            </a>
            <a
              href="#security"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Security
            </a>
            <a
              href="#faq"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQ
            </a>
          </div>

          {/* CTA Button */}
          <Link
            href="/otc"
            className="bg-secondary border border-border hover:bg-muted text-foreground px-5 py-2 rounded-lg font-medium text-sm transition-colors"
          >
            Launch App
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative h-[500px] flex flex-col justify-center overflow-hidden">
        {/* Background Pattern */}
        <BackgroundPattern activeLines={activeLines} />

        {/* Hero Content - aligned with navbar container */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 w-full mt-16 pointer-events-none">
          <div className="max-w-2xl space-y-6 pointer-events-auto">
            <p className="text-sm text-muted-foreground">Powered by Arcium</p>
            <h1 className="text-5xl font-bold text-foreground">
              Private peer-to-peer OTC trading
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Execute large trades with complete privacy.
              <br />
              No slippage, no front-running, no information leakage.
            </p>
            <div className="pt-2">
              <Link
                href="/otc"
                className="btn-primary-glow text-primary-foreground px-4 py-2 rounded-lg font-medium text-base inline-flex items-center gap-2 group"
              >
                Start Trading
                <span className="text-base transition-transform duration-200 group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* OTC Comparison Section */}
      <section
        id="how-it-works"
        className="py-32 relative overflow-hidden"
      >
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <h2 className="text-3xl font-bold text-foreground text-center mb-2">
            The OTC desk without third parties
          </h2>
          <p className="text-muted-foreground text-center mb-24">
            Don't rely on others to execute large trades for you.
            <br />
            Undesk makes private deals possible without the middlemen.
          </p>
          <div className="grid md:grid-cols-[1fr_auto_1fr] gap-12 max-w-[900px] mx-auto">
            {/* Traditional OTC */}
            <div className="text-center">
              <h3 className="text-2xl font-semibold text-foreground mb-8">
                Traditional OTC
              </h3>
              <ul className="inline-block text-left">
                <li className="flex items-start gap-3 py-4 border-b border-border/50">
                  <svg
                    className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span className="text-muted-foreground">
                    <span className="text-foreground/70">Third parties</span>{" "}
                    hold your funds
                  </span>
                </li>
                <li className="flex items-start gap-3 py-4 border-b border-border/50">
                  <svg
                    className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span className="text-muted-foreground">
                    Requires{" "}
                    <span className="text-foreground/70">
                      trust in intermediaries
                    </span>
                  </span>
                </li>
                <li className="flex items-start gap-3 py-4">
                  <svg
                    className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  <span className="text-muted-foreground">
                    Risk of{" "}
                    <span className="text-foreground/70">
                      information disclosure
                    </span>
                  </span>
                </li>
              </ul>
            </div>

            {/* Vertical Divider */}
            <div className="hidden md:flex flex-col items-center">
              <div className="w-px h-full bg-border" />
            </div>

            {/* Undesk - with subtle glow background */}
            <div className="text-center relative">
              {/* Ambient glow background */}
              <div
                className="absolute -inset-8 -z-10 rounded-3xl"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(249,115,22,0.08) 0%, transparent 70%)",
                }}
              />
              <h3 className="text-2xl font-semibold text-foreground mb-8">
                Undesk
              </h3>
              <ul className="inline-block text-left">
                <li className="flex items-start gap-3 py-4 border-b border-primary/20">
                  <svg
                    className="w-5 h-5 text-primary shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-foreground">
                    <span className="text-primary">Full control</span> of your
                    funds
                  </span>
                </li>
                <li className="flex items-start gap-3 py-4 border-b border-primary/20">
                  <svg
                    className="w-5 h-5 text-primary shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-foreground">
                    <span className="text-primary">Trustless</span> on-chain
                    trading
                  </span>
                </li>
                <li className="flex items-start gap-3 py-4">
                  <svg
                    className="w-5 h-5 text-primary shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <span className="text-foreground">
                    <span className="text-primary">Encrypted</span>, private
                    execution
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-32 bg-card relative overflow-hidden">
        <StaticLineBackground />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <h2 className="text-3xl font-bold text-foreground text-center mb-2">
            How It Works
          </h2>
          <p className="text-muted-foreground text-center mb-12">
            Posting, matching, and settlement - everything is encrypted.
          </p>

          <div className="space-y-12">
            {/* Headers Row */}
            <div className="grid md:grid-cols-2 gap-24">
              <div className="grid grid-cols-[24px_1fr] gap-4 items-start">
                <div></div>
                <h3 className="text-xl font-semibold text-foreground">
                  For Deal Creators
                </h3>
              </div>
              <div className="grid grid-cols-[24px_1fr] gap-4 items-start">
                <div></div>
                <h3 className="text-xl font-semibold text-foreground">
                  For Offerors (Makers)
                </h3>
              </div>
            </div>

            {/* Step 1 Row */}
            <div className="grid md:grid-cols-2 gap-24">
              <div className="grid grid-cols-[24px_1fr] gap-4 items-start">
                <div className="flex justify-end items-start gap-1">
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">
                    Post your deal
                  </h4>
                  <p className="text-muted-foreground text-base leading-relaxed">
                    Define your trade: assets, size, and your price. Deposit
                    funds. Everything is encrypted before it leaves your wallet.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-[24px_1fr] gap-4 items-start">
                <div className="flex justify-end items-start gap-1">
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">
                    Browse open deals
                  </h4>
                  <p className="text-muted-foreground text-base leading-relaxed">
                    See available deals and their assets. You won&apos;t see
                    price or size, only what you need to decide if you&apos;re
                    interested.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2 Row */}
            <div className="grid md:grid-cols-2 gap-24">
              <div className="grid grid-cols-[24px_1fr] gap-4 items-start">
                <div className="flex justify-end items-start gap-1">
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">
                    Receive blind offers
                  </h4>
                  <p className="text-muted-foreground text-base leading-relaxed">
                    Counterparties submit offers without seeing your price or
                    size. Offers that don&apos;t meet your threshold are
                    rejected without information leaks.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-[24px_1fr] gap-4 items-start">
                <div className="flex justify-end items-start gap-1">
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">
                    Submit your offer
                  </h4>
                  <p className="text-muted-foreground text-base leading-relaxed">
                    Make a blind offer with your desired price and size. If your
                    offer passes the creator&apos;s threshold, it gets silently
                    added to the deal.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3 Row */}
            <div className="grid md:grid-cols-2 gap-24">
              <div className="grid grid-cols-[24px_1fr] gap-4 items-start">
                <div className="flex justify-end items-start gap-1">
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">
                    Execute the deal
                  </h4>
                  <p className="text-muted-foreground text-base leading-relaxed">
                    Once enough valid offers arrive, the trade is executed.
                    Settlement is on-chain and private. You always get your
                    price or better.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-[24px_1fr] gap-4 items-start">
                <div className="flex justify-end items-start gap-1">
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                  <div
                    className="w-0.5 h-8 bg-primary rounded-full"
                    style={{
                      boxShadow: "0 0 8px #f97316, 0 0 16px #f97316",
                    }}
                  />
                </div>
                <div>
                  <h4 className="font-medium text-foreground mb-2">
                    Get matched
                  </h4>
                  <p className="text-muted-foreground text-base leading-relaxed">
                    If the deal executes and your offer matches, you receive
                    exactly your desired price or better. If it doesn&apos;t,
                    your funds are returned.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-32">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-24 items-start">
            {/* Left column - header and text */}
            <div className="pt-6">
              <h2 className="text-3xl font-bold text-foreground mb-6">
                End-to-end privacy and security
              </h2>
              <p className="text-muted-foreground">
                Powered by Arcium&apos;s confidential computing network. Your
                trades are encrypted and processed using multi-party
                computation.{" "}
                <span className="text-foreground">
                  No single party ever sees your data.
                </span>
              </p>

              {/* Link */}
              <a
                href="#"
                className="inline-flex items-center gap-2 text-primary hover:text-primary/80 transition-colors mt-8 group text-sm"
              >
                <span>Protocol details</span>
                <span className="transition-transform duration-200 group-hover:translate-x-1">
                  &rarr;
                </span>
              </a>
            </div>

            {/* Right column - feature list */}
            <div>
              {/* Feature 1 */}
              <div className="flex items-start gap-4 border-b border-border py-6">
                <div className="w-6 h-6 shrink-0 mt-0.5">
                  <svg
                    className="w-6 h-6 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    style={{
                      filter:
                        "drop-shadow(0 0 8px #f97316) drop-shadow(0 0 16px #f97316)",
                    }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Private by design.
                  </p>
                  <p className="text-muted-foreground text-base mt-1">
                    Fully on-chain, non-custodial trading that never ties back
                    to your wallet.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="flex items-start gap-4 border-b border-border py-6">
                <div className="w-6 h-6 shrink-0 mt-0.5">
                  <svg
                    className="w-6 h-6 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    style={{
                      filter:
                        "drop-shadow(0 0 8px #f97316) drop-shadow(0 0 16px #f97316)",
                    }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Everything is encrypted.
                  </p>
                  <p className="text-muted-foreground text-base mt-1">
                    Deals, offers, balances: all data and execution is
                    end-to-end encrypted by Arcium&apos;s MPC network.
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="flex items-start gap-4 py-6">
                <div className="w-6 h-6 shrink-0 mt-0.5">
                  <svg
                    className="w-6 h-6 text-primary"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    style={{
                      filter:
                        "drop-shadow(0 0 8px #f97316) drop-shadow(0 0 16px #f97316)",
                    }}
                  >
                    <circle cx="12" cy="12" r="9" />
                    <ellipse cx="12" cy="12" rx="4" ry="9" />
                    <path d="M3 12h18" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Full self-custody.
                  </p>
                  <p className="text-muted-foreground text-base mt-1">
                    All funds are escrowed on-chain through private shared
                    pools, always retrievable.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-32">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-foreground text-center mb-6">
            FAQ
          </h2>
          <p className="text-muted-foreground text-center mb-16">
            Everything you need to know about Undesk
          </p>
          <div className="border-t border-border">
            {faqs.map((faq, index) => (
              <FAQItem
                key={index}
                question={faq.question}
                answer={faq.answer}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Line Divider */}
      <div className="w-full py-16">
        <div
          className="w-full h-24"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0px, rgba(255,255,255,0.2) 1px, transparent 1px, transparent 18px)",
            backgroundSize: "18px 100%",
          }}
        />
      </div>

      {/* Footer */}
      <footer>
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="flex justify-between items-start">
            {/* Brand */}
            <div>
              <span className="text-foreground font-semibold text-lg block mb-4">
                Undesk
              </span>
              <p className="text-base text-muted-foreground">
                Private OTC trading on Solana
              </p>
            </div>

            {/* Links */}
            <div className="flex gap-16">
              {/* Product Links */}
              <div>
                <h4 className="font-semibold text-foreground mb-4">Product</h4>
                <ul className="space-y-3 text-base text-muted-foreground">
                  <li>
                    <a
                      href="#how-it-works"
                      className="hover:text-foreground transition-colors"
                    >
                      How it works
                    </a>
                  </li>
                  <li>
                    <a
                      href="#security"
                      className="hover:text-foreground transition-colors"
                    >
                      Security
                    </a>
                  </li>
                  <li>
                    <a
                      href="#faq"
                      className="hover:text-foreground transition-colors"
                    >
                      FAQ
                    </a>
                  </li>
                </ul>
              </div>

              {/* Resources Links */}
              <div>
                <h4 className="font-semibold text-foreground mb-4">
                  Resources
                </h4>
                <ul className="space-y-3 text-base text-muted-foreground">
                  <li>
                    <a
                      href="#"
                      className="hover:text-foreground transition-colors"
                    >
                      Documentation
                    </a>
                  </li>
                  <li>
                    <a
                      href="#"
                      className="hover:text-foreground transition-colors"
                    >
                      GitHub
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border">
          <div className="max-w-6xl mx-auto px-6 py-8 text-base text-muted-foreground text-right">
            <p>© {new Date().getFullYear()} Undesk</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
