"use client";

import { useState } from "react";
import { FAQ_ITEMS } from "../_lib/constants";

export const FAQPanel = () => {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <div className="shrink-0 w-[380px] border-l border-border p-4">
      <div className="bg-card/50 border border-border rounded-lg">
        {/* Content */}
        <div className="p-4 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-2">
            <h4 className="text-foreground font-medium">
              Private Negotiation Chat
            </h4>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">
              Coming Soon
            </span>
          </div>

          {/* Description */}
          <p className="text-muted-foreground text-sm">
            Negotiate directly with counterparties in an encrypted chat. All
            messages are private and settled on-chain.
          </p>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* FAQ Section */}
          <div>
            <h5 className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-3">
              FAQ
            </h5>
            <div className="space-y-2">
              {FAQ_ITEMS.map((item, index) => (
                <div
                  key={index}
                  className="border border-border rounded-md overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedFaq(expandedFaq === index ? null : index)
                    }
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
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
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
  );
};
