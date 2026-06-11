"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PnlExportButton, TradeExportModal } from "./PnlExport";

const API_BASE = process.env.NEXT_PUBLIC_PRICE_API || "/api/keeper";

type Trade = {
  id: number;
  timestamp: number;
  user_pubkey: string;
  position_index: number;
  action: string;
  direction: string;
  collateral: number;
  notional: number;
  leverage: number;
  entry_price: number | null;
  exit_price: number | null;
  pnl: number | null;
  funding_paid: number | null;
  fee_paid: number;
  tx_signature: string;
  close_reason: string | null;
  market: string | null;
};

type Filter = "all" | "open" | "close" | "liquidation";

const MARKET_LABELS: Record<string, string> = {
  "PRISMATIC-ETB": "ETB",
  "CHARIZARD-125/094-PFL": "CHARIZARD",
  "CHARMANDER-038-MEP": "CHARMANDER",
  "PIKACHU-276/217-AH": "PIKACHU",
  "GRENINJA-116/086-CR": "GRENINJA",
  "ASCENDED-HEROES-ETB": "AH-ETB",
  "PSYDUCK-226/217-AH": "PSYDUCK",
  "MEOWTH-106/094-PFL": "MEOWTH",
  "BLACK-BOLT-ETB": "BB-ETB",
  "MAGNETON-159-PROMO": "MAGNETON",
  "CHARIZARD-199/165-151": "ZARD-151",
  "MISTYS-PSYDUCK-193/182-DR": "M-PSYDUCK",
  "UMBREON-161/131-PE": "UMBREON",
  "MEW-232/091-PF": "MEW",
  "PIKACHU-238/191-SS": "PIKA-SS",
  "GIRATINA-GG69/GG70-CZ": "GIRATINA",
  "CHAOS-RISING-BB": "CR-BB",
  "KABUTO-FOSSIL-1E": "KABUTO",
  "GENGAR-284/217-AH": "GENGAR",
  "DRAGONITE-290/217-AH": "DRAGONITE",
  "CLEFAIRY-094/088-PO": "CLEFAIRY",
  "MEGA-GRENINJA-117/086-CR": "MEGA-GREN",
};

function formatTime(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimeShort(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function marketLabel(t: Trade): string {
  if (!t.market) return "—";
  return MARKET_LABELS[t.market] || t.market;
}

function positionValue(t: Trade): number | null {
  if (t.notional <= 0) return null;
  if (t.action === "open") return t.notional;
  if (t.entry_price && t.exit_price && t.entry_price > 0) {
    return t.notional * t.exit_price / t.entry_price;
  }
  return t.notional;
}

function actionBadge(action: string, reason: string | null) {
  if (action === "open") return { label: "OPEN", color: "bg-long/20 text-long border-long/30" };
  if (action === "liquidate") return { label: "LIQUIDATED", color: "bg-short/20 text-short border-short/30" };
  if (action === "sl" || reason === "stop_loss") return { label: "SL", color: "bg-accent/20 text-accent border-accent/30" };
  if (action === "tp" || reason === "take_profit") return { label: "TP", color: "bg-long/20 text-long border-long/30" };
  return { label: "MANUAL", color: "bg-border text-secondary border-border" };
}

function useTradeHistory(limitOverride?: number) {
  const { publicKey } = useWallet();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(limitOverride ?? 20);

  const fetchTrades = useCallback(() => {
    if (!publicKey) return;
    const url = `${API_BASE}/trades?user=${publicKey.toBase58()}&limit=${limit}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setTrades(data.trades || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [publicKey, limit]);

  useEffect(() => {
    if (!publicKey) { setTrades([]); return; }
    setLoading(true);
    fetchTrades();
    const id = setInterval(fetchTrades, 15_000);
    return () => clearInterval(id);
  }, [publicKey, limit, fetchTrades]);

  return { trades, total, loading, limit, setLimit };
}

// Get unique markets from trades for filter dropdown
function getUniqueMarkets(trades: Trade[]): string[] {
  const markets = new Set<string>();
  trades.forEach((t) => { if (t.market) markets.add(t.market); });
  return Array.from(markets).sort();
}

export function TradeHistory({ expanded = false }: { expanded?: boolean }) {
  const { publicKey } = useWallet();
  const { trades, total, loading, limit, setLimit } = useTradeHistory(expanded ? 50 : 20);
  const [filter, setFilter] = useState<Filter>("all");
  const [marketFilter, setMarketFilter] = useState<string>("all");
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  if (!publicKey) return null;

  const uniqueMarkets = getUniqueMarkets(trades);

  const filtered = trades.filter((t) => {
    if (filter === "open" && t.action !== "open") return false;
    if (filter === "close" && t.action !== "close" && t.action !== "sl" && t.action !== "tp") return false;
    if (filter === "liquidation" && t.action !== "liquidate") return false;
    if (marketFilter !== "all" && t.market !== marketFilter) return false;
    return true;
  });

  const isClose = (t: Trade) => t.action !== "open";

  return (
    <div className="border border-border bg-panel p-3 md:p-5">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h2 className="text-[10px] md:text-xs font-semibold text-secondary uppercase tracking-wider">
          Trade History
        </h2>
        <div className="flex items-center gap-2 md:gap-3">
          <PnlExportButton />
          <span className="text-[10px] md:text-xs text-secondary font-mono">{total} total</span>
          {!expanded && (
            <a href="/trades" className="text-[10px] text-long hover:underline">View all</a>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
        <div className="flex gap-1.5 overflow-x-auto">
          {(["all", "open", "close", "liquidation"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 md:px-3 py-1.5 text-[10px] md:text-xs font-mono transition-colors whitespace-nowrap ${
                filter === f
                  ? "bg-border text-primary"
                  : "text-secondary hover:text-primary"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {uniqueMarkets.length > 1 && (
          <select
            value={marketFilter}
            onChange={(e) => setMarketFilter(e.target.value)}
            className="bg-bg border border-border text-[10px] md:text-xs font-mono text-primary px-2 py-1.5 outline-none cursor-pointer"
          >
            <option value="all">All Markets</option>
            {uniqueMarkets.map((m) => (
              <option key={m} value={m}>{MARKET_LABELS[m] || m}</option>
            ))}
          </select>
        )}
      </div>

      {loading && trades.length === 0 ? (
        <div className="text-xs text-secondary text-center py-8">Loading trades...</div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-secondary text-center py-8">No trades found</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="grid grid-cols-10 gap-2 text-xs text-secondary uppercase tracking-wider font-semibold border-b border-border pb-2 mb-2">
              <div>Time</div>
              <div>Type</div>
              <div>Market</div>
              <div>Dir</div>
              <div>Size</div>
              <div>Entry</div>
              <div>Exit</div>
              <div>PnL</div>
              <div>Fee</div>
              <div></div>
            </div>

            {filtered.map((t) => {
              const badge = actionBadge(t.action, t.close_reason);
              const clickable = isClose(t);
              return (
                <div
                  key={t.id}
                  className={`grid grid-cols-10 gap-2 text-xs font-mono py-2 border-b border-border/30 last:border-0 hover:bg-border/10 ${clickable ? "cursor-pointer" : ""}`}
                  onClick={clickable ? () => setSelectedTrade(t) : undefined}
                >
                  <div className="text-secondary truncate">{formatTime(t.timestamp)}</div>
                  <div>
                    <span className={`px-1.5 py-0.5 text-[10px] font-bold border ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-primary truncate">{marketLabel(t)}</div>
                  <div className={t.direction === "long" ? "text-long" : "text-short"}>
                    {t.direction.toUpperCase()}
                  </div>
                  <div className="text-primary">{(() => { const v = positionValue(t); return v !== null ? `$${v.toFixed(2)}` : "—"; })()}</div>
                  <div className="text-primary">{t.entry_price ? `$${t.entry_price.toFixed(2)}` : "—"}</div>
                  <div className="text-primary">{t.exit_price ? `$${t.exit_price.toFixed(2)}` : "—"}</div>
                  <div className={t.pnl !== null ? (t.pnl >= 0 ? "text-long" : "text-short") : "text-secondary"}>
                    {t.pnl !== null ? `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : "—"}
                  </div>
                  <div className="text-secondary">${t.fee_paid.toFixed(4)}</div>
                  <div>
                    {isClose(t) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedTrade(t); }}
                        className="px-2 py-0.5 text-[10px] font-bold border border-accent/40 text-accent hover:bg-accent/10 transition-colors"
                      >
                        PnL
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-2">
            {filtered.map((t) => {
              const badge = actionBadge(t.action, t.close_reason);
              const clickable = isClose(t);
              return (
                <div
                  key={t.id}
                  className={`border border-border/50 bg-bg p-3 space-y-2 ${clickable ? "cursor-pointer" : ""}`}
                  onClick={clickable ? () => setSelectedTrade(t) : undefined}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 text-[10px] font-bold border ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs font-mono text-primary">{marketLabel(t)}</span>
                      <span className={`text-xs font-mono font-bold ${t.direction === "long" ? "text-long" : "text-short"}`}>
                        {t.direction.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isClose(t) && (
                        <button
                          onClick={() => setSelectedTrade(t)}
                          className="px-2 py-0.5 text-[10px] font-bold border border-accent/40 text-accent hover:bg-accent/10 transition-colors"
                        >
                          PnL
                        </button>
                      )}
                      <span className="text-[10px] font-mono text-secondary">{formatTimeShort(t.timestamp)}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                    <div>
                      <div className="text-secondary text-[10px]">Size</div>
                      <div className="text-primary">{(() => { const v = positionValue(t); return v !== null ? `$${v.toFixed(0)}` : "—"; })()}</div>
                    </div>
                    <div>
                      <div className="text-secondary text-[10px]">Entry</div>
                      <div className="text-primary">{t.entry_price ? `$${t.entry_price.toFixed(2)}` : "—"}</div>
                    </div>
                    <div>
                      <div className="text-secondary text-[10px]">PnL</div>
                      <div className={t.pnl !== null ? (t.pnl >= 0 ? "text-long" : "text-short") : "text-secondary"}>
                        {t.pnl !== null ? `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {trades.length < total && (
            <button
              onClick={() => setLimit((l) => l + 20)}
              disabled={loading}
              className="w-full mt-3 py-2.5 text-xs border border-border text-secondary hover:text-primary hover:border-secondary transition-colors"
            >
              {loading ? "Loading..." : `Load more (${trades.length} of ${total})`}
            </button>
          )}
        </>
      )}
      {selectedTrade && (
        <TradeExportModal trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
      )}
    </div>
  );
}
