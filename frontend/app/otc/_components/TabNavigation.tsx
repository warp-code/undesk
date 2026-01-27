"use client";

import { useRef, useEffect, useState } from "react";

export type TabId = "deals" | "market" | "offers";

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: "market", label: "Open Market" },
  { id: "deals", label: "Your Deals" },
  { id: "offers", label: "Your Offers" },
];

interface TabNavigationProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export const TabNavigation = ({
  activeTab,
  onTabChange,
}: TabNavigationProps) => {
  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});
  const [underlineStyle, setUnderlineStyle] = useState({ left: 0, width: 0 });

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

  return (
    <div className="border-b border-border px-4">
      <div className="relative flex gap-2">
        {/* Animated underline */}
        <div
          className="absolute bottom-0 h-0.5 bg-primary transition-all duration-200 ease-out"
          style={{ left: underlineStyle.left, width: underlineStyle.width }}
        />
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[tab.id] = el;
            }}
            onClick={() => onTabChange(tab.id)}
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
  );
};
