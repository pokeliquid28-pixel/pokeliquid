"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } from "@solana/spl-token";
import BN from "bn.js";

import { useOracle } from "@/hooks/useOracle";
import { useProtocolState } from "@/hooks/useProtocolState";
import { useMarginAccount, Position } from "@/hooks/useMarginAccount";
import { useMarket } from "@/hooks/useMarket";
import { useOrderBook } from "@/hooks/useOrderBook";
import { useMarketState } from "@/hooks/useMarketState";
import { usePositionPrice } from "@/hooks/usePositionPrice";
import { useNotifications } from "@/providers/NotificationProvider";
import { incrementTradeCount } from "@/components/SaveWalletSheet";
import { getProgram } from "@/lib/program";
import { MARKETS, Market } from "@/lib/markets";
import { LandingAuth } from "@/components/LandingAuth";
import { Skeleton } from "@/components/Skeleton";
import {
  rawToPrice,
  rawToUsdc,
  usdcToRaw,
  formatPrice,
  calcLiqPriceLong,
  calcLiqPriceShort,
  calcPnl,
  calc24hFunding,
  calcSkewRate,
  timeSince,
} from "@/lib/utils";
import {
  PROTOCOL_STATE,
  ORACLE_ACCOUNT,
  FEE_VAULT,
  INSURANCE_FUND,
  USDC_MINT,
  MARKET_SEED,
  PROGRAM_ID,
  getMarginAccountPDA,
} from "@/lib/addresses";

const API_BASE = process.env.NEXT_PUBLIC_PRICE_API || "/api/keeper";

function getMarketStatePDA(marketId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [MARKET_SEED, Buffer.from(marketId)],
    PROGRAM_ID
  );
  return pda;
}

// Module-level flag: resets on page reload, persists across in-app navigation
let _passedLanding = false;

type Side = "Long" | "Short";
type OrderType = "MARKET" | "LIMIT" | "STOP";

async function ensureAta(
  connection: any,
  payer: PublicKey,
  mint: PublicKey,
  owner: PublicKey
): Promise<{ ata: PublicKey; needsCreate: boolean }> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  try {
    await getAccount(connection, ata);
    return { ata, needsCreate: false };
  } catch {
    return { ata, needsCreate: true };
  }
}

// ── Stats Hook ──────────────────────────────────────────────────────────────

function useStats() {
  const [stats, setStats] = useState<{ total_volume_24h: number } | null>(null);
  useEffect(() => {
    const load = () =>
      fetch(`${API_BASE}/stats`).then((r) => r.json()).then(setStats).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);
  return stats;
}

// ── Recent Trades Hook ──────────────────────────────────────────────────────

type RecentTrade = {
  id: number;
  timestamp: number;
  user_pubkey: string;
  direction: string;
  notional: number;
  entry_price: number | null;
  exit_price: number | null;
  pnl: number | null;
  action: string;
};

function normalizeTradeValue(v: number | null): number | null {
  if (v == null) return null;
  // If value looks like a raw u64 (> 100k), it was stored before keeper scaling fix
  return v > 100_000 ? v / 1e6 : v;
}

function useRecentTrades(marketId: string) {
  const [trades, setTrades] = useState<RecentTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`${API_BASE}/trades/recent?limit=20`)
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled) {
            const raw: RecentTrade[] = data.trades || [];
            const normalized = raw.map((t) => ({
              ...t,
              entry_price: normalizeTradeValue(t.entry_price),
              exit_price: normalizeTradeValue(t.exit_price),
              notional: normalizeTradeValue(t.notional) ?? 0,
              pnl: normalizeTradeValue(t.pnl),
            }));
            setTrades(normalized);
            setLoading(false);
          }
        })
        .catch(() => { if (!cancelled) setLoading(false); });
    load();
    const id = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [marketId]);

  return { trades, loading };
}

// ── Wallet Balance Hook ─────────────────────────────────────────────────────

function useWalletUsdc() {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) { setBalance(null); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const acc = await getAccount(connection, ata);
        if (!cancelled) setBalance(Number(acc.amount) / 1e6);
      } catch {
        if (!cancelled) setBalance(0);
      }
    };
    load();
    const id = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connection, publicKey]);

  return balance;
}

// ── Sidebar market item with its own oracle ─────────────────────────────────

function MarketListItem({
  m,
  selected,
  onSelect,
}: {
  m: Market;
  selected: boolean;
  onSelect: () => void;
}) {
  const { price, readings, isLoading } = useOracle(m.oracleAddress, m.priceApiMarket);
  const priceUsd = price / 1_000_000;

  let pctChange = 0;
  if (readings.length >= 2) {
    const oldest = readings[0].price / 1_000_000;
    if (oldest > 0) pctChange = ((priceUsd - oldest) / oldest) * 100;
  }

  return (
    <button
      onClick={() => m.live && onSelect()}
      disabled={!m.live}
      className={`w-full text-left p-3 border-b border-border/50 transition-colors ${
        selected
          ? "border-l-2 border-l-long bg-long/5"
          : "border-l-2 border-l-transparent hover:bg-white/[.02]"
      } ${!m.live ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {m.image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={m.image} alt={m.name} width={40} height={40} className="object-contain flex-shrink-0" style={{ imageRendering: "auto" }} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-primary truncate">{m.name}</span>
            {!m.live && (
              <span className="text-[8px] px-1.5 py-0.5 border border-secondary text-secondary uppercase flex-shrink-0 ml-1">Soon</span>
            )}
            {m.badge && m.live && (
              <span className="text-[8px] px-1.5 py-0.5 border border-long/40 text-long uppercase flex-shrink-0 ml-1">{m.badge}</span>
            )}
          </div>
          <div className="text-[9px] text-secondary truncate">{m.subtitle}</div>
          {m.live && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] font-bold text-primary">
                {isLoading ? "-.--" : `$${priceUsd.toFixed(2)}`}
              </span>
              <span className={`text-[10px] font-bold ${pctChange >= 0 ? "text-long" : "text-short"}`}>
                {isLoading ? "--" : `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function TradePage() {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { markets, selectedMarket, setSelectedMarket } = useMarket();
  const oracle = useOracle(selectedMarket.oracleAddress, selectedMarket.priceApiMarket);
  const protocol = useProtocolState();
  const marketState = useMarketState(selectedMarket.priceApiMarket);
  const margin = useMarginAccount();
  const { asks, bids } = useOrderBook(selectedMarket.id);
  const stats = useStats();
  const { trades: recentTrades, loading: tradesLoading } = useRecentTrades(selectedMarket.id);
  const walletUsdc = useWalletUsdc();
  const { addNotification } = useNotifications();
  const [refreshKey, setRefreshKey] = useState(0);
  const [marketSearch, setMarketSearch] = useState("");

  const handleRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Always show landing page on first load / refresh.
  // Module-level flag resets on page reload but persists across in-app navigation.
  const [passedLanding, setPassedLanding] = useState(_passedLanding);

  // If already passed (navigating back to /), tell Header to show nav
  useEffect(() => {
    if (_passedLanding) {
      window.dispatchEvent(new Event("pokeliquid:passed-landing"));
    }
  }, []);

  const handlePassLanding = useCallback(() => {
    _passedLanding = true;
    setPassedLanding(true);
    window.dispatchEvent(new Event("pokeliquid:passed-landing"));
  }, []);

  if (!passedLanding) return <LandingAuth onPass={handlePassLanding} />;

  const currentPrice = rawToPrice(oracle.price);
  const totalOI = marketState.longOi + marketState.shortOi;

  // 24h change from readings
  const readings = oracle.readings;
  let change24h = 0;
  if (readings.length >= 2) {
    const first = rawToPrice(readings[0].price);
    const last = rawToPrice(readings[readings.length - 1].price);
    if (first > 0) change24h = ((last - first) / first) * 100;
  }

  const filteredMarkets = markets.filter((m) =>
    m.name.toLowerCase().includes(marketSearch.toLowerCase()) ||
    m.subtitle.toLowerCase().includes(marketSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-[calc(100dvh-56px-56px)] md:h-[calc(100dvh-72px)]">
      {/* 3-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT COLUMN: Markets ──────────────────────────────────── */}
        <div className="hidden lg:flex flex-col w-[220px] border-r border-border bg-panel flex-shrink-0">
          {/* Markets header */}
          <div className="p-3 border-b border-border">
            <div className="text-[10px] uppercase tracking-wider text-secondary mb-2">Markets</div>
            <input
              type="text"
              value={marketSearch}
              onChange={(e) => setMarketSearch(e.target.value)}
              placeholder="Search..."
              className="field-input text-[11px] py-1.5"
            />
          </div>

          {/* Market list */}
          <div className="flex-1 overflow-y-auto">
            {filteredMarkets.map((m) => (
              <MarketListItem
                key={m.id}
                m={m}
                selected={selectedMarket.id === m.id}
                onSelect={() => setSelectedMarket(m)}
              />
            ))}
          </div>

          {/* Your positions (compact) */}
          <div className="border-t border-border">
            <div className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-secondary mb-2">Your Positions</div>
              {margin.positions.length === 0 ? (
                <div className="text-[10px] text-secondary/60">No open positions</div>
              ) : (
                <div className="space-y-1.5">
                  {margin.positions.map((pos) => {
                    const mkt = getMarketForOracle(pos.oracle);
                    return (
                      <div key={pos.index} className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className={pos.direction === "Long" ? "text-long" : "text-short"}>
                            {pos.direction === "Long" ? "L" : "S"}
                          </span>
                          <span className="text-primary">{pos.leverage}x</span>
                        </div>
                        <span className="text-secondary truncate ml-1">
                          {mkt?.name?.replace("-PERP", "") ?? "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── CENTER COLUMN: Chart + Order Entry ────────────────────── */}
        <div className="flex-1 flex flex-col overflow-y-auto min-w-0">
          {/* Market header bar */}
          <div className="flex items-center gap-4 md:gap-6 px-4 py-3 border-b border-border bg-panel flex-wrap">
            {/* Mobile: market selector dropdown */}
            <div className="relative flex items-center gap-2">
              <select
                value={selectedMarket.id}
                onChange={(e) => {
                  const m = markets.find((mk) => mk.id === e.target.value);
                  if (m && m.live) setSelectedMarket(m);
                }}
                className="lg:hidden appearance-none bg-transparent text-sm font-bold text-primary pr-5 cursor-pointer outline-none"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {markets.filter((m) => m.live).map((m) => (
                  <option key={m.id} value={m.id} style={{ background: "#111", color: "#fff" }}>
                    {m.name}
                  </option>
                ))}
              </select>
              <span className="lg:hidden text-secondary text-xs pointer-events-none absolute right-0">&#9662;</span>
              <span className="hidden lg:inline text-sm font-bold text-primary">{selectedMarket.name}</span>
              <span className="text-[9px] px-1.5 py-0.5 border border-long/40 text-long uppercase">{selectedMarket.badge}</span>
            </div>
            <div>
              <div className="text-lg font-bold text-long">${oracle.isLoading ? "—" : currentPrice.toFixed(2)}</div>
            </div>
            <div className="text-[11px]">
              <div className="text-secondary text-[9px] uppercase">24h Change</div>
              <div className={change24h >= 0 ? "text-long" : "text-short"}>
                {readings.length < 2 ? "—" : `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`}
              </div>
            </div>
            <div className="text-[11px]">
              <div className="text-secondary text-[9px] uppercase">24h Volume</div>
              <div className="text-primary">
                {stats ? `$${stats.total_volume_24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
              </div>
            </div>
            <div className="text-[11px]">
              <div className="text-secondary text-[9px] uppercase">Open Interest</div>
              <div className="text-primary">
                {protocol.isLoading ? "—" : `$${rawToUsdc(totalOI).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="border-b border-border bg-panel">
            <ChartSection oracle={oracle} priceApiMarket={selectedMarket.priceApiMarket} />
          </div>

          {/* OI Bar */}
          <div className="px-4 py-2 border-b border-border bg-panel flex items-center gap-3 text-[10px]">
            <span className="text-secondary uppercase">Open Interest</span>
            <div className="flex-1 flex h-1.5 bg-border overflow-hidden">
              {totalOI > 0 ? (
                <>
                  <div className="bg-long transition-all" style={{ width: `${(marketState.longOi / totalOI) * 100}%` }} />
                  <div className="bg-short transition-all" style={{ width: `${(marketState.shortOi / totalOI) * 100}%` }} />
                </>
              ) : (
                <div className="bg-border w-full" />
              )}
            </div>
            <span className="text-long">${rawToUsdc(marketState.longOi).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            <span className="text-secondary">/</span>
            <span className="text-short">${rawToUsdc(marketState.shortOi).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>

          {/* Order Entry */}
          <div className="p-4 bg-panel">
            <OrderEntry
              oracle={oracle}
              protocol={protocol}
              margin={margin}
              walletUsdc={walletUsdc}
              onRefresh={handleRefresh}
              oracleAddress={selectedMarket.oracleAddress}
              marketId={selectedMarket.priceApiMarket}
            />
          </div>
        </div>

        {/* ── RIGHT COLUMN: Order Book + Recent Trades ──────────────── */}
        <div className="hidden xl:flex flex-col w-[260px] border-l border-border bg-panel flex-shrink-0">
          {/* Order Book */}
          <div className="flex-1 border-b border-border">
            <div className="p-3 border-b border-border">
              <div className="text-[10px] uppercase tracking-wider text-secondary">Order Book</div>
            </div>
            <div className="p-3">
              {asks.length === 0 && bids.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-[10px] text-secondary">Order book coming soon</div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="grid grid-cols-3 text-[9px] uppercase text-secondary mb-2">
                    <span>Price</span>
                    <span className="text-right">Size</span>
                    <span className="text-right">Total</span>
                  </div>
                  {asks.map((a, i) => (
                    <div key={`a-${i}`} className="grid grid-cols-3 text-[11px]">
                      <span className="text-short">${a.price.toFixed(2)}</span>
                      <span className="text-right text-primary">{a.size.toFixed(2)}</span>
                      <span className="text-right text-secondary">{a.total.toFixed(2)}</span>
                    </div>
                  ))}
                  {bids.map((b, i) => (
                    <div key={`b-${i}`} className="grid grid-cols-3 text-[11px]">
                      <span className="text-long">${b.price.toFixed(2)}</span>
                      <span className="text-right text-primary">{b.size.toFixed(2)}</span>
                      <span className="text-right text-secondary">{b.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Trades */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-3 border-b border-border">
              <div className="text-[10px] uppercase tracking-wider text-secondary">Recent Trades</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {tradesLoading ? (
                <div className="p-3 text-[10px] text-secondary">Loading...</div>
              ) : recentTrades.length === 0 ? (
                <div className="p-3 text-center py-8">
                  <div className="text-[10px] text-secondary">No trades yet</div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 text-[9px] uppercase text-secondary px-3 py-2 border-b border-border/50">
                    <span>Price</span>
                    <span className="text-right">Size</span>
                    <span className="text-right">Time</span>
                  </div>
                  {recentTrades.map((t) => (
                    <div key={t.id} className="grid grid-cols-3 text-[11px] px-3 py-1.5 border-b border-border/30 hover:bg-white/[.01]">
                      <span className={t.direction === "long" ? "text-long" : "text-short"}>
                        ${(t.entry_price ?? t.exit_price ?? 0).toFixed(2)}
                      </span>
                      <span className="text-right text-primary">${t.notional.toFixed(0)}</span>
                      <span className="text-right text-secondary">
                        {new Date(t.timestamp * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── POSITIONS TABLE (full width, below) ──────────────────────── */}
      {connected && margin.positions.length > 0 && (
        <PositionsTable
          positions={margin.positions}
          protocol={protocol}
          margin={margin}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHART SECTION
// ═════════════════════════════════════════════════════════════════════════════

type ChartPoint = { timestamp: number; price: number };
type Timeframe = "1h" | "1d";

const TF_CONFIG: Record<Timeframe, { limit: number; labelInterval: number }> = {
  "1h": { limit: 12, labelInterval: 2 },
  "1d": { limit: 288, labelInterval: 48 },
};

function ChartSection({ oracle, priceApiMarket = "ETB" }: { oracle: ReturnType<typeof useOracle>; priceApiMarket?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [insufficient, setInsufficient] = useState(false);

  // Fetch price data from keeper API
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setChartLoading(true);
      const { limit } = TF_CONFIG[timeframe];
      fetch(`${API_BASE}/prices?market=${priceApiMarket}&limit=${limit}`)
        .then((r) => r.json())
        .then((data: { timestamp: number; raw_price: number }[]) => {
          if (cancelled) return;
          if (!Array.isArray(data) || data.length === 0) {
            console.warn("[Chart] No data from API");
            setChartData([]);
            setChartLoading(false);
            return;
          }
          const points: ChartPoint[] = data.map((d) => ({
            timestamp: d.timestamp,
            price: d.raw_price, // Already in USD (e.g. 161.68)
          }));
          // Sort by timestamp ascending
          points.sort((a, b) => a.timestamp - b.timestamp);
          console.log(`[Chart ${timeframe}] ${points.length} points, first:`, points[0], "last:", points[points.length - 1]);
          setChartData(points);
          setInsufficient(points.length < TF_CONFIG[timeframe].limit * 0.5);
          setChartLoading(false);
        })
        .catch((err) => {
          console.error("[Chart] Fetch error:", err);
          if (!cancelled) {
            setChartData([]);
            setChartLoading(false);
          }
        });
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000); // refresh every 5 min
    return () => { cancelled = true; clearInterval(id); };
  }, [timeframe, priceApiMarket]);

  // Draw chart
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || chartData.length < 2) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 16, right: 60, bottom: 28, left: 8 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    const prices = chartData.map((p) => p.price);
    // Live oracle price for dashed line (oracle stores u64 scaled by 1e6)
    const livePrice = oracle.price / 1_000_000;
    // Include live price in min/max so dashed line is always visible
    const allPrices = [...prices, livePrice];
    const minP = Math.min(...allPrices) * 0.998;
    const maxP = Math.max(...allPrices) * 1.002;
    const range = maxP - minP || 1;

    ctx.clearRect(0, 0, w, h);

    // Grid lines + price axis
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();

      const priceVal = maxP - (range / 4) * i;
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(`$${priceVal.toFixed(2)}`, w - pad.right + 6, y + 3);
    }

    // X-axis time labels
    const { labelInterval } = TF_CONFIG[timeframe];
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    for (let i = 0; i < chartData.length; i += labelInterval) {
      const x = pad.left + (i / (chartData.length - 1)) * cw;
      const d = new Date(chartData[i].timestamp * 1000);
      const label = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
      ctx.fillText(label, x, h - 4);
    }
    // Always show last label
    const lastX = pad.left + cw;
    const lastD = new Date(chartData[chartData.length - 1].timestamp * 1000);
    ctx.fillText(`${lastD.getHours().toString().padStart(2, "0")}:${lastD.getMinutes().toString().padStart(2, "0")}`, lastX, h - 4);

    // Fill area
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    gradient.addColorStop(0, "rgba(0,255,65,0.12)");
    gradient.addColorStop(1, "rgba(0,255,65,0)");

    ctx.beginPath();
    for (let i = 0; i < prices.length; i++) {
      const x = pad.left + (i / (prices.length - 1)) * cw;
      const y = pad.top + ch - ((prices[i] - minP) / range) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(pad.left + cw, pad.top + ch);
    ctx.lineTo(pad.left, pad.top + ch);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < prices.length; i++) {
      const x = pad.left + (i / (prices.length - 1)) * cw;
      const y = pad.top + ch - ((prices[i] - minP) / range) * ch;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#00ff41";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Live oracle price dashed line
    const curY = pad.top + ch - ((livePrice - minP) / range) * ch;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(0,255,65,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, curY);
    ctx.lineTo(w - pad.right, curY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Current price dot
    ctx.beginPath();
    ctx.arc(pad.left + cw, curY, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#00ff41";
    ctx.fill();
  }, [chartData, timeframe, oracle.price]);

  const timeframes: Timeframe[] = ["1h", "1d"];

  return (
    <div>
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50">
        {timeframes.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={`px-2.5 py-1 text-[10px] uppercase transition-colors ${
              timeframe === tf
                ? "text-long bg-long/10"
                : "text-secondary hover:text-primary"
            }`}
          >
            {tf}
          </button>
        ))}
      </div>
      <div ref={containerRef} className="h-[200px] md:h-[280px] relative">
        {chartLoading ? (
          <div className="flex items-center justify-center h-full text-[11px] text-secondary">
            Loading chart...
          </div>
        ) : chartData.length < 2 ? (
          <div className="flex items-center justify-center h-full text-[11px] text-secondary">
            Collecting price history...
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} className="w-full h-full" />
            {insufficient && (
              <div className="absolute bottom-2 left-4 text-[9px] text-secondary/60">
                Collecting price history...
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ORDER ENTRY
// ═════════════════════════════════════════════════════════════════════════════

function OrderEntry({
  oracle,
  protocol,
  margin,
  walletUsdc,
  onRefresh,
  oracleAddress,
  marketId,
}: {
  oracle: ReturnType<typeof useOracle>;
  protocol: ReturnType<typeof useProtocolState>;
  margin: ReturnType<typeof useMarginAccount>;
  walletUsdc: number | null;
  onRefresh: () => void;
  oracleAddress?: string;
  marketId?: string;
}) {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { addNotification } = useNotifications();

  const [side, setSide] = useState<Side>("Long");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [collateralInput, setCollateralInput] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [slInput, setSlInput] = useState("");
  const [tpInput, setTpInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Collateral management
  const [showCollateral, setShowCollateral] = useState(false);
  const [collMode, setCollMode] = useState<"deposit" | "withdraw">("deposit");
  const [collAmount, setCollAmount] = useState("");

  const collateralUsdc = parseFloat(collateralInput) || 0;
  const collateralRaw = usdcToRaw(collateralUsdc);
  const currentPriceUsd = rawToPrice(oracle.price);
  const positionSizeUsdc = collateralUsdc * leverage;
  const openFeeUsdc = rawToUsdc(Math.floor((collateralRaw * protocol.feeBps) / 10_000));
  const liqPrice = side === "Long"
    ? calcLiqPriceLong(oracle.price, leverage)
    : calcLiqPriceShort(oracle.price, leverage);

  const marginCollateralUsdc = rawToUsdc(margin.collateral);
  const minPositionUsdc = rawToUsdc(protocol.minPositionSize);
  const positionCount = margin.positions.length;
  const maxPositions = 5;
  const slotsAvailable = positionCount < maxPositions;

  const canOpen =
    connected &&
    slotsAvailable &&
    collateralUsdc >= minPositionUsdc &&
    collateralUsdc <= marginCollateralUsdc &&
    orderType === "MARKET";

  // ── Handlers ────────────────────────────────────────────────────────────

  async function handleOpenPosition() {
    if (!publicKey || !anchorWallet || !canOpen) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      const direction = side === "Long" ? { long: {} } : { short: {} };
      const slVal = slInput ? new BN(Math.round(parseFloat(slInput) * 1_000_000)) : null;
      const tpVal = tpInput ? new BN(Math.round(parseFloat(tpInput) * 1_000_000)) : null;

      await (program.methods as any)
        .openPosition(direction, new BN(collateralRaw), leverage, slVal, tpVal)
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          marginAccount: marginPda,
          oracle: oracleAddress ? new PublicKey(oracleAddress) : ORACLE_ACCOUNT,
          marketState: marketId ? getMarketStatePDA(marketId) : getMarketStatePDA("ETB"),
          feeVault: FEE_VAULT,
          insuranceFund: INSURANCE_FUND,
          liquidityPool: PublicKey.findProgramAddressSync([Buffer.from("liquidity_pool")], PROGRAM_ID)[0],
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      setTxStatus({ type: "success", msg: `${side} position opened at $${currentPriceUsd.toFixed(2)}` });
      incrementTradeCount();
      addNotification("success", `${side} Position Opened`, `$${positionSizeUsdc.toFixed(2)} at $${currentPriceUsd.toFixed(2)} (${leverage}x)`);
      setCollateralInput("");
      setSlInput("");
      setTpInput("");
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Transaction failed" });
      addNotification("error", "Open Position Failed", e?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleMintUsdc() {
    if (!publicKey || !anchorWallet) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const solBalance = await connection.getBalance(publicKey);
      if (solBalance < 5_000_000) {
        setTxStatus({ type: "success", msg: "Airdropping SOL..." });
        try {
          const sig = await connection.requestAirdrop(publicKey, 0.05 * 1e9);
          await connection.confirmTransaction(sig, "confirmed");
        } catch {
          try {
            const sig = await connection.requestAirdrop(publicKey, 0.01 * 1e9);
            await connection.confirmTransaction(sig, "confirmed");
          } catch {
            setTxStatus({ type: "error", msg: "Devnet airdrop failed" });
            setLoading(false);
            return;
          }
        }
      }
      const program = getProgram(connection, anchorWallet);
      const { ata, needsCreate } = await ensureAta(connection, publicKey, USDC_MINT, publicKey);
      const txBuilder = (program.methods as any).mintDevnetUsdc().accounts({
        user: publicKey, protocolState: PROTOCOL_STATE, usdcMint: USDC_MINT, userTokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID,
      });
      if (needsCreate) {
        const createIx = createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, USDC_MINT);
        await txBuilder.preInstructions([createIx]).rpc();
      } else {
        await txBuilder.rpc();
      }
      setTxStatus({ type: "success", msg: "Minted 1,000 devnet USDC!" });
      addNotification("success", "USDC Minted", "1,000 devnet USDC added");
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Mint failed" });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeposit() {
    if (!publicKey || !anchorWallet) return;
    const amt = parseFloat(collAmount) || 0;
    if (amt <= 0) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);

      // Check if old-size margin account exists and needs migration
      const existingAcct = await connection.getAccountInfo(marginPda);
      if (existingAcct && existingAcct.data.length < 546) {
        setTxStatus({ type: "success", msg: "Migrating account to new format..." });
        await (program.methods as any).closeMarginAccount().accounts({
          user: publicKey, marginAccount: marginPda, systemProgram: SystemProgram.programId,
        }).rpc();
        // Wait for the close to finalize
        await new Promise((r) => setTimeout(r, 2000));
      }

      const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      let needsCreate = false;
      try { await getAccount(connection, ata); } catch { needsCreate = true; }

      const txBuilder = (program.methods as any)
        .depositCollateral(new BN(usdcToRaw(amt)))
        .accounts({
          user: publicKey, protocolState: PROTOCOL_STATE, marginAccount: marginPda,
          userTokenAccount: ata, feeVault: FEE_VAULT, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        });
      if (needsCreate) {
        const createIx = createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, USDC_MINT);
        await txBuilder.preInstructions([createIx]).rpc();
      } else {
        await txBuilder.rpc();
      }
      setTxStatus({ type: "success", msg: `Deposited $${amt.toFixed(2)}` });
      setCollAmount("");
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Deposit failed" });
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    if (!publicKey || !anchorWallet) return;
    const amt = parseFloat(collAmount) || 0;
    if (amt <= 0 || amt > marginCollateralUsdc) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      let needsCreate = false;
      try { await getAccount(connection, ata); } catch { needsCreate = true; }

      const txBuilder = (program.methods as any)
        .withdrawCollateral(new BN(usdcToRaw(amt)))
        .accounts({
          user: publicKey, protocolState: PROTOCOL_STATE, marginAccount: marginPda,
          userTokenAccount: ata, feeVault: FEE_VAULT, tokenProgram: TOKEN_PROGRAM_ID,
        });
      if (needsCreate) {
        const createIx = createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, USDC_MINT);
        await txBuilder.preInstructions([createIx]).rpc();
      } else {
        await txBuilder.rpc();
      }
      setTxStatus({ type: "success", msg: `Withdrew $${amt.toFixed(2)}` });
      setCollAmount("");
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Withdrawal failed" });
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseMarginAccount() {
    if (!publicKey || !anchorWallet) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      await (program.methods as any).closeMarginAccount().accounts({
        user: publicKey, marginAccount: marginPda, systemProgram: SystemProgram.programId,
      }).rpc();
      setTxStatus({ type: "success", msg: "Account reset. You can now deposit fresh collateral." });
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Failed to close account" });
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const leveragePresets = [1, 2, 5, 10];

  return (
    <div className="space-y-3">
      {/* Migration notice */}
      {margin.error && connected && (
        <div className="border border-short p-3 bg-short/5 space-y-2">
          <p className="text-[11px] text-short">Account needs reset for multi-position support.</p>
          <button onClick={handleCloseMarginAccount} disabled={loading} className="btn-red w-full py-2 text-[10px]">
            {loading ? "..." : "Reset Account"}
          </button>
        </div>
      )}

      {/* Collateral bar */}
      <div className="text-[11px] border border-border p-2.5 bg-bg space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-secondary">Available:</span>
          <span className="text-long font-bold">${marginCollateralUsdc.toFixed(2)}</span>
          {walletUsdc !== null && (
            <>
              <span className="text-secondary">Wallet:</span>
              <span className="text-primary">${walletUsdc.toFixed(2)}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setShowCollateral(!showCollateral); setCollMode("deposit"); }}
            className="btn-outline text-[9px] py-1.5 px-2 flex-1 md:flex-none"
          >
            {showCollateral ? "Hide" : "Deposit/Withdraw"}
          </button>
          <button onClick={handleMintUsdc} disabled={loading} className="btn-outline text-[9px] py-1.5 px-2 flex-1 md:flex-none">
            {loading ? "..." : "Get Test USDC"}
          </button>
        </div>
      </div>

      {/* Collateral deposit/withdraw panel */}
      {showCollateral && (
        <div className="border border-border p-3 bg-bg space-y-2">
          <div className="flex gap-1">
            <button
              onClick={() => setCollMode("deposit")}
              className={`flex-1 py-1.5 text-[10px] uppercase ${collMode === "deposit" ? "text-long border border-long" : "text-secondary border border-border"}`}
            >
              Deposit
            </button>
            <button
              onClick={() => setCollMode("withdraw")}
              className={`flex-1 py-1.5 text-[10px] uppercase ${collMode === "withdraw" ? "text-short border border-short" : "text-secondary border border-border"}`}
            >
              Withdraw
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              value={collAmount}
              onChange={(e) => setCollAmount(e.target.value)}
              placeholder="0.00"
              className="field-input flex-1 text-[11px] py-1.5"
            />
            <button
              onClick={() => {
                if (collMode === "deposit" && walletUsdc !== null) setCollAmount(walletUsdc.toFixed(2));
                else setCollAmount(marginCollateralUsdc.toFixed(2));
              }}
              className="text-[9px] text-secondary hover:text-primary px-2"
            >
              MAX
            </button>
          </div>
          <button
            onClick={collMode === "deposit" ? handleDeposit : handleWithdraw}
            disabled={loading || !(parseFloat(collAmount) > 0)}
            className={`w-full py-2 text-[10px] font-bold uppercase ${
              collMode === "deposit"
                ? "btn-green"
                : "btn-red"
            }`}
          >
            {loading ? "..." : collMode === "deposit" ? "Deposit USDC" : "Withdraw USDC"}
          </button>
        </div>
      )}

      {/* Long / Short toggle */}
      <div className="flex">
        <button
          onClick={() => setSide("Long")}
          className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
            side === "Long" ? "bg-long text-black" : "border border-border text-secondary hover:text-primary"
          }`}
        >
          Long
        </button>
        <button
          onClick={() => setSide("Short")}
          className={`flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all ${
            side === "Short" ? "bg-short text-white" : "border border-border text-secondary hover:text-primary"
          }`}
        >
          Short
        </button>
      </div>

      {/* Order type tabs */}
      <div className="flex gap-1">
        {(["MARKET", "LIMIT", "STOP"] as OrderType[]).map((ot) => (
          <button
            key={ot}
            onClick={() => setOrderType(ot)}
            className={`px-3 py-1.5 text-[10px] uppercase tracking-wider transition-colors ${
              orderType === ot
                ? "text-primary border border-border2 bg-border/50"
                : "text-secondary hover:text-primary"
            }`}
          >
            {ot}
          </button>
        ))}
      </div>

      {/* Limit / Stop price input */}
      {orderType !== "MARKET" && (
        <div className="space-y-1">
          <div className="text-[10px] text-secondary uppercase">
            {orderType === "LIMIT" ? "Limit Price" : "Stop Price"}
          </div>
          <input
            type="number"
            placeholder={`$${currentPriceUsd.toFixed(2)}`}
            className="field-input text-[11px] py-2"
          />
          <div className="text-[9px] text-secondary/60">
            {orderType === "LIMIT" ? "Limit orders" : "Stop orders"} coming soon
          </div>
        </div>
      )}

      {/* Collateral input */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px]">
          <span className="text-secondary uppercase">Collateral (USDC)</span>
          <span
            className="text-secondary cursor-pointer hover:text-primary"
            onClick={() => setCollateralInput(marginCollateralUsdc.toFixed(2))}
          >
            Max: ${marginCollateralUsdc.toFixed(2)}
          </span>
        </div>
        <input
          type="number"
          value={collateralInput}
          onChange={(e) => setCollateralInput(e.target.value)}
          placeholder="0.00"
          className="field-input text-[11px] py-2"
        />
      </div>

      {/* Leverage */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-secondary uppercase">Leverage</div>
        <div className="flex gap-1">
          {leveragePresets.map((lv) => (
            <button
              key={lv}
              onClick={() => setLeverage(lv)}
              className={`flex-1 py-1.5 text-[10px] font-bold transition-colors ${
                leverage === lv
                  ? "bg-long/15 text-long border border-long/40"
                  : "border border-border text-secondary hover:text-primary"
              }`}
            >
              {lv}x
            </button>
          ))}
          <button
            onClick={() => setLeverage(10)}
            className={`flex-1 py-1.5 text-[10px] font-bold transition-colors ${
              leverage === 10
                ? "bg-short/20 text-short border border-short/40"
                : "border border-border text-short/60 hover:text-short"
            }`}
          >
            DEGEN
          </button>
        </div>
      </div>

      {/* SL/TP */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <div className="text-[10px] text-secondary">Stop Loss</div>
          <input
            type="number"
            step="0.01"
            value={slInput}
            onChange={(e) => setSlInput(e.target.value)}
            placeholder={side === "Long" ? "Below entry" : "Above entry"}
            className="field-input text-[10px] py-1.5"
          />
        </div>
        <div className="space-y-1">
          <div className="text-[10px] text-secondary">Take Profit</div>
          <input
            type="number"
            step="0.01"
            value={tpInput}
            onChange={(e) => setTpInput(e.target.value)}
            placeholder={side === "Long" ? "Above entry" : "Below entry"}
            className="field-input text-[10px] py-1.5"
          />
        </div>
      </div>

      {/* Calculated fields */}
      <div className="border border-border p-2.5 bg-bg text-[10px] space-y-1.5">
        <CalcRow label="Position Size" value={`$${positionSizeUsdc.toFixed(2)}`} />
        <CalcRow label="Entry Price" value={`$${currentPriceUsd.toFixed(2)}`} />
        <CalcRow label="Liq Price" value={collateralUsdc > 0 ? `$${liqPrice.toFixed(2)}` : "—"} color="text-short" />
        <CalcRow label="Fee (2%)" value={`$${openFeeUsdc.toFixed(4)}`} />
      </div>

      {/* Status */}
      {!slotsAvailable && (
        <div className="text-[10px] text-short text-center">All {maxPositions} position slots full</div>
      )}

      {txStatus && (
        <div className={`text-[10px] px-2.5 py-2 border ${txStatus.type === "success" ? "border-long text-long bg-long/5" : "border-short text-short bg-short/5"}`}>
          {txStatus.msg}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleOpenPosition}
        disabled={!canOpen || loading}
        className={`w-full py-3 text-[11px] font-bold uppercase tracking-wider ${
          canOpen && !loading
            ? side === "Long" ? "btn-green" : "btn-red"
            : "bg-border text-secondary cursor-not-allowed"
        }`}
      >
        {loading
          ? "Confirming..."
          : orderType !== "MARKET"
          ? `${orderType} orders coming soon`
          : `Open ${side} [${orderType}]`}
      </button>
    </div>
  );
}

function CalcRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-secondary">{label}</span>
      <span className={color || "text-primary"}>{value}</span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// POSITIONS TABLE
// ═════════════════════════════════════════════════════════════════════════════

function getMarketForOracle(oracleAddr: string): Market | undefined {
  return MARKETS.find((m) => m.oracleAddress === oracleAddr);
}

function getMarketIdForOracle(oracleAddr: string): string {
  return getMarketForOracle(oracleAddr)?.priceApiMarket ?? "ETB";
}

// ── Individual position row (has its own price hook) ────────────────────────

function PositionRow({
  pos,
  protocol,
  margin,
  onRefresh,
  expandedIdx,
  setExpandedIdx,
}: {
  pos: Position;
  protocol: ReturnType<typeof useProtocolState>;
  margin: ReturnType<typeof useMarginAccount>;
  onRefresh: () => void;
  expandedIdx: number | null;
  setExpandedIdx: (idx: number | null) => void;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [slInput, setSlInput] = useState("");
  const [tpInput, setTpInput] = useState("");
  const [marginMode, setMarginMode] = useState<"idle" | "add" | "remove">("idle");
  const [marginInput, setMarginInput] = useState("");

  // Each row fetches its OWN market price
  const markPriceRaw = usePositionPrice(pos.oracle);
  const markPriceUsd = rawToPrice(markPriceRaw);
  const market = getMarketForOracle(pos.oracle);
  const marketIdForPos = getMarketIdForOracle(pos.oracle);

  const pnlRaw = markPriceRaw > 0 ? calcPnl(pos.direction, markPriceRaw, pos.entryPrice, pos.notional) : 0;
  const pnl = rawToUsdc(pnlRaw);
  const isProfit = pnl >= 0;
  const entryUsd = rawToPrice(pos.entryPrice);
  const liq = pos.direction === "Long"
    ? calcLiqPriceLong(pos.entryPrice, pos.leverage)
    : calcLiqPriceShort(pos.entryPrice, pos.leverage);

  const isExpanded = expandedIdx === pos.index;
  const FUNDING_RATE_SCALE = 100_000;
  const nowSec = Math.floor(Date.now() / 1000);
  const hoursOpen = Math.max(0, Math.floor((nowSec - pos.openTimestamp) / 3600));
  const marginRatio = pos.notional > 0 ? (pos.collateral / pos.notional) * 100 : 100;

  // Funding estimate (simplified — uses base rate only since we don't have per-position market OI here)
  const fundingAccrued = rawToUsdc(Math.floor(pos.notional * protocol.baseFundingRatePerHour * hoursOpen / FUNDING_RATE_SCALE));

  const timeOpenStr = hoursOpen >= 24
    ? `${Math.floor(hoursOpen / 24)}d ${hoursOpen % 24}h`
    : hoursOpen > 0
    ? `${hoursOpen}h ${Math.floor(((nowSec - pos.openTimestamp) % 3600) / 60)}m`
    : `${Math.max(1, Math.floor((nowSec - pos.openTimestamp) / 60))}m`;

  async function handleClose() {
    if (!publicKey || !anchorWallet) return;
    setLoading(true);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      let needsCreate = false;
      try { await getAccount(connection, ata); } catch { needsCreate = true; }

      const oracleKey = pos.oracle ? new PublicKey(pos.oracle) : ORACLE_ACCOUNT;
      const txBuilder = (program.methods as any).closePosition(pos.index).accounts({
        user: publicKey, protocolState: PROTOCOL_STATE, marginAccount: marginPda,
        oracle: oracleKey,
        marketState: getMarketStatePDA(marketIdForPos),
        feeVault: FEE_VAULT, insuranceFund: INSURANCE_FUND,
        userTokenAccount: ata, tokenProgram: TOKEN_PROGRAM_ID,
        liquidityPool: PublicKey.findProgramAddressSync([Buffer.from("liquidity_pool")], PROGRAM_ID)[0],
        lpVault: PublicKey.findProgramAddressSync([Buffer.from("lp_vault")], PROGRAM_ID)[0],
      });
      if (needsCreate) {
        const createIx = createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, USDC_MINT);
        await txBuilder.preInstructions([createIx]).rpc();
      } else {
        await txBuilder.rpc();
      }
      addNotification(pnl >= 0 ? "success" : "warning", `Position #${pos.index} Closed`, `PnL: ${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`);
      setConfirmClose(false);
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      addNotification("error", "Close Failed", e?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSetSlTp() {
    if (!publicKey || !anchorWallet) return;
    setLoading(true);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      const slBn = slInput ? new BN(Math.round(parseFloat(slInput) * 1_000_000)) : null;
      const tpBn = tpInput ? new BN(Math.round(parseFloat(tpInput) * 1_000_000)) : null;
      const oracleKey = pos.oracle ? new PublicKey(pos.oracle) : ORACLE_ACCOUNT;
      await (program.methods as any).setSlTp(pos.index, slBn, tpBn).accounts({
        user: publicKey, protocolState: PROTOCOL_STATE, marginAccount: marginPda, oracle: oracleKey,
      }).rpc();
      addNotification("success", `SL/TP Updated — #${pos.index}`, `SL: ${slInput || "none"} / TP: ${tpInput || "none"}`);
      setExpandedIdx(null);
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      addNotification("error", "SL/TP Failed", e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleMarginAction() {
    if (!publicKey || !anchorWallet) return;
    const amt = parseFloat(marginInput) || 0;
    if (amt <= 0) return;
    setLoading(true);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      if (marginMode === "add") {
        await (program.methods as any).addMargin(pos.index, new BN(Math.round(amt * 1e6))).accounts({
          user: publicKey, protocolState: PROTOCOL_STATE, marginAccount: marginPda,
        }).rpc();
        addNotification("success", `Margin Added — #${pos.index}`, `+$${amt.toFixed(2)}`);
      } else {
        const oracleKey = pos.oracle ? new PublicKey(pos.oracle) : ORACLE_ACCOUNT;
        await (program.methods as any).removeMargin(pos.index, new BN(Math.round(amt * 1e6))).accounts({
          user: publicKey, protocolState: PROTOCOL_STATE, marginAccount: marginPda, oracle: oracleKey,
        }).rpc();
        addNotification("info", `Margin Removed — #${pos.index}`, `-$${amt.toFixed(2)}`);
      }
      setMarginMode("idle");
      setMarginInput("");
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      addNotification("error", `${marginMode === "add" ? "Add" : "Remove"} Margin Failed`, e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand() {
    if (isExpanded) {
      setExpandedIdx(null);
    } else {
      setExpandedIdx(pos.index);
      setSlInput(pos.slPrice ? rawToPrice(pos.slPrice).toFixed(2) : "");
      setTpInput(pos.tpPrice ? rawToPrice(pos.tpPrice).toFixed(2) : "");
      setMarginMode("idle");
      setMarginInput("");
    }
  }

  // ── Desktop row ──────────────────────────────────────────────────────────

  const desktopRow = (
    <div key={pos.index}>
      <div
        className="hidden md:grid grid-cols-8 text-[12px] px-4 h-[36px] border-b border-border/30 hover:bg-white/[.02] items-center cursor-pointer select-none"
        onClick={toggleExpand}
      >
        <span className="text-primary truncate">{market?.name ?? "—"}</span>
        <span className={pos.direction === "Long" ? "text-long" : "text-short"}>
          {pos.direction[0]}{pos.leverage}x
        </span>
        <span className="text-primary">${rawToUsdc(pos.notional).toFixed(2)}</span>
        <span className="text-primary">${entryUsd.toFixed(2)}</span>
        <span className="text-primary">{markPriceRaw > 0 ? `$${markPriceUsd.toFixed(2)}` : "..."}</span>
        <span className="text-short">${liq.toFixed(2)}</span>
        <span className={isProfit ? "text-long" : "text-short"}>
          {isProfit ? "+" : ""}${pnl.toFixed(2)}
        </span>
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          {confirmClose ? (
            <div className="flex gap-1 items-center">
              <button onClick={handleClose} disabled={loading} className="text-[10px] btn-red py-0.5 px-2">
                {loading ? "..." : "Confirm"}
              </button>
              <button onClick={() => setConfirmClose(false)} className="text-[10px] text-secondary px-1">x</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClose(true)}
              disabled={loading || markPriceRaw === 0}
              className="text-[10px] text-short hover:bg-short/10 border border-short/40 px-2 py-0.5 disabled:opacity-40"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Desktop expanded panel */}
      {isExpanded && (
        <div className="hidden md:block px-4 py-3 bg-bg border-b border-border/30">
          <div className="grid grid-cols-4 gap-4">
            {/* Position Info */}
            <div className="space-y-1 text-[11px]">
              <div className="text-[9px] text-secondary uppercase mb-1">Details</div>
              <div className="flex justify-between">
                <span className="text-secondary">Margin</span>
                <span className={marginRatio < 15 ? "text-short" : "text-long"}>{marginRatio.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Collateral</span>
                <span className="text-primary">${rawToUsdc(pos.collateral).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Funding</span>
                <span className={hoursOpen > 0 ? "text-short" : "text-secondary"}>
                  {hoursOpen > 0 ? `-$${fundingAccrued.toFixed(4)}` : "< 1h"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-secondary">Open</span>
                <span className="text-primary">{timeOpenStr}</span>
              </div>
            </div>

            {/* SL/TP */}
            <div className="space-y-1 text-[11px]">
              <div className="text-[9px] text-secondary uppercase mb-1">SL: {pos.slPrice ? `$${rawToPrice(pos.slPrice).toFixed(2)}` : "none"} / TP: {pos.tpPrice ? `$${rawToPrice(pos.tpPrice).toFixed(2)}` : "none"}</div>
              <div className="grid grid-cols-2 gap-1">
                <input type="number" step="0.01" value={slInput} onChange={(e) => setSlInput(e.target.value)}
                  placeholder="SL" className="field-input text-[10px] py-1" />
                <input type="number" step="0.01" value={tpInput} onChange={(e) => setTpInput(e.target.value)}
                  placeholder="TP" className="field-input text-[10px] py-1" />
              </div>
              <button onClick={handleSetSlTp} disabled={loading}
                className="btn-outline w-full text-[9px] py-1 active">
                {loading ? "..." : "Set SL/TP"}
              </button>
            </div>

            {/* Margin Management */}
            <div className="space-y-1">
              <div className="text-[9px] text-secondary uppercase mb-1">Margin</div>
              <div className="flex gap-1">
                <button onClick={() => setMarginMode("add")}
                  className={`flex-1 text-[9px] py-0.5 border ${marginMode === "add" ? "border-long text-long" : "border-border text-secondary"}`}>
                  Add
                </button>
                <button onClick={() => setMarginMode("remove")}
                  className={`flex-1 text-[9px] py-0.5 border ${marginMode === "remove" ? "border-short text-short" : "border-border text-secondary"}`}>
                  Remove
                </button>
              </div>
              {marginMode !== "idle" && (
                <>
                  <input type="number" step="0.01" value={marginInput} onChange={(e) => setMarginInput(e.target.value)}
                    placeholder="0.00" className="field-input text-[10px] py-1" />
                  <button onClick={handleMarginAction} disabled={loading || !(parseFloat(marginInput) > 0)}
                    className={`w-full text-[9px] py-1 font-bold uppercase ${marginMode === "add" ? "btn-green" : "btn-red"}`}>
                    {loading ? "..." : marginMode === "add" ? "Add" : "Remove"}
                  </button>
                </>
              )}
            </div>

            {/* Margin bar visual */}
            <div className="space-y-1">
              <div className="text-[9px] text-secondary uppercase mb-1">Margin Ratio</div>
              <div className="w-full h-3 bg-border/30 rounded-sm overflow-hidden">
                <div
                  className={`h-full ${marginRatio < 8 ? "bg-short" : marginRatio < 15 ? "bg-yellow-500" : "bg-long"}`}
                  style={{ width: `${Math.min(100, marginRatio)}%` }}
                />
              </div>
              <div className={`text-[11px] font-bold ${marginRatio < 8 ? "text-short" : marginRatio < 15 ? "text-yellow-500" : "text-long"}`}>
                {marginRatio.toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ── Mobile row ───────────────────────────────────────────────────────────

  const mobileRow = (
    <div key={`m-${pos.index}`} className="md:hidden">
      <div
        className="grid grid-cols-4 text-[11px] px-3 h-[36px] border-b border-border/30 hover:bg-white/[.02] items-center cursor-pointer select-none"
        onClick={toggleExpand}
      >
        <span className="text-primary truncate text-[10px]">{market?.name?.replace("-PERP", "") ?? "—"}</span>
        <span className={pos.direction === "Long" ? "text-long" : "text-short"}>
          {pos.direction[0]}{pos.leverage}x
        </span>
        <span className={isProfit ? "text-long" : "text-short"}>
          {isProfit ? "+" : ""}${pnl.toFixed(2)}
        </span>
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          {confirmClose ? (
            <div className="flex gap-1 items-center">
              <button onClick={handleClose} disabled={loading} className="text-[9px] btn-red py-0.5 px-1.5">
                {loading ? "..." : "OK"}
              </button>
              <button onClick={() => setConfirmClose(false)} className="text-[9px] text-secondary px-0.5">x</button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmClose(true)}
              disabled={loading || markPriceRaw === 0}
              className="text-[9px] text-short hover:bg-short/10 border border-short/40 px-1.5 py-0.5 disabled:opacity-40"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Mobile expanded panel */}
      {isExpanded && (
        <div className="px-3 py-2 bg-bg border-b border-border/30 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div><span className="text-secondary">Entry </span><span className="text-primary">${entryUsd.toFixed(2)}</span></div>
            <div><span className="text-secondary">Mark </span><span className="text-primary">{markPriceRaw > 0 ? `$${markPriceUsd.toFixed(2)}` : "..."}</span></div>
            <div><span className="text-secondary">Liq </span><span className="text-short">${liq.toFixed(2)}</span></div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <div><span className="text-secondary">Size </span><span className="text-primary">${rawToUsdc(pos.notional).toFixed(2)}</span></div>
            <div><span className="text-secondary">Margin </span><span className={marginRatio < 15 ? "text-short" : "text-long"}>{marginRatio.toFixed(1)}%</span></div>
            <div><span className="text-secondary">Open </span><span className="text-primary">{timeOpenStr}</span></div>
          </div>
          <div className="text-[10px]">
            <span className="text-secondary">SL: </span><span className="text-primary">{pos.slPrice ? `$${rawToPrice(pos.slPrice).toFixed(2)}` : "none"}</span>
            <span className="text-secondary ml-3">TP: </span><span className="text-primary">{pos.tpPrice ? `$${rawToPrice(pos.tpPrice).toFixed(2)}` : "none"}</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <input type="number" step="0.01" value={slInput} onChange={(e) => setSlInput(e.target.value)}
              placeholder="SL" className="field-input text-[10px] py-1" />
            <input type="number" step="0.01" value={tpInput} onChange={(e) => setTpInput(e.target.value)}
              placeholder="TP" className="field-input text-[10px] py-1" />
          </div>
          <button onClick={handleSetSlTp} disabled={loading}
            className="btn-outline w-full text-[9px] py-1 active">
            {loading ? "..." : "Set SL/TP"}
          </button>
          <div className="flex gap-1">
            <button onClick={() => setMarginMode(marginMode === "add" ? "idle" : "add")}
              className={`flex-1 text-[9px] py-0.5 border ${marginMode === "add" ? "border-long text-long" : "border-border text-secondary"}`}>
              +Margin
            </button>
            <button onClick={() => setMarginMode(marginMode === "remove" ? "idle" : "remove")}
              className={`flex-1 text-[9px] py-0.5 border ${marginMode === "remove" ? "border-short text-short" : "border-border text-secondary"}`}>
              -Margin
            </button>
          </div>
          {marginMode !== "idle" && (
            <div className="flex gap-1">
              <input type="number" step="0.01" value={marginInput} onChange={(e) => setMarginInput(e.target.value)}
                placeholder="0.00" className="field-input text-[10px] py-1 flex-1" />
              <button onClick={handleMarginAction} disabled={loading || !(parseFloat(marginInput) > 0)}
                className={`text-[9px] py-1 px-3 font-bold uppercase ${marginMode === "add" ? "btn-green" : "btn-red"}`}>
                {loading ? "..." : "Go"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return <>{desktopRow}{mobileRow}</>;
}

// ── Positions panel container ───────────────────────────────────────────────

function PositionsTable({
  positions,
  protocol,
  margin,
  onRefresh,
}: {
  positions: Position[];
  protocol: ReturnType<typeof useProtocolState>;
  margin: ReturnType<typeof useMarginAccount>;
  onRefresh: () => void;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const count = positions.length;
  const needsScroll = count >= 4;

  return (
    <div className="border-t border-border bg-panel">
      <div className="px-4 py-1.5 border-b border-border flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-secondary">Open Positions ({count})</span>
      </div>

      <div
        className={needsScroll ? "overflow-y-auto md:max-h-[200px] max-h-[160px]" : ""}
        style={needsScroll ? { scrollbarWidth: "thin", scrollbarColor: "#00ff41 #111111" } : undefined}
      >
        {/* Desktop header */}
        <div className="hidden md:grid grid-cols-8 text-[9px] uppercase text-secondary px-4 h-[28px] items-center border-b border-border/50 sticky top-0 bg-panel z-10">
          <span>Market</span>
          <span>Side</span>
          <span>Size</span>
          <span>Entry</span>
          <span>Mark</span>
          <span>Liq</span>
          <span>PnL</span>
          <span className="text-right">Actions</span>
        </div>

        {/* Mobile header */}
        <div className="md:hidden grid grid-cols-4 text-[9px] uppercase text-secondary px-3 h-[24px] items-center border-b border-border/50 sticky top-0 bg-panel z-10">
          <span>Market</span>
          <span>Side</span>
          <span>PnL</span>
          <span className="text-right">Actions</span>
        </div>

        {positions.map((pos) => (
          <PositionRow
            key={pos.index}
            pos={pos}
            protocol={protocol}
            margin={margin}
            onRefresh={onRefresh}
            expandedIdx={expandedIdx}
            setExpandedIdx={setExpandedIdx}
          />
        ))}
      </div>
    </div>
  );
}
