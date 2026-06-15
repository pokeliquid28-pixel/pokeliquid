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
import { useMarketState } from "@/hooks/useMarketState";
import { usePositionPrice } from "@/hooks/usePositionPrice";
import { useNotifications } from "@/providers/NotificationProvider";
import { incrementTradeCount } from "@/components/SaveWalletSheet";
import { getProgram } from "@/lib/program";
import { MARKETS, Market, MarketType } from "@/lib/markets";
import { getMarketChange } from "@/hooks/useOracle";
import { LandingAuth } from "@/components/LandingAuth";
import { BinderCard } from "@/components/BinderCard";
import { SwapModal } from "@/components/SwapModal";
import { TradeHistory } from "@/components/TradeHistory";
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
  LIQUIDITY_POOL,
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

// Module-level flag — resets on every page reload / refresh
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

function useStats(marketId?: string) {
  const [stats, setStats] = useState<{ total_volume_24h: number } | null>(null);
  useEffect(() => {
    const q = marketId ? `?market=${marketId}` : "";
    const load = () =>
      fetch(`${API_BASE}/stats${q}`).then((r) => r.json()).then(setStats).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [marketId]);
  return stats;
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
  const marketState = useMarketState(selectedMarket.id);
  const margin = useMarginAccount();
  const stats = useStats(selectedMarket.id);
  const walletUsdc = useWalletUsdc();
  const { addNotification } = useNotifications();
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCardInfo, setShowCardInfo] = useState(false);
  const [cardInfo, setCardInfo] = useState<CardInfoData | null>(null);
  const [tradeSheetOpen, setTradeSheetOpen] = useState(false);
  const [binderSearch, setBinderSearch] = useState("");
  const [binderFilter, setBinderFilter] = useState<"ALL" | MarketType>("ALL");
  const [binderSort, setBinderSort] = useState<"default" | "gainers" | "losers">("default");

  // Fetch card info for selected market
  useEffect(() => {
    setShowCardInfo(false);
    fetch(`${API_BASE}/card-info?market=${selectedMarket.priceApiMarket}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setCardInfo(data); else setCardInfo(null); })
      .catch(() => setCardInfo(null));
  }, [selectedMarket.priceApiMarket]);

  const handleRefresh = useCallback(() => { setRefreshKey((k) => k + 1); margin.refresh(); }, [margin]);



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

  // Binder filtering + sorting
  const binderMarkets = markets
    .filter((m) => {
      const matchesSearch =
        binderSearch === "" ||
        m.name.toLowerCase().includes(binderSearch.toLowerCase()) ||
        m.subtitle.toLowerCase().includes(binderSearch.toLowerCase());
      const matchesFilter = binderFilter === "ALL" || m.type === binderFilter;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (binderSort === "default") return 0;
      const changeA = getMarketChange(a.oracleAddress, a.priceApiMarket);
      const changeB = getMarketChange(b.oracleAddress, b.priceApiMarket);
      return binderSort === "gainers" ? changeB - changeA : changeA - changeB;
    });

  const handleOpenTrade = (m: Market) => {
    setSelectedMarket(m);
    setTradeSheetOpen(true);
  };

  const handleCloseSheet = () => {
    setTradeSheetOpen(false);
  };

  const FILTER_CHIPS: { label: string; value: "ALL" | MarketType }[] = [
    { label: "ALL", value: "ALL" },
    { label: "SEALED", value: "SEALED" },
    { label: "CARDS", value: "CARDS" },
    { label: "INDEX", value: "INDEX" },
  ];

  return (
    <div className="flex flex-col min-h-[calc(100dvh-56px-56px)] md:min-h-[calc(100dvh-72px)]" style={{ backgroundColor: "#0a0a0a" }}>

      {/* ── BINDER GRID ──────────────────────────────────────────── */}
      <div className="px-4 md:px-6 lg:px-8 py-4 md:py-6 flex-1">
        {/* Search + filters */}
        <div className="max-w-[1200px] mx-auto mb-4 md:mb-6 space-y-3">
          <input
            type="text"
            value={binderSearch}
            onChange={(e) => setBinderSearch(e.target.value)}
            placeholder="Search cards..."
            className="w-full font-mono text-sm px-4 py-2.5"
            style={{
              background: "#111",
              border: "1px solid #1a1a1a",
              borderRadius: 8,
              color: "#fff",
              outline: "none",
            }}
          />
          <div className="flex gap-2">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.value}
                onClick={() => setBinderFilter(chip.value)}
                className="font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 transition-colors"
                style={{
                  borderRadius: 6,
                  border: binderFilter === chip.value ? "1px solid #00ff41" : "1px solid #222",
                  background: binderFilter === chip.value ? "rgba(0,255,65,0.08)" : "transparent",
                  color: binderFilter === chip.value ? "#00ff41" : "#666",
                  cursor: "pointer",
                }}
              >
                {chip.label}
              </button>
            ))}
            <div style={{ width: 1, background: "#222", margin: "0 4px" }} />
            {([
              { label: "DEFAULT", value: "default" as const },
              { label: "TOP GAINERS", value: "gainers" as const },
              { label: "TOP LOSERS", value: "losers" as const },
            ]).map((chip) => (
              <button
                key={chip.value}
                onClick={() => setBinderSort(chip.value)}
                className="font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 transition-colors"
                style={{
                  borderRadius: 6,
                  border: binderSort === chip.value ? "1px solid #ffaa00" : "1px solid #222",
                  background: binderSort === chip.value ? "rgba(255,170,0,0.08)" : "transparent",
                  color: binderSort === chip.value ? "#ffaa00" : "#666",
                  cursor: "pointer",
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grouped Grid */}
        {(() => {
          const groups: { type: "INDEX" | "SEALED" | "CARDS"; label: string }[] = [
            { type: "INDEX", label: "INDEXES" },
            { type: "SEALED", label: "SEALED PRODUCT" },
            { type: "CARDS", label: "CARDS" },
          ];
          const hasAny = binderMarkets.length > 0;
          const isSorted = binderSort !== "default";
          return hasAny ? (
            <div className="max-w-[1200px] mx-auto space-y-6">
              {isSorted ? (
                /* Flat sorted list when sorting by gainers/losers */
                <div>
                  <h3
                    className="font-mono text-[11px] font-bold uppercase tracking-widest mb-3"
                    style={{ color: "#ffaa00", borderBottom: "1px solid #1a1a1a", paddingBottom: 8 }}
                  >
                    {binderSort === "gainers" ? "TOP GAINERS" : "TOP LOSERS"} (24H)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                    {binderMarkets.map((m) => (
                      <BinderCard key={m.id} market={m} onTrade={handleOpenTrade} />
                    ))}
                  </div>
                </div>
              ) : (
                /* Grouped by type when default sort */
                groups.map((g) => {
                const items = binderMarkets.filter((m) => m.type === g.type);
                if (items.length === 0) return null;
                return (
                  <div key={g.type}>
                    <h3
                      className="font-mono text-[11px] font-bold uppercase tracking-widest mb-3"
                      style={{ color: "#555", borderBottom: "1px solid #1a1a1a", paddingBottom: 8 }}
                    >
                      {g.label}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                      {items.map((m) => (
                        <BinderCard key={m.id} market={m} onTrade={handleOpenTrade} />
                      ))}
                    </div>
                  </div>
                );
              }))}
            </div>
          ) : (
            <div className="text-center py-12 font-mono text-sm" style={{ color: "#555" }}>
              No markets match your search.
            </div>
          );
        })()}
      </div>

      {/* ── Positions bar (always visible below binder when connected) ── */}
      {connected && margin.positions.length > 0 && (
        <PositionsTable
          positions={margin.positions}
          protocol={protocol}
          margin={margin}
          onRefresh={handleRefresh}
        />
      )}

      {connected && (
        <div className="hidden md:block">
          <TradeHistory />
        </div>
      )}

      {/* ── TRADE SHEET OVERLAY ──────────────────────────────────── */}
      {tradeSheetOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleCloseSheet}
            className="fixed inset-0 z-[200]"
            style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
          />

          {/* Sheet */}
          <div
            className="fixed top-0 right-0 bottom-0 left-0 md:left-auto md:w-[520px] lg:w-[600px] z-[201] flex flex-col overflow-y-auto"
            style={{
              backgroundColor: "#0a0a0a",
              borderLeft: "1px solid #1a1a1a",
            }}
          >
            {/* Close button */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border" style={{ backgroundColor: "#0a0a0a" }}>
              <div className="flex items-center gap-2">
                {selectedMarket.image && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={selectedMarket.image} alt="" width={28} height={28} className="object-contain flex-shrink-0" style={{ borderRadius: 4 }} />
                )}
                <span className="text-sm font-bold text-primary font-mono">{selectedMarket.name.replace("-PERP", "")}</span>
                {selectedMarket.badge && <span className="text-[9px] px-1.5 py-0.5 border border-long/40 text-long uppercase font-mono">{selectedMarket.badge}</span>}
              </div>
              <button
                onClick={handleCloseSheet}
                className="text-secondary hover:text-primary text-lg px-2 font-mono"
              >
                &times;
              </button>
            </div>

            {/* Market header stats */}
            <div className="flex items-center gap-4 md:gap-6 px-4 py-3 border-b border-border flex-wrap" style={{ backgroundColor: "#111" }}>
              <div>
                <div className="text-lg font-bold text-long font-mono">${oracle.isLoading ? "\u2014" : currentPrice.toFixed(2)}</div>
              </div>
              <div className="text-[11px]">
                <div className="text-secondary text-[9px] uppercase font-mono">24h Change</div>
                <div className={`font-mono ${change24h >= 0 ? "text-long" : "text-short"}`}>
                  {readings.length < 2 ? "\u2014" : `${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`}
                </div>
              </div>
              <div className="text-[11px]">
                <div className="text-secondary text-[9px] uppercase font-mono">24h Volume</div>
                <div className="text-primary font-mono">
                  {stats ? `$${stats.total_volume_24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "\u2014"}
                </div>
              </div>
              <div className="text-[11px]">
                <div className="text-secondary text-[9px] uppercase font-mono">Open Interest</div>
                <div className="text-primary font-mono">
                  {protocol.isLoading ? "\u2014" : `$${rawToUsdc(totalOI).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="border-b border-border" style={{ backgroundColor: "#111" }}>
              <ChartSection oracle={oracle} priceApiMarket={selectedMarket.priceApiMarket} marketId={selectedMarket.id} marketImage={selectedMarket.image} showCardInfo={showCardInfo} cardInfo={cardInfo} positions={margin.positions} selectedOracleAddress={selectedMarket.oracleAddress} />
            </div>

            {/* OI Bar */}
            <div className="px-4 py-2 border-b border-border flex items-center gap-3 text-[10px]" style={{ backgroundColor: "#111" }}>
              <span className="text-secondary uppercase font-mono">OI</span>
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
              <span className="text-long font-mono">${rawToUsdc(marketState.longOi).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span className="text-secondary">/</span>
              <span className="text-short font-mono">${rawToUsdc(marketState.shortOi).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              {cardInfo && (
                <button
                  onClick={() => setShowCardInfo(!showCardInfo)}
                  className={`ml-1 px-2 py-0.5 uppercase tracking-wider border transition-colors font-mono ${
                    showCardInfo
                      ? "text-long border-long/40 bg-long/10"
                      : "text-secondary border-border hover:text-primary hover:border-primary/30"
                  }`}
                >
                  Market Data
                </button>
              )}
            </div>

            {/* Order Entry */}
            <div className="p-4" style={{ backgroundColor: "#111" }}>
              <OrderEntry
                oracle={oracle}
                protocol={protocol}
                margin={margin}
                walletUsdc={walletUsdc}
                onRefresh={handleRefresh}
                oracleAddress={selectedMarket.oracleAddress}
                marketId={selectedMarket.id}
                onPositionOpened={() => {}}
              />
            </div>

            {/* Positions in sheet */}
            {connected && margin.positions.length > 0 && (
              <PositionsTable
                positions={margin.positions}
                protocol={protocol}
                margin={margin}
                onRefresh={handleRefresh}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CHART SECTION
// ═════════════════════════════════════════════════════════════════════════════

type ChartPoint = { timestamp: number; price: number; open: number; high: number; low: number; close: number };
type Timeframe = "1h" | "1d";
type ChartMode = "line" | "candle";

const TF_CONFIG: Record<Timeframe, { resolution: string }> = {
  "1h": { resolution: "1h" },  // 1-hour candles, 7 days
  "1d": { resolution: "1d" },  // 1-day candles, 30 days
};

type CardInfoData = {
  productName: string | null;
  cardNumber: string | null;
  rarity: string | null;
  type: string | null;
  hp: string | null;
  stage: string | null;
  attacks: string[];
  weakness: string | null;
  resistance: string | null;
  retreatCost: string | null;
  artist: string | null;
  marketPrice: string | null;
  mostRecentSale: string | null;
  volatility: string | null;
  lowSalePrice: string | null;
  highSalePrice: string | null;
  totalSold: string | null;
  avgDailySold: string | null;
  isSealed: boolean;
};

function ChartSection({ oracle, priceApiMarket = "ETB", marketId, marketImage, showCardInfo, cardInfo, positions = [], selectedOracleAddress }: { oracle: ReturnType<typeof useOracle>; priceApiMarket?: string; marketId?: string; marketImage?: string; showCardInfo: boolean; cardInfo: CardInfoData | null; positions?: Position[]; selectedOracleAddress?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof import("lightweight-charts").createChart> | null>(null);
  const seriesRef = useRef<any>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [chartMode, setChartMode] = useState<ChartMode>("candle");
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  // Fetch price data from keeper API
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setChartLoading(true);
      const { resolution } = TF_CONFIG[timeframe];
      fetch(`${API_BASE}/candles?market=${priceApiMarket}&resolution=${resolution}`)
        .then((r) => r.json())
        .then((data: { timestamp: number; open: number; high: number; low: number; close: number }[]) => {
          if (cancelled) return;
          if (!Array.isArray(data) || data.length === 0) {
            setChartData([]);
            setChartLoading(false);
            return;
          }
          const points: ChartPoint[] = data.map((d) => ({
            timestamp: d.timestamp,
            price: d.close,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          }));
          points.sort((a, b) => a.timestamp - b.timestamp);
          setChartData(points);
          setChartLoading(false);
        })
        .catch(() => {
          if (!cancelled) {
            setChartData([]);
            setChartLoading(false);
          }
        });
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [timeframe, priceApiMarket]);

  // Create/update lightweight-charts
  useEffect(() => {
    if (!containerRef.current || chartData.length < 2) return;

    let lc: typeof import("lightweight-charts");
    let mounted = true;

    import("lightweight-charts").then((mod) => {
      if (!mounted || !containerRef.current) return;
      lc = mod;

      // Remove old chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }

      const chart = lc.createChart(containerRef.current!, {
        layout: {
          background: { color: "transparent" },
          textColor: "rgba(255,255,255,0.4)",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.03)" },
          horzLines: { color: "rgba(255,255,255,0.03)" },
        },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          vertLine: { color: "rgba(255,255,255,0.15)", width: 1, style: lc.LineStyle.Dashed, labelBackgroundColor: "#1a1a1a" },
          horzLine: { color: "rgba(255,255,255,0.15)", width: 1, style: lc.LineStyle.Dashed, labelBackgroundColor: "#1a1a1a" },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.06)",
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.06)",
          timeVisible: timeframe === "1h",
          secondsVisible: false,
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      });

      chartRef.current = chart;

      if (chartMode === "candle") {
        const series = chart.addSeries(lc.CandlestickSeries, {
          upColor: "#00ff41",
          downColor: "#ff3333",
          borderUpColor: "#00ff41",
          borderDownColor: "#ff3333",
          wickUpColor: "#00ff41",
          wickDownColor: "#ff3333",
        });
        const candleData = chartData.map((d, i) => ({
          time: d.timestamp as any,
          open: i === 0 ? d.open : chartData[i - 1].close,
          high: d.high,
          low: d.low,
          close: d.close,
        }));
        series.setData(candleData);
        seriesRef.current = series;
      } else {
        const series = chart.addSeries(lc.AreaSeries, {
          lineColor: "#00ff41",
          lineWidth: 2,
          topColor: "rgba(0,255,65,0.15)",
          bottomColor: "rgba(0,255,65,0)",
          crosshairMarkerBackgroundColor: "#00ff41",
        });
        series.setData(chartData.map((d) => ({ time: d.timestamp as any, value: d.close })));
        seriesRef.current = series;
      }

      // Live price line
      const livePrice = oracle.price / 1_000_000;
      if (livePrice > 0 && seriesRef.current) {
        seriesRef.current.createPriceLine({
          price: livePrice,
          color: "rgba(0,255,65,0.5)",
          lineWidth: 1,
          lineStyle: lc.LineStyle.Dashed,
          axisLabelVisible: true,
          title: "",
        });

        // Position entry lines with PnL
        const marketPositions = positions.filter((p) => p.oracle === selectedOracleAddress);
        for (const pos of marketPositions) {
          const entry = pos.entryPrice / 1_000_000;
          const collateral = pos.collateral / 1_000_000;
          const notional = pos.notional / 1_000_000;
          const priceDelta = pos.direction === "Long" ? livePrice - entry : entry - livePrice;
          const pnl = (priceDelta / entry) * notional;
          const pnlPct = collateral > 0 ? (pnl / collateral) * 100 : 0;
          const isProfit = pnl >= 0;
          const color = pos.direction === "Long" ? "#00ff41" : "#ff3333";
          const pnlStr = `${isProfit ? "+" : ""}$${pnl.toFixed(2)} (${isProfit ? "+" : ""}${pnlPct.toFixed(1)}%)`;
          seriesRef.current.createPriceLine({
            price: entry,
            color,
            lineWidth: 1,
            lineStyle: lc.LineStyle.Dotted,
            axisLabelVisible: true,
            title: `${pos.direction[0]}${pos.leverage}x ${pnlStr}`,
          });
        }
      }

      chart.timeScale().fitContent();

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
        }
      });
      ro.observe(containerRef.current!);

      return () => ro.disconnect();
    });

    return () => {
      mounted = false;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [chartData, chartMode, timeframe, oracle.price, positions, selectedOracleAddress]);

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
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setChartMode("line")}
            className={`px-2 py-1 text-[10px] transition-colors ${
              chartMode === "line" ? "text-long bg-long/10" : "text-secondary hover:text-primary"
            }`}
            title="Line chart"
          >
            ━
          </button>
          <button
            onClick={() => setChartMode("candle")}
            className={`px-2 py-1 text-[10px] transition-colors ${
              chartMode === "candle" ? "text-long bg-long/10" : "text-secondary hover:text-primary"
            }`}
            title="Candlestick chart"
          >
            ┃╋
          </button>
        </div>
      </div>
      <div className="h-[200px] md:h-[280px] relative">
        {chartLoading ? (
          <div className="flex items-center justify-center h-full text-[11px] text-secondary">
            Loading chart...
          </div>
        ) : chartData.length < 2 ? (
          marketId === "PL500" ? (
            <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-2">
              <div className="text-[13px] font-bold text-primary tracking-wide">The S&P 500 of Pokemon Cards</div>
              <div className="text-[11px] text-secondary leading-relaxed max-w-[360px]">
                Tracks the combined market value of the top 500 best-selling Pokemon cards on TCGPlayer. Updated every 60s.
              </div>
              <a href="/pl500" className="text-[10px] text-long hover:underline mt-1">View methodology & all 500 cards &rarr;</a>
              <div className="text-[9px] text-secondary/50 mt-1">Chart will appear as price history builds</div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[11px] text-secondary">
              Collecting price history...
            </div>
          )
        ) : (
          <>
            <div ref={containerRef} className="w-full h-full" />
            {showCardInfo && cardInfo && (
              <div className="absolute inset-0 bg-bg/95 z-10 overflow-hidden p-3 md:p-4">
                <div className="flex gap-3 md:gap-4 h-full">
                  {marketImage && (
                    <div className="shrink-0">
                      <img
                        src={marketImage}
                        alt={cardInfo.productName || "Card"}
                        className="w-[60px] md:w-[120px] border border-border"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <h3 className="text-[10px] md:text-xs font-bold text-primary mb-1 truncate">
                      {cardInfo.productName}
                    </h3>
                    <div className="space-y-0.5 text-[9px] md:text-[10px] font-mono">
                      {cardInfo.cardNumber && (
                        <div className="flex gap-1">
                          <span className="text-secondary shrink-0">No.</span>
                          <span className="text-primary truncate">{cardInfo.cardNumber} · {cardInfo.rarity}</span>
                        </div>
                      )}
                      {cardInfo.type && (
                        <div className="flex gap-1">
                          <span className="text-secondary shrink-0">Type</span>
                          <span className="text-primary truncate">{cardInfo.type} / {cardInfo.hp} HP / {cardInfo.stage}</span>
                        </div>
                      )}
                      {cardInfo.attacks.map((atk, i) => (
                        <div key={i} className="flex gap-1">
                          <span className="text-secondary shrink-0">Atk</span>
                          <span className="text-primary truncate">{atk}</span>
                        </div>
                      ))}
                      {cardInfo.weakness && (
                        <div className="flex gap-1">
                          <span className="text-secondary shrink-0">Weak</span>
                          <span className="text-primary">{cardInfo.weakness}</span>
                        </div>
                      )}
                      {cardInfo.artist && (
                        <div className="flex gap-1">
                          <span className="text-secondary shrink-0">Artist</span>
                          <span className="text-primary truncate">{cardInfo.artist}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-[9px] md:text-[10px] font-mono space-y-1 min-w-[100px] md:min-w-[130px]">
                    <div className="flex justify-between gap-2">
                      <span className="text-secondary">Mkt Price</span>
                      <span className="text-primary font-bold">{cardInfo.marketPrice}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-secondary">Last Sale</span>
                      <span className="text-primary">{cardInfo.mostRecentSale}</span>
                    </div>
                    <div className="border-t border-border/30 pt-1 mt-1 space-y-0.5">
                      {cardInfo.lowSalePrice && (
                        <div className="flex justify-between gap-2">
                          <span className="text-secondary">Low</span>
                          <span className="text-short">{cardInfo.lowSalePrice}</span>
                        </div>
                      )}
                      {cardInfo.highSalePrice && (
                        <div className="flex justify-between gap-2">
                          <span className="text-secondary">High</span>
                          <span className="text-long">{cardInfo.highSalePrice}</span>
                        </div>
                      )}
                      {cardInfo.totalSold && (
                        <div className="flex justify-between gap-2">
                          <span className="text-secondary">Sold</span>
                          <span className="text-primary">{cardInfo.totalSold}</span>
                        </div>
                      )}
                      {cardInfo.avgDailySold && (
                        <div className="flex justify-between gap-2">
                          <span className="text-secondary">Avg/Day</span>
                          <span className="text-primary">{cardInfo.avgDailySold}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
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
  onPositionOpened,
}: {
  oracle: ReturnType<typeof useOracle>;
  protocol: ReturnType<typeof useProtocolState>;
  margin: ReturnType<typeof useMarginAccount>;
  walletUsdc: number | null;
  onRefresh: () => void;
  oracleAddress?: string;
  marketId?: string;
  onPositionOpened?: () => void;
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
  const [showSwap, setShowSwap] = useState(false);

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
          marketState: marketId ? getMarketStatePDA(marketId) : getMarketStatePDA("PRISMATIC-ETB"),
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
      // Switch to positions tab on mobile, scroll on desktop
      if (onPositionOpened) onPositionOpened();
      setTimeout(() => {
        document.getElementById("positions-table")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 2500);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Transaction failed" });
      addNotification("error", "Open Position Failed", e?.message ?? "Transaction failed");
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

      // Fetch actual on-chain balance and cap deposit to it
      let actualRaw = 0;
      try {
        const acc = await getAccount(connection, ata);
        actualRaw = Number(acc.amount);
      } catch {
        setTxStatus({ type: "error", msg: "No USDC token account found. Swap SOL → USDC first." });
        setLoading(false);
        return;
      }

      const depositRaw = usdcToRaw(amt);
      const finalAmount = Math.min(depositRaw, actualRaw);
      if (finalAmount <= 0) {
        setTxStatus({ type: "error", msg: `Insufficient USDC. Wallet has ${(actualRaw / 1e6).toFixed(6)}.` });
        setLoading(false);
        return;
      }

      await (program.methods as any)
        .depositCollateral(new BN(finalAmount))
        .accounts({
          user: publicKey, protocolState: PROTOCOL_STATE, marginAccount: marginPda,
          userTokenAccount: ata, feeVault: FEE_VAULT, liquidityPool: LIQUIDITY_POOL, tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxStatus({ type: "success", msg: `Deposited $${(finalAmount / 1e6).toFixed(2)}` });
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
    if (amt <= 0) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      let needsCreate = false;
      try { await getAccount(connection, ata); } catch { needsCreate = true; }

      // Cap to actual free collateral
      const withdrawRaw = Math.min(usdcToRaw(amt), margin.collateral);
      if (withdrawRaw <= 0) {
        setTxStatus({ type: "error", msg: "No free collateral to withdraw." });
        setLoading(false);
        return;
      }

      const txBuilder = (program.methods as any)
        .withdrawCollateral(new BN(withdrawRaw))
        .accounts({
          user: publicKey, protocolState: PROTOCOL_STATE, marginAccount: marginPda,
          userTokenAccount: ata, feeVault: FEE_VAULT, liquidityPool: LIQUIDITY_POOL, tokenProgram: TOKEN_PROGRAM_ID,
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

  // leverage slider ticks
  const leverageTicks = [1, 5, 10, 15, 20, 25];

  return (
    <div className="space-y-3">
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
            onClick={() => setShowSwap(true)}
            className="btn-outline text-[9px] py-1.5 px-2"
          >
            Swap SOL → USDC
          </button>
          <button
            onClick={() => { setShowCollateral(!showCollateral); setCollMode("deposit"); }}
            className="btn-outline text-[9px] py-1.5 px-2 flex-1 md:flex-none"
          >
            {showCollateral ? "Hide" : "Deposit/Withdraw"}
          </button>
        </div>
      </div>
      {showSwap && <SwapModal onClose={() => setShowSwap(false)} />}

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
                if (collMode === "deposit" && walletUsdc !== null) setCollAmount(walletUsdc.toFixed(6));
                else setCollAmount(marginCollateralUsdc.toFixed(6));
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
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-secondary uppercase">Leverage</div>
          <div className={`text-[11px] font-bold ${leverage >= 20 ? "text-short" : "text-long"}`}>
            {leverage}x{leverage >= 20 ? " DEGEN" : ""}
          </div>
        </div>
        <input
          type="range"
          min={1}
          max={25}
          step={1}
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className={`w-full h-1.5 appearance-none bg-border rounded-sm cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0
            [&::-webkit-slider-thumb]:cursor-pointer ${
              leverage >= 20
                ? "[&::-webkit-slider-thumb]:bg-short [&::-webkit-slider-thumb]:shadow-[0_0_4px_rgba(239,68,68,0.4)]"
                : "[&::-webkit-slider-thumb]:bg-long [&::-webkit-slider-thumb]:shadow-[0_0_4px_rgba(0,255,0,0.3)]"
            }`}
        />
        <div className="flex justify-between text-[8px] text-secondary/50 px-0.5">
          {leverageTicks.map((t) => (
            <span key={t} className={leverage === t ? (t >= 20 ? "text-short" : "text-long font-bold") : ""}>{t}x</span>
          ))}
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
  return getMarketForOracle(oracleAddr)?.id ?? "PRISMATIC-ETB";
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
  const rowRef = useRef<HTMLDivElement>(null);

  // Each row fetches its OWN market price
  const markPriceRaw = usePositionPrice(pos.oracle);
  const markPriceUsd = rawToPrice(markPriceRaw);
  const market = getMarketForOracle(pos.oracle);
  const marketIdForPos = getMarketIdForOracle(pos.oracle);

  const pnlRaw = markPriceRaw > 0 ? calcPnl(pos.direction, markPriceRaw, pos.entryPrice, pos.notional) : 0;
  const pnl = rawToUsdc(pnlRaw);
  const isProfit = pnl >= 0;
  const collateralUsdc = rawToUsdc(pos.collateral);
  const pnlPct = collateralUsdc > 0 ? (pnl / collateralUsdc) * 100 : 0;
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
      // Immediately refresh margin account, then again after confirmation
      margin.refresh();
      setTimeout(() => { margin.refresh(); onRefresh(); }, 2000);
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
      setTimeout(() => {
        rowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
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
          {isProfit ? "+" : ""}${pnl.toFixed(2)} <span className="text-[9px] opacity-70">({isProfit ? "+" : ""}{pnlPct.toFixed(1)}%)</span>
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
        className="px-3 py-2.5 border-b border-border/30 hover:bg-white/[.02] cursor-pointer select-none"
        onClick={toggleExpand}
      >
        {/* Row 1: Market, Direction, PnL, Close */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-bold ${pos.direction === "Long" ? "text-long" : "text-short"}`}>
              {pos.direction[0]}{pos.leverage}x
            </span>
            <span className="text-[11px] text-primary">{market?.name?.replace("-PERP", "") ?? "—"}</span>
          </div>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className={`text-[12px] font-bold ${isProfit ? "text-long" : "text-short"}`}>
              {isProfit ? "+" : ""}${pnl.toFixed(2)} <span className="text-[9px] opacity-70">({isProfit ? "+" : ""}{pnlPct.toFixed(1)}%)</span>
            </span>
            {confirmClose ? (
              <div className="flex gap-1 items-center">
                <button onClick={handleClose} disabled={loading} className="text-[10px] btn-red py-0.5 px-2">
                  {loading ? "..." : "OK"}
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
        {/* Row 2: Entry, Mark, Size */}
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-secondary">Entry <span className="text-primary">${entryUsd.toFixed(2)}</span></span>
          <span className="text-secondary">Mark <span className="text-primary">{markPriceRaw > 0 ? `$${markPriceUsd.toFixed(2)}` : "..."}</span></span>
          <span className="text-secondary">Size <span className="text-primary">${rawToUsdc(pos.notional).toFixed(0)}</span></span>
          <span className="text-secondary">Liq <span className="text-short">${liq.toFixed(2)}</span></span>
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

  return <div ref={rowRef}>{desktopRow}{mobileRow}</div>;
}

// ── Positions panel container ───────────────────────────────────────────────

function PositionsTable({
  positions,
  protocol,
  margin,
  onRefresh,
  fullHeight,
}: {
  positions: Position[];
  protocol: ReturnType<typeof useProtocolState>;
  margin: ReturnType<typeof useMarginAccount>;
  onRefresh: () => void;
  fullHeight?: boolean;
}) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const count = positions.length;
  const needsScroll = !fullHeight && count >= 4;

  return (
    <div id="positions-table" className="border-t border-border bg-panel">
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
        <div className="md:hidden flex justify-between text-[9px] uppercase text-secondary px-3 h-[24px] items-center border-b border-border/50 sticky top-0 bg-panel z-10">
          <span>Position</span>
          <span>PnL</span>
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
