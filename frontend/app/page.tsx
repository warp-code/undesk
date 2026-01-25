"use client";

import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";

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
  yStart: number;
  yEnd: number;
  weight: "thin" | "medium" | "thick";
  opacity: number;
  isAccent: boolean;
  accentColor: string;
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
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-8 py-6 flex items-center justify-between text-left"
      >
        <span className="font-medium text-foreground">{question}</span>
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ease-out ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
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
      <section className="relative h-[500px] flex flex-col justify-center overflow-hidden">
        {/* Background Pattern */}
        <BackgroundPattern activeLines={activeLines} />

        {/* Hero Content - aligned with navbar container */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 w-full mt-16 pointer-events-none">
          <div className="max-w-2xl space-y-6 pointer-events-auto">
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
        </div>
      </section>

      {/* How it works Section */}
      <section id="how-it-works" className="pt-44 pb-20">
        <div className="max-w-6xl mx-auto px-6">
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
      <section id="security" className="py-32 bg-card">
        <div className="max-w-6xl mx-auto px-6">
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
      <section id="faq" className="py-32">
        <div className="max-w-3xl mx-auto px-6">
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
      <footer className="border-t border-border py-20">
        <div className="max-w-6xl mx-auto px-6">
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
