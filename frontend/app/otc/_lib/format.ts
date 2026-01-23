// Time formatting utilities

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

export const isUrgent = (expiresAt: number): boolean => {
  const diff = expiresAt - Date.now();
  return diff > 0 && diff < 7200000;
};

export const getTimeProgress = (createdAt: number, expiresAt: number): number => {
  const totalDuration = expiresAt - createdAt;
  const remaining = expiresAt - Date.now();
  if (remaining <= 0 || totalDuration <= 0) return 0;
  return Math.min(100, Math.max(0, (remaining / totalDuration) * 100));
};

export const getPairFromLabel = (label: string): { base: string; quote: string } => {
  const [base, quote] = label.split("/");
  return { base, quote };
};
