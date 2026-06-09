import BN from "bn.js";

// 6 decimal places for both price and USDC
export const PRICE_SCALE = 1_000_000;
export const USDC_SCALE = 1_000_000;
export const FUNDING_RATE_SCALE = 100_000;
export const BPS_SCALE = 10_000;

export function rawToPrice(raw: BN | number): number {
  const n = typeof raw === "number" ? raw : raw.toNumber();
  return n / PRICE_SCALE;
}

export function rawToUsdc(raw: BN | number): number {
  const n = typeof raw === "number" ? raw : raw.toNumber();
  return n / USDC_SCALE;
}

export function usdcToRaw(usdc: number): number {
  return Math.floor(usdc * USDC_SCALE);
}

export function formatPrice(raw: BN | number): string {
  return rawToPrice(raw).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatUsdc(raw: BN | number, decimals = 2): string {
  return rawToUsdc(raw).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSol(lamports: number): string {
  return (lamports / 1e9).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function timeSince(ts: number): string {
  const seconds = Math.floor(Date.now() / 1000) - ts;
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function timeOpen(openTs: number): string {
  const seconds = Math.floor(Date.now() / 1000) - openTs;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Liquidation price formulas (from spec)
export function calcLiqPriceLong(entryPriceRaw: number, leverage: number): number {
  const entry = rawToPrice(entryPriceRaw);
  return entry * (1 - 1 / leverage + 0.02);
}

export function calcLiqPriceShort(entryPriceRaw: number, leverage: number): number {
  const entry = rawToPrice(entryPriceRaw);
  return entry * (1 + 1 / leverage - 0.02);
}

// PnL in raw USDC units (mirrors close_position.rs)
export function calcPnl(
  direction: "Long" | "Short",
  currentPriceRaw: number,
  entryPriceRaw: number,
  notionalRaw: number
): number {
  if (entryPriceRaw === 0) return 0;
  if (direction === "Long") {
    return ((currentPriceRaw - entryPriceRaw) * notionalRaw) / entryPriceRaw;
  }
  return ((entryPriceRaw - currentPriceRaw) * notionalRaw) / entryPriceRaw;
}

// Estimated 24h funding in raw USDC (mirrors close_position.rs)
export function calc24hFunding(
  notionalRaw: number,
  baseFundingRatePerHour: number,
  skewRate: number
): number {
  return (notionalRaw * (baseFundingRatePerHour + skewRate) * 24) / FUNDING_RATE_SCALE;
}

// Skew rate calculation
export function calcSkewRate(
  totalLong: number,
  totalShort: number,
  skewFactor: number
): number {
  const totalExposure = totalLong + totalShort;
  if (totalExposure === 0) return 0;
  const diff = Math.abs(totalLong - totalShort);
  return (diff * skewFactor) / totalExposure;
}

export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2) + "%";
}

export function shortenAddress(addr: string): string {
  return addr.slice(0, 4) + "..." + addr.slice(-4);
}
