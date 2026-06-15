"use client";

import { useEffect, useRef, useState } from "react";
import { useOracle } from "@/hooks/useOracle";
import { useProtocolState } from "@/hooks/useProtocolState";
import { useLiquidityPool } from "@/hooks/useLiquidityPool";
import { Skeleton } from "@/components/Skeleton";
import { AuthGuard } from "@/components/AuthGuard";
import { MARKETS } from "@/lib/markets";
import {
  rawToPrice,
  rawToUsdc,
  bpsToPercent,
  calcSkewRate,
  FUNDING_RATE_SCALE,
  timeSince,
} from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_PRICE_API || "/api/keeper";

// ── Types ────────────────────────────────────────────────────────────────────

type ProtocolStats = {
  total_volume_24h: number;
  total_volume_7d: number;
  total_trades_24h: number;
  total_liquidations_24h: number;
  total_fees_24h: number;
  unique_traders_24h: number;
};

type HealthData = {
  status: string;
  last_update: number;
  seconds_since_update: number;
  ewma: number;
  keeper_uptime_minutes: number;
  oracle_updates_1h: number;
  liquidation_checks_1h: number;
  funding_settlements_24h: number;
};

type PriceRow = {
  price: number;
  ewma: number;
  timestamp: number;
};

// ── Hooks ────────────────────────────────────────────────────────────────────

function useProtocolStats() {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE}/stats`)
        .then((r) => r.json())
        .then((data) => setStats(data))
        .catch(() => {})
        .finally(() => setLoading(false));

    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return { stats, loading };
}

function useHealthData(marketApiKey: string) {
  const [health, setHealth] = useState<HealthData | null>(null);

  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE}/health`)
        .then((r) => r.json())
        .then((data) => {
          const marketData = data.markets?.[marketApiKey];
          setHealth({
            status: data.status,
            last_update: marketData?.seconds_since_update ? Math.floor(Date.now() / 1000) - marketData.seconds_since_update : (data.oracle?.seconds_since_update ? Math.floor(Date.now() / 1000) - data.oracle.seconds_since_update : 0),
            seconds_since_update: marketData?.seconds_since_update ?? data.oracle?.seconds_since_update ?? 0,
            ewma: marketData?.ewma ?? data.oracle?.ewma ?? 0,
            keeper_uptime_minutes: data.keeper?.uptime_minutes ?? 0,
            oracle_updates_1h: data.oracle?.updates_1h ?? 0,
            liquidation_checks_1h: data.liquidation?.checks_1h ?? 0,
            funding_settlements_24h: data.funding?.settlements_24h ?? 0,
          });
        })
        .catch(() => {});

    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [marketApiKey]);

  return health;
}

function usePriceHistory(marketApiKey: string, limit: number = 288) {
  const [prices, setPrices] = useState<PriceRow[]>([]);

  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE}/prices?market=${marketApiKey}&limit=${limit}`)
        .then((r) => r.json())
        .then((data: PriceRow[]) => setPrices(data))
        .catch(() => {});

    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [marketApiKey, limit]);

  return prices;
}

// ── Components ───────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-panel p-4 md:p-6 mb-4 md:mb-6">
      <h2 className="text-[10px] md:text-xs font-semibold text-secondary uppercase tracking-wider mb-4 md:mb-5">
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  mono = true,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="border border-border bg-panel p-3 md:p-5">
      <div className="text-[10px] md:text-xs text-secondary uppercase tracking-wider mb-1 md:mb-2">{label}</div>
      <div className={`text-base md:text-xl font-bold ${highlight ? "text-long" : "text-primary"} ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] md:text-xs text-secondary mt-1 font-mono">{sub}</div>}
    </div>
  );
}

function StatRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
      <span className="text-xs md:text-sm text-secondary">{label}</span>
      <span className={`text-xs md:text-sm ${mono ? "font-mono" : ""} text-primary`}>{value}</span>
    </div>
  );
}

// ── Mini Price Chart (canvas-based) ──────────────────────────────────────────

function PriceChart({ prices }: { prices: PriceRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prices.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const padding = { top: 20, right: 50, bottom: 30, left: 10 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const ewmas = prices.map((p) => p.ewma);
    const minP = Math.min(...ewmas) * 0.995;
    const maxP = Math.max(...ewmas) * 1.005;
    const range = maxP - minP || 1;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      // Price labels
      const priceVal = maxP - (range / 4) * i;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`$${priceVal.toFixed(2)}`, w - padding.right + 5, y + 3);
    }

    // Time labels
    if (prices.length > 0) {
      const timeSlots = [0, Math.floor(prices.length / 4), Math.floor(prices.length / 2), Math.floor((3 * prices.length) / 4), prices.length - 1];
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      for (const idx of timeSlots) {
        if (idx >= prices.length) continue;
        const x = padding.left + (idx / (prices.length - 1)) * chartW;
        const d = new Date(prices[idx].timestamp * 1000);
        const label = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
        ctx.fillText(label, x, h - 8);
      }
    }

    // Line
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, "rgba(0, 255, 136, 0.15)");
    gradient.addColorStop(1, "rgba(0, 255, 136, 0)");

    // Fill area
    ctx.beginPath();
    for (let i = 0; i < prices.length; i++) {
      const x = padding.left + (i / (prices.length - 1)) * chartW;
      const y = padding.top + chartH - ((prices[i].ewma - minP) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(padding.left + chartW, padding.top + chartH);
    ctx.lineTo(padding.left, padding.top + chartH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Stroke line
    ctx.beginPath();
    for (let i = 0; i < prices.length; i++) {
      const x = padding.left + (i / (prices.length - 1)) * chartW;
      const y = padding.top + chartH - ((prices[i].ewma - minP) / range) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#00ff41";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Latest price dot
    if (prices.length > 0) {
      const last = prices[prices.length - 1];
      const x = padding.left + chartW;
      const y = padding.top + chartH - ((last.ewma - minP) / range) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#00ff41";
      ctx.fill();
    }
  }, [prices]);

  if (prices.length < 2) {
    return (
      <div className="h-48 flex items-center justify-center text-xs text-secondary border border-border bg-bg">
        Waiting for price data...
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-48 border border-border bg-bg"
      style={{ imageRendering: "auto" }}
    />
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  return <AuthGuard><StatsContent /></AuthGuard>;
}

function StatsContent() {
  const [selectedMarketIdx, setSelectedMarketIdx] = useState(0);
  const market = MARKETS[selectedMarketIdx];

  const oracle = useOracle(market.oracleAddress, market.priceApiMarket);
  const protocol = useProtocolState();
  const pool = useLiquidityPool();
  const { stats, loading: statsLoading } = useProtocolStats();
  const healthData = useHealthData(market.priceApiMarket);
  const priceHistory = usePriceHistory(market.priceApiMarket, 288);

  const currentPrice = rawToPrice(oracle.price);

  const totalOI = protocol.totalLongExposure + protocol.totalShortExposure;

  const skewRate = calcSkewRate(
    protocol.totalLongExposure,
    protocol.totalShortExposure,
    protocol.skewFactor
  );
  const baseFundingPct24h = (protocol.baseFundingRatePerHour / FUNDING_RATE_SCALE) * 100 * 24;
  const skewFundingPct24h = (skewRate / FUNDING_RATE_SCALE) * 100 * 24;

  // Price stats from history
  const ewmas = priceHistory.map((p) => p.ewma).filter((e) => e > 0);
  const priceHigh = ewmas.length > 0 ? Math.max(...ewmas) : currentPrice;
  const priceLow = ewmas.length > 0 ? Math.min(...ewmas) : currentPrice;

  // Pool APY
  const tvl = rawToUsdc(pool.totalUsdc);
  const estApy = tvl > 0 ? (rawToUsdc(pool.accumulatedFees) / tvl) * 52 * 100 : 0;

  // Oracle status
  const oracleHealthy = oracle.health === "fresh";
  const oracleStatus = oracle.health === "fresh" ? "Healthy" : oracle.health === "degraded" ? "Degraded" : "Stale";
  const oracleStatusColor = oracle.health === "fresh" ? "text-long" : oracle.health === "degraded" ? "text-accent" : "text-short";

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-primary">Statistics</h1>
        <p className="text-secondary text-xs md:text-sm mt-1">
          Live protocol metrics, oracle data, and market stats.
        </p>
      </div>

      {/* ── Market Selector ──────────────────────────────────────── */}
      <div className="flex gap-2 mb-4 md:mb-6 overflow-x-auto pb-1">
        {MARKETS.filter((m) => m.live).map((m, idx) => (
          <button
            key={m.id}
            onClick={() => setSelectedMarketIdx(idx)}
            className={`px-3 py-2 text-xs font-mono whitespace-nowrap border transition-colors ${
              idx === selectedMarketIdx
                ? "border-long text-long bg-long/10"
                : "border-border text-secondary hover:text-primary hover:border-primary/50"
            }`}
          >
            {m.priceApiMarket}
          </button>
        ))}
      </div>

      {/* ── Section 1: Oracle Status ──────────────────────────────────── */}
      <Section title={`Oracle Status — ${market.name}`}>
        {oracle.isLoading ? (
          <Skeleton height="h-48" />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-5">
              <div>
                <div className="text-[10px] md:text-xs text-secondary mb-1">Current Price</div>
                <div className="text-xl md:text-2xl font-mono font-bold text-primary">
                  ${currentPrice.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] md:text-xs text-secondary mb-1">Source</div>
                <div className="text-xs md:text-sm font-mono text-primary">
                  <span className="hidden md:inline">TCGPlayer (Playwright)</span>
                  <span className="md:hidden">TCGPlayer</span>
                </div>
                {market.tcgplayerId && (
                  <div className="text-[10px] text-secondary mt-0.5">Product {market.tcgplayerId}</div>
                )}
              </div>
              <div>
                <div className="text-[10px] md:text-xs text-secondary mb-1">Last Update</div>
                <div className="text-xs md:text-sm font-mono text-primary">
                  {oracle.lastUpdated > 0 ? timeSince(oracle.lastUpdated) : "—"}
                </div>
                <div className="text-[10px] text-secondary mt-0.5">Interval: 5 min</div>
              </div>
              <div>
                <div className="text-[10px] md:text-xs text-secondary mb-1">Oracle Status</div>
                <div className={`text-xs md:text-sm font-bold ${oracleStatusColor} flex items-center gap-1.5`}>
                  <span className={`inline-block w-2 h-2 rounded-full ${oracleHealthy ? "bg-long" : oracle.health === "degraded" ? "bg-accent" : "bg-short"}`} />
                  {oracleStatus}
                </div>
                <div className="text-[10px] text-secondary mt-0.5 hidden md:block">Smoothing: Adaptive EWMA</div>
              </div>
            </div>

            {/* Price Chart */}
            <div className="mb-4 md:mb-5">
              <div className="text-[10px] md:text-xs text-secondary mb-2">
                Price History ({priceHistory.length} readings)
              </div>
              <PriceChart prices={priceHistory} />
            </div>

            {/* TCGPlayer Stats / Price Range */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
              <div className="bg-bg border border-border p-2 md:p-3">
                <div className="text-[10px] md:text-xs text-secondary mb-1">Session High</div>
                <div className="text-xs md:text-sm font-mono font-semibold text-long">
                  ${priceHigh.toFixed(2)}
                </div>
              </div>
              <div className="bg-bg border border-border p-2 md:p-3">
                <div className="text-[10px] md:text-xs text-secondary mb-1">Session Low</div>
                <div className="text-xs md:text-sm font-mono font-semibold text-short">
                  ${priceLow.toFixed(2)}
                </div>
              </div>
              <div className="bg-bg border border-border p-2 md:p-3">
                <div className="text-[10px] md:text-xs text-secondary mb-1">EWMA Price</div>
                <div className="text-xs md:text-sm font-mono font-semibold text-primary">
                  ${healthData?.ewma?.toFixed(2) ?? currentPrice.toFixed(2)}
                </div>
              </div>
              <div className="bg-bg border border-border p-2 md:p-3">
                <div className="text-[10px] md:text-xs text-secondary mb-1">Keeper Uptime</div>
                <div className="text-xs md:text-sm font-mono font-semibold text-primary">
                  {healthData
                    ? healthData.keeper_uptime_minutes >= 60
                      ? `${(healthData.keeper_uptime_minutes / 60).toFixed(1)}h`
                      : `${healthData.keeper_uptime_minutes}m`
                    : "—"}
                </div>
              </div>
            </div>
          </>
        )}
      </Section>

      {/* ── Section 2: Protocol Stats ─────────────────────────────────── */}
      <Section title="Protocol Statistics">
        {statsLoading || protocol.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} height="h-16 md:h-20" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
            <StatCard
              label="24h Volume"
              value={stats ? `$${stats.total_volume_24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "$0.00"}
            />
            <StatCard
              label="7d Volume"
              value={stats ? `$${stats.total_volume_7d.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "$0.00"}
            />
            <StatCard
              label="Total OI"
              value={`$${rawToUsdc(totalOI).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            />
            <StatCard
              label="Trades (24h)"
              value={stats?.total_trades_24h.toString() ?? "0"}
            />
            <StatCard
              label="Unique Traders (24h)"
              value={stats?.unique_traders_24h.toString() ?? "0"}
            />
            <StatCard
              label="Liquidations (24h)"
              value={stats?.total_liquidations_24h.toString() ?? "0"}
              sub={stats && stats.total_liquidations_24h > 0 ? "positions liquidated" : "none"}
            />
            <StatCard
              label="Fees (24h)"
              value={stats ? `$${stats.total_fees_24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "$0.00"}
            />
            <StatCard
              label="Pool TVL"
              value={pool.isLoading ? "..." : `$${tvl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
            />
            <StatCard
              label="Pool APY (est)"
              value={pool.isLoading ? "..." : `${estApy.toFixed(1)}%`}
              highlight={estApy > 0}
            />
          </div>
        )}
      </Section>

      {/* ── Section 3: Protocol Parameters ────────────────────────────── */}
      <Section title="Protocol Parameters">
        {protocol.isLoading ? (
          <Skeleton height="h-48" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 md:gap-x-8">
            <div className="space-y-0">
              <StatRow label="Trade Fee" value={bpsToPercent(protocol.feeBps)} mono />
              <StatRow
                label="Base Funding Rate"
                value={`${baseFundingPct24h.toFixed(4)}% / 24h`}
                mono
              />
              <StatRow
                label="Skew Funding (current)"
                value={`${skewFundingPct24h.toFixed(4)}% / 24h`}
                mono
              />
              <StatRow label="Max Leverage" value="25x" mono />
              <StatRow label="Profit Cap" value={bpsToPercent(protocol.profitCapBps)} mono />
            </div>
            <div className="space-y-0">
              <StatRow label="Liquidation Threshold" value="5%" mono />
              <StatRow
                label="Insurance Fund Rate"
                value={bpsToPercent(protocol.insuranceFundBps)}
                mono
              />
              <StatRow
                label="Min Position Size"
                value={`$${rawToUsdc(protocol.minPositionSize).toFixed(2)}`}
                mono
              />
              <StatRow
                label="Max Long OI"
                value={protocol.maxLongExposure > 0 ? `$${rawToUsdc(protocol.maxLongExposure).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "Uncapped"}
                mono
              />
              <StatRow
                label="Max Short OI"
                value={protocol.maxShortExposure > 0 ? `$${rawToUsdc(protocol.maxShortExposure).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "Uncapped"}
                mono
              />
              <StatRow
                label="Protocol Paused"
                value={protocol.isPaused ? "YES" : "NO"}
                mono
              />
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
