"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const faqs = [
  {
    question: "What is Veil OTC?",
    answer:
      "Veil OTC is a private over-the-counter trading platform built on Solana. It uses Arcium's confidential computing network to enable encrypted order matching—your trade intentions stay completely private until execution.",
  },
  {
    question: "How does the privacy work?",
    answer:
      "Your trade data is encrypted end-to-end using multi-party computation (MPC). No single party—not even the network operators—can see your order details. Only when both parties agree does the trade execute on-chain.",
  },
  {
    question: "What tokens can I trade?",
    answer:
      "You can trade any SPL token on Solana. Simply specify the token mint address when creating a deal.",
  },
  {
    question: "Is there a minimum trade size?",
    answer:
      "There's no minimum trade size, but Veil OTC is designed for larger trades where privacy and zero slippage matter most.",
  },
  {
    question: "How are trades settled?",
    answer:
      "Trades settle via atomic on-chain swaps. Both parties' tokens are exchanged in a single transaction—either the trade completes fully or it doesn't happen at all. No counterparty risk.",
  },
  {
    question: "How do I get started?",
    answer:
      "Connect your Solana wallet, then either create a new deal with your terms or browse and accept existing deals from other traders.",
  },
];

interface LineData {
  x: number;
  y1: number;
  y2: number;
  weight: "thin" | "medium" | "thick";
  isAccent: boolean;
}

function BackgroundPattern({
  activeLines,
  onLineHover,
}: {
  activeLines: Set<string>;
  onLineHover: (tierIdx: number, lineIdx: number) => void;
}) {
  const tierLines = useMemo(() => {
    const tiers: LineData[][] = [[], [], []];
    const tierConfigs = [
      { yStart: 18, yEnd: 32, xOffset: 0, spacing: 1.5 },
      { yStart: 34, yEnd: 48, xOffset: 0.75, spacing: 1.65 },
      { yStart: 50, yEnd: 64, xOffset: 1.5, spacing: 1.35 },
    ];

    tierConfigs.forEach((config, tierIdx) => {
      for (let x = 48; x <= 100; x += config.spacing) {
        const rand = Math.random();
        const weight =
          rand < 0.6 ? "thin" : rand < 0.9 ? "medium" : "thick";
        const isAccent = Math.random() < 0.03;

        tiers[tierIdx].push({
          x: x + config.xOffset,
          y1: config.yStart,
          y2: config.yEnd,
          weight,
          isAccent,
        });
      }
    });
    return tiers;
  }, []);

  const getLineKey = (tierIdx: number, lineIdx: number) =>
    `${tierIdx}-${lineIdx}`;

  const getOpacity = (x: number) => {
    if (x < 48) return 0;
    if (x < 58) return (x - 48) / 10;
    return 1;
  };

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      preserveAspectRatio="none"
      style={{ pointerEvents: "none" }}
    >
      <defs>
        <filter id="pingGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {tierLines.map((tier, tierIdx) =>
        tier.map((line, lineIdx) => {
          const key = getLineKey(tierIdx, lineIdx);
          const isActive = activeLines.has(key);
          const opacity = getOpacity(line.x);

          if (opacity === 0) return null;

          const baseOpacity = opacity * 0.4;
          let strokeColor = `rgba(255,255,255,${baseOpacity})`;
          if (isActive) {
            strokeColor = "#f97316";
          } else if (line.isAccent) {
            strokeColor = `rgba(249,115,22,${opacity * 0.6})`;
          }

          const strokeWidth = isActive
            ? 1.2
            : line.isAccent
              ? 0.5
              : line.weight === "thick"
                ? 0.4
                : line.weight === "medium"
                  ? 0.28
                  : 0.15;

          return (
            <line
              key={key}
              x1={`${line.x}%`}
              y1={`${line.y1}%`}
              x2={`${line.x}%`}
              y2={`${line.y2}%`}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              filter={isActive ? "url(#pingGlow)" : "none"}
              style={{
                transition:
                  "stroke 0.3s ease, stroke-width 0.3s ease, filter 0.3s ease",
                cursor: "pointer",
                pointerEvents: "auto",
              }}
              onMouseEnter={() => onLineHover(tierIdx, lineIdx)}
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
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-8 py-6 flex items-center justify-between text-left"
      >
        <span className="font-medium text-foreground">
          {question}
        </span>
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ease-out ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ maxHeight: isOpen ? contentHeight : 0 }}
      >
        <div className="px-8 pb-6 text-muted-foreground text-sm">{answer}</div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [activeLines, setActiveLines] = useState<Set<string>>(new Set());

  const getLineKey = (tierIdx: number, lineIdx: number) =>
    `${tierIdx}-${lineIdx}`;

  const triggerPing = useCallback((key1: string, key2: string) => {
    // First line lights up
    setActiveLines(new Set([key1]));
    // Second line after 150ms delay
    setTimeout(() => {
      setActiveLines(new Set([key1, key2]));
    }, 150);
    // Both fade out
    setTimeout(() => {
      setActiveLines(new Set());
    }, 1800);
  }, []);

  // Auto-ping every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const t1 = Math.floor(Math.random() * 3);
      const t2 = (t1 + 1 + Math.floor(Math.random() * 2)) % 3;
      const l1 = Math.floor(Math.random() * 15);
      const l2 = 20 + Math.floor(Math.random() * 15);
      triggerPing(getLineKey(t1, l1), getLineKey(t2, l2));
    }, 3000);
    return () => clearInterval(interval);
  }, [triggerPing]);

  const handleLineHover = useCallback(
    (tierIdx: number, lineIdx: number) => {
      const otherTier = (tierIdx + 1 + Math.floor(Math.random() * 2)) % 3;
      const partnerIdx =
        lineIdx < 17
          ? lineIdx + 10 + Math.floor(Math.random() * 10)
          : Math.max(0, lineIdx - 10 - Math.floor(Math.random() * 10));
      triggerPing(getLineKey(tierIdx, lineIdx), getLineKey(otherTier, partnerIdx));
    },
    [triggerPing]
  );

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Navbar */}
      <nav className="bg-background py-4 shrink-0 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-primary text-xl">⬡</span>
            <span className="text-foreground font-semibold text-lg">
              Veil OTC
            </span>
          </div>

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
      <section className="relative min-h-[70vh] flex flex-col items-start justify-center px-6 overflow-hidden">
        {/* Background Pattern */}
        <BackgroundPattern
          activeLines={activeLines}
          onLineHover={handleLineHover}
        />

        {/* Hero Content - positioned left on larger screens */}
        <div className="relative z-10 max-w-2xl text-left ml-[6%] lg:ml-[10%] space-y-6 -mt-[5vh]">
          <h1 className="text-4xl font-bold text-foreground">
            Private OTC Trading
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            Execute large trades with complete privacy. No slippage, no
            front-running, no information leakage.
          </p>
          <div className="pt-2">
            <Link
              href="/otc"
              className="btn-primary-glow text-primary-foreground px-4 py-2 rounded-lg font-medium text-sm inline-flex items-center gap-2 group"
            >
              Start Trading
              <span className="text-base transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works Section */}
      <section id="how-it-works" className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-20">
            Why Veil OTC?
          </h2>
          <div className="grid md:grid-cols-3 gap-10">
            {/* Feature 1 */}
            <div className="bg-card border border-border rounded-xl p-10">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                <span className="text-primary text-2xl">🔒</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Complete Privacy
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Encrypted order matching. Your trade intentions stay hidden
                until execution.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-card border border-border rounded-xl p-10">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                <span className="text-primary text-2xl">⚡</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Zero Slippage
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Fixed price execution. No price impact, no MEV, no
                front-running.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-card border border-border rounded-xl p-10">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                <span className="text-primary text-2xl">🔗</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">
                Trustless Settlement
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                On-chain atomic swaps. No counterparty risk, no custodians.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-32 px-6 bg-card">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-6">
            Built for Security
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-20">
            Powered by Arcium&apos;s confidential computing network. Your trades
            are encrypted and processed using multi-party computation—no single
            party ever sees your data.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10">
            {/* Security Item 1 */}
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-6">
                <span className="text-primary text-xl">🛡️</span>
              </div>
              <h3 className="font-semibold text-foreground mb-2">
                MPC Protected
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Multi-party computation ensures no single point of failure
              </p>
            </div>

            {/* Security Item 2 */}
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-6">
                <span className="text-primary text-xl">🔐</span>
              </div>
              <h3 className="font-semibold text-foreground mb-2">
                End-to-End Encrypted
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Data encrypted from submission to settlement
              </p>
            </div>

            {/* Security Item 3 */}
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-6">
                <span className="text-primary text-xl">📜</span>
              </div>
              <h3 className="font-semibold text-foreground mb-2">
                Open Source
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                Fully auditable contracts on Solana
              </p>
            </div>

            {/* Security Item 4 */}
            <div className="text-center">
              <div className="w-14 h-14 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-6">
                <span className="text-primary text-xl">🔑</span>
              </div>
              <h3 className="font-semibold text-foreground mb-2">
                Non-Custodial
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                You control your assets at all times
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-32 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-6">
            FAQ
          </h2>
          <p className="text-muted-foreground text-center mb-16">
            Everything you need to know about Veil OTC
          </p>
          <div className="space-y-6">
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

      {/* Footer */}
      <footer className="border-t border-border py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-primary text-xl">⬡</span>
                <span className="text-foreground font-semibold text-lg">
                  Veil OTC
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Private OTC trading on Solana
              </p>
            </div>

            {/* Product Links */}
            <div>
              <h4 className="font-semibold text-foreground mb-6">Product</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
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
              <h4 className="font-semibold text-foreground mb-6">Resources</h4>
              <ul className="space-y-3 text-sm text-muted-foreground">
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

          {/* Bottom bar */}
          <div className="pt-12 border-t border-border text-sm text-muted-foreground">
            <p>© 2025 Veil OTC</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
