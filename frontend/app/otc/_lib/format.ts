// Time formatting utilities

import { getTokenInfo } from "./tokens";

/**
 * Convert raw token amount (smallest units) to human-readable number.
 * E.g., 1000000000 with 9 decimals becomes 1
 */
export const toHumanAmount = (rawAmount: number, mint: string): number => {
  const { decimals } = getTokenInfo(mint);
  return rawAmount / Math.pow(10, decimals);
};

/**
 * Format a raw token amount (smallest units) to human-readable string.
 * E.g., 1000000000 with 9 decimals becomes "1"
 */
export const formatTokenAmount = (
  rawAmount: number,
  mint: string,
  options?: { maximumFractionDigits?: number }
): string => {
  const { decimals } = getTokenInfo(mint);
  const humanAmount = toHumanAmount(rawAmount, mint);
  return humanAmount.toLocaleString(undefined, {
    maximumFractionDigits: options?.maximumFractionDigits ?? decimals,
  });
};

/**
 * Format a human-readable number with localization.
 * Use for prices that are already in human form (e.g., from X64.64 conversion).
 */
export const formatNumber = (
  value: number,
  options?: { maximumFractionDigits?: number }
): string => {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: options?.maximumFractionDigits ?? 6,
  });
};

export const sanitizeNumberInput = (value: string): string | null => {
  const cleaned = value.replace(/,/g, "");
  if (cleaned === "" || /^\d*\.?\d*$/.test(cleaned)) {
    return cleaned;
  }
  return null;
};

export const formatTimeRemaining = (expiresAt: number): string => {
  if (expiresAt === 0) return "-";
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const formatTimeAgo = (timestamp: number): string => {
  if (timestamp === 0) return "-";
  const diff = Date.now() - timestamp;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
};

export const isUrgent = (expiresAt: number): boolean => {
  const diff = expiresAt - Date.now();
  return diff > 0 && diff < 7200000;
};

export const getTimeProgress = (
  createdAt: number,
  expiresAt: number
): number => {
  const totalDuration = expiresAt - createdAt;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0 || totalDuration <= 0) return 0;
  return Math.min(100, Math.max(0, (remaining / totalDuration) * 100));
};
