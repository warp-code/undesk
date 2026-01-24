"use client";

import Link from "next/link";
import { useState } from "react";

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

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-5 flex items-center justify-between text-left"
      >
        <span
          className={`font-medium ${
            isOpen ? "text-primary" : "text-foreground"
          }`}
        >
          {question}
        </span>
        <span
          className={`text-muted-foreground transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          ↓
        </span>
      </button>
      {isOpen && (
        <div className="px-6 pb-5 text-muted-foreground">{answer}</div>
      )}
    </div>
  );
}

export default function HomePage() {
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
            className="btn-primary-glow text-primary-foreground px-5 py-2 rounded-lg font-medium text-sm"
          >
            Open app →
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="min-h-[80vh] flex flex-col items-center justify-center px-6">
        <div className="max-w-2xl text-center space-y-6">
          <h1 className="text-5xl font-bold text-foreground">
            Private OTC Trading
          </h1>
          <p className="text-xl text-muted-foreground">
            Execute large trades with complete privacy. No slippage, no
            front-running, no information leakage.
          </p>
          <div className="pt-4">
            <Link
              href="/otc"
              className="btn-primary-glow text-primary-foreground px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 group"
            >
              Start Trading
              <span className="text-lg transition-transform duration-200 group-hover:translate-x-1">
                →
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works Section */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-16">
            Why Veil OTC?
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-primary text-2xl">🔒</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Complete Privacy
              </h3>
              <p className="text-muted-foreground">
                Encrypted order matching. Your trade intentions stay hidden
                until execution.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-primary text-2xl">⚡</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Zero Slippage
              </h3>
              <p className="text-muted-foreground">
                Fixed price execution. No price impact, no MEV, no
                front-running.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <span className="text-primary text-2xl">🔗</span>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                Trustless Settlement
              </h3>
              <p className="text-muted-foreground">
                On-chain atomic swaps. No counterparty risk, no custodians.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-24 px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-4">
            Built for Security
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-16">
            Powered by Arcium&apos;s confidential computing network. Your trades
            are encrypted and processed using multi-party computation—no single
            party ever sees your data.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Security Item 1 */}
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-primary text-xl">🛡️</span>
              </div>
              <h3 className="font-semibold text-foreground mb-1">
                MPC Protected
              </h3>
              <p className="text-sm text-muted-foreground">
                Multi-party computation ensures no single point of failure
              </p>
            </div>

            {/* Security Item 2 */}
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-primary text-xl">🔐</span>
              </div>
              <h3 className="font-semibold text-foreground mb-1">
                End-to-End Encrypted
              </h3>
              <p className="text-sm text-muted-foreground">
                Data encrypted from submission to settlement
              </p>
            </div>

            {/* Security Item 3 */}
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-primary text-xl">📜</span>
              </div>
              <h3 className="font-semibold text-foreground mb-1">
                Open Source
              </h3>
              <p className="text-sm text-muted-foreground">
                Fully auditable contracts on Solana
              </p>
            </div>

            {/* Security Item 4 */}
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                <span className="text-primary text-xl">🔑</span>
              </div>
              <h3 className="font-semibold text-foreground mb-1">
                Non-Custodial
              </h3>
              <p className="text-sm text-muted-foreground">
                You control your assets at all times
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-foreground text-center mb-4">
            FAQ
          </h2>
          <p className="text-muted-foreground text-center mb-12">
            Everything you need to know about Veil OTC
          </p>
          <div className="space-y-4">
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
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
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
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
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
              <h4 className="font-semibold text-foreground mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
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

            {/* Social Links */}
            <div>
              <h4 className="font-semibold text-foreground mb-4">Community</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a
                    href="#"
                    className="hover:text-foreground transition-colors"
                  >
                    Twitter
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p>© 2025 Veil OTC. All rights reserved.</p>
            <p>Built on Solana • Powered by Arcium</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
