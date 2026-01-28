"use client";

import { useState, useRef, useEffect } from "react";
import { SUPPORTED_MINTS, getTokenSymbol } from "../_lib/tokens";
import { TokenIcon } from "./TokenIcon";

interface TokenDropdownProps {
  selected: string; // mint address
  onSelect: (mint: string) => void;
  exclude?: string; // mint address
  disabled?: boolean;
}

export const TokenDropdown = ({
  selected,
  onSelect,
  exclude,
  disabled = false,
}: TokenDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
          }
        }}
        disabled={disabled}
        className="flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
      >
        <TokenIcon mint={selected} />
        <span>{getTokenSymbol(selected)}</span>
        <svg
          className="w-4 h-4"
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
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-md shadow-lg z-10 min-w-[100px]">
          {SUPPORTED_MINTS.filter((m) => m !== exclude).map((mint) => (
            <button
              key={mint}
              onClick={() => {
                onSelect(mint);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left hover:bg-secondary transition-colors flex items-center gap-1.5 ${
                mint === selected ? "text-primary" : "text-foreground"
              }`}
            >
              <TokenIcon mint={mint} />
              {getTokenSymbol(mint)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
