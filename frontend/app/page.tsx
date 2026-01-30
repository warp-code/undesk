"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

const ROWS = 4;
const COLS = 24;
const ACTIVE_DURATION = 2000;

const generateRandomData = () => {
  return (Math.random() * 100).toFixed(2);
};

const StatusIndicator = () => {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] text-primary uppercase tracking-wider mb-6">
      <div
        className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"
        style={{ boxShadow: '0 0 8px #f97316' }}
      />
      System Operational
    </div>
  );
};

const GridCol = ({
  isActive,
  dataValue
}: {
  isActive: boolean;
  dataValue: string;
}) => {
  return (
    <div
      className="flex-1 relative transition-all duration-600"
      style={{
        borderRight: isActive ? '1px solid #f97316' : '1px solid rgba(255, 255, 255, 0.04)',
        borderLeft: isActive ? '1px solid #f97316' : '1px solid rgba(255, 255, 255, 0.04)',
        background: isActive
          ? 'linear-gradient(180deg, rgba(249, 115, 22, 0) 0%, rgba(249, 115, 22, 0.08) 100%)'
          : 'transparent',
        boxShadow: isActive ? '0 0 15px rgba(249, 115, 22, 0.05)' : 'none',
        zIndex: isActive ? 2 : 1
      }}
    >
      <div
        className="absolute inset-x-0 bottom-2.5 flex justify-center font-mono text-[9px] pointer-events-none transition-opacity duration-300"
        style={{
          color: isActive ? '#f97316' : '#888888',
          opacity: isActive ? 1 : 0
        }}
      >
        {dataValue}
      </div>
    </div>
  );
};

const GridRow = ({
  rowIndex,
  activeCols,
  dataValues
}: {
  rowIndex: number;
  activeCols: string[];
  dataValues: Record<string, string>;
}) => {
  return (
    <div className="flex-1 flex relative" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
      {Array.from({ length: COLS }).map((_, colIndex) => {
        const colKey = `${rowIndex}-${colIndex}`;
        return (
          <GridCol
            key={colKey}
            isActive={activeCols.includes(colKey)}
            dataValue={dataValues[colKey] || generateRandomData()}
          />
        );
      })}
    </div>
  );
};

const GridPanel = () => {
  const [activeCols, setActiveCols] = useState<string[]>([]);
  const [dataValues, setDataValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const animateGrid = () => {
      const totalCols = ROWS * COLS;
      const idx1 = Math.floor(Math.random() * totalCols);
      let idx2 = Math.floor(Math.random() * totalCols);

      while (idx1 === idx2) {
        idx2 = Math.floor(Math.random() * totalCols);
      }

      const row1 = Math.floor(idx1 / COLS);
      const col1 = idx1 % COLS;
      const row2 = Math.floor(idx2 / COLS);
      const col2 = idx2 % COLS;

      const key1 = `${row1}-${col1}`;
      const key2 = `${row2}-${col2}`;

      setActiveCols([key1, key2]);
      setDataValues({
        [key1]: generateRandomData(),
        [key2]: generateRandomData()
      });
    };

    animateGrid();
    const interval = setInterval(animateGrid, ACTIVE_DURATION);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="relative h-full flex flex-col"
      style={{
        maskImage: 'linear-gradient(to right, transparent 0%, black 15%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 15%)'
      }}
    >
      {/* Ambient glow */}
      <div
        className="absolute -bottom-1/5 -right-1/10 w-[600px] h-[600px] pointer-events-none z-0"
        style={{
          background: 'radial-gradient(circle, rgba(249, 115, 22, 0.08) 0%, transparent 70%)',
          filter: 'blur(80px)'
        }}
      />
      {Array.from({ length: ROWS }).map((_, rowIndex) => (
        <GridRow
          key={rowIndex}
          rowIndex={rowIndex}
          activeCols={activeCols}
          dataValues={dataValues}
        />
      ))}
    </div>
  );
};

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

const SignalBar = ({ delay = 0 }: { delay?: number }) => {
  return (
    <div
      className="w-[3px] h-6 bg-primary transition-all duration-300 group-hover:h-8 group-hover:bg-orange-400"
      style={{
        boxShadow: '0 0 10px 1px rgba(249, 115, 22, 0.3)',
        transitionDelay: delay > 0 ? `${delay}ms` : '0ms'
      }}
    />
  );
};

const StepCard = ({
  title,
  description,
  barCount = 1
}: {
  title: string;
  description: string;
  barCount?: number;
}) => {
  return (
    <div className="flex gap-8 group">
      <div className="flex justify-end gap-1.5 pt-2 h-full shrink-0 w-[21px]">
        {[...Array(barCount)].map((_, index) => (
          <SignalBar key={index} delay={index * 75} />
        ))}
      </div>
      <div className="pt-0.5">
        <h4 className="text-lg font-semibold text-foreground mb-3 group-hover:text-primary transition-colors duration-300">
          {title}
        </h4>
        <p className="text-muted-foreground leading-relaxed text-[15px] max-w-lg">
          {description}
        </p>
      </div>
    </div>
  );
};

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
      <section className="relative h-[70vh] overflow-hidden">
        {/* Grid Panel - positioned absolutely on the right */}
        <div className="absolute top-0 right-0 w-[60%] h-full">
          <GridPanel />
        </div>

        {/* Content - aligned with page container */}
        <div className="relative z-10 h-full max-w-6xl mx-auto px-6 flex flex-col justify-center">
          <StatusIndicator />

          <h1
            className="text-[4rem] leading-[1.1] tracking-[-0.04em] font-semibold pb-6"
            style={{
              background: 'linear-gradient(180deg, #fff 0%, #aaa 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}
          >
            Private<br />peer-to-peer<br />OTC trading
          </h1>

          <p className="text-lg text-muted-foreground leading-relaxed max-w-[400px] mb-12">
            Execute large trades with complete privacy. No slippage, no front-running, no information leakage.
          </p>

          <div className="flex items-center gap-5">
            <Link
              href="/otc"
              className="btn-primary-glow text-primary-foreground px-4 py-2 rounded-lg font-medium text-base inline-flex items-center gap-3 group"
            >
              Start Trading
              <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <span className="font-mono text-[10px] text-[#444444]">
              V.0.1.0 DEVNET
            </span>
          </div>
        </div>
      </section>

      {/* OTC Comparison Section */}
      <section
        id="how-it-works"
        className="py-32 relative overflow-hidden"
      >
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <h2 className="text-4xl font-bold text-foreground text-center mb-2">
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
      <section className="py-32 relative overflow-hidden">
        {/* Architectural Grid Background */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: 'linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
            backgroundSize: '4rem 100%'
          }}
        />
        {/* Ambient glow - bottom left */}
        <div
          className="absolute -bottom-[20%] -left-[10%] w-[600px] h-[600px] pointer-events-none z-0"
          style={{
            background: 'radial-gradient(circle, rgba(249, 115, 22, 0.08) 0%, transparent 70%)',
            filter: 'blur(80px)'
          }}
        />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="mb-24 text-center">
            <h2 className="text-4xl font-bold text-foreground mb-2">
              How It Works
            </h2>
            <p className="text-muted-foreground">
              Posting, matching, and settlement — everything is encrypted.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-32 gap-y-20">
            {/* Deal Creators Column */}
            <div className="space-y-16">
              <h3 className="text-2xl font-bold text-foreground">
                For Deal Creators
              </h3>

              <StepCard
                title="Post your deal"
                description="Define your trade: assets, size, and your price. Deposit funds. Everything is encrypted before it leaves your wallet."
                barCount={1}
              />

              <StepCard
                title="Receive blind offers"
                description="Counterparties submit offers without seeing your price or size. Offers that don't meet your threshold are rejected without information leaks."
                barCount={2}
              />

              <StepCard
                title="Execute the deal"
                description="Once enough valid offers arrive, the trade is executed. Settlement is on-chain and private. You always get your price or better."
                barCount={3}
              />
            </div>

            {/* Offerors Column */}
            <div className="space-y-16">
              <h3 className="text-2xl font-bold text-foreground">
                For Offerors (Makers)
              </h3>

              <StepCard
                title="Browse open deals"
                description="See available deals and their assets. You won't see price or size, only what you need to decide if you're interested."
                barCount={1}
              />

              <StepCard
                title="Submit your offer"
                description="Make a blind offer with your desired price and size. If your offer passes the creator's threshold, it gets silently added to the deal."
                barCount={2}
              />

              <StepCard
                title="Get matched"
                description="If the deal executes and your offer matches, you receive exactly your desired price or better. If it doesn't, your funds are returned."
                barCount={3}
              />
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
              <h2 className="text-4xl font-bold text-foreground mb-6">
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
          <h2 className="text-4xl font-bold text-foreground text-center mb-6">
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
            backgroundImage: 'linear-gradient(90deg, rgba(249, 115, 22, 0.15) 1px, transparent 1px)',
            backgroundSize: '4rem 100%',
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
