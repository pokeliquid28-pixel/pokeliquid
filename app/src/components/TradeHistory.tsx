"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

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
  if (t.market) {
    // Shorten labels like "PRISMATIC-ETB" -> "ETB", "CHARMANDER-038-MEP" -> "CHARMANDER"
    const map: Record<string, string> = {
      "PRISMATIC-ETB": "ETB",
      "CHARIZARD-125/094-PFL": "CHARIZARD",
      "CHARMANDER-038-MEP": "CHARMANDER",
      "PIKACHU-276/217-AH": "PIKACHU",
      "GRENINJA-116/086-CR": "GRENINJA",
      "ASCENDED-HEROES-ETB": "AH-ETB",
    };
    return map[t.market] || t.market;
  }
  // Fallback: infer from entry price for old trades
  const p = t.entry_price;
  if (!p) return "—";
  if (p > 800) return "ETB";
  if (p > 300) return "GRENINJA";
  if (p > 100) return "PIKACHU";
  if (p > 50) return "AH-ETB";
  return "CHARMANDER";
}

function actionBadge(action: string, reason: string | null) {
  if (action === "open") return { label: "OPEN", color: "bg-long/20 text-long border-long/30" };
  if (action === "liquidate") return { label: "LIQUIDATED", color: "bg-short/20 text-short border-short/30" };
  if (action === "sl" || reason === "stop_loss") return { label: "SL", color: "bg-accent/20 text-accent border-accent/30" };
  if (action === "tp" || reason === "take_profit") return { label: "TP", color: "bg-long/20 text-long border-long/30" };
  return { label: "MANUAL", color: "bg-border text-secondary border-border" };
}

export function TradeHistory() {
  const { publicKey } = useWallet();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    if (!publicKey) {
      setTrades([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`${API_BASE}/trades?user=${publicKey.toBase58()}&limit=${limit}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setTrades(data.trades || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [publicKey, limit]);

  if (!publicKey) return null;

  const filtered = trades.filter((t) => {
    if (filter === "all") return true;
    if (filter === "open") return t.action === "open";
    if (filter === "close") return t.action === "close" || t.action === "sl" || t.action === "tp";
    if (filter === "liquidation") return t.action === "liquidate";
    return true;
  });

  return (
    <div className="border border-border bg-panel p-3 md:p-5">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <h2 className="text-[10px] md:text-xs font-semibold text-secondary uppercase tracking-wider">
          Trade History
        </h2>
        <span className="text-[10px] md:text-xs text-secondary font-mono">{total} total</span>
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 md:gap-2 mb-3 md:mb-4 overflow-x-auto">
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

      {loading && trades.length === 0 ? (
        <div className="text-xs text-secondary text-center py-8">Loading trades...</div>
      ) : filtered.length === 0 ? (
        <div className="text-xs text-secondary text-center py-8">No trades found</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <div className="grid grid-cols-9 gap-2 text-xs text-secondary uppercase tracking-wider font-semibold border-b border-border pb-2 mb-2">
              <div>Time</div>
              <div>Type</div>
              <div>Market</div>
              <div>Dir</div>
              <div>Size</div>
              <div>Entry</div>
              <div>Exit</div>
              <div>PnL</div>
              <div>Fee</div>
            </div>

            {filtered.map((t) => {
              const badge = actionBadge(t.action, t.close_reason);
              return (
                <div
                  key={t.id}
                  className="grid grid-cols-9 gap-2 text-xs font-mono py-2 border-b border-border/30 last:border-0 hover:bg-border/10"
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
                  <div className="text-primary">${t.notional.toFixed(2)}</div>
                  <div className="text-primary">{t.entry_price ? `$${t.entry_price.toFixed(2)}` : "—"}</div>
                  <div className="text-primary">{t.exit_price ? `$${t.exit_price.toFixed(2)}` : "—"}</div>
                  <div className={t.pnl !== null ? (t.pnl >= 0 ? "text-long" : "text-short") : "text-secondary"}>
                    {t.pnl !== null ? `${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}` : "—"}
                  </div>
                  <div className="text-secondary">${t.fee_paid.toFixed(4)}</div>
                </div>
              );
            })}
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-2">
            {filtered.map((t) => {
              const badge = actionBadge(t.action, t.close_reason);
              return (
                <div key={t.id} className="border border-border/50 bg-bg p-3 space-y-2">
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
                    <span className="text-[10px] font-mono text-secondary">{formatTimeShort(t.timestamp)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                    <div>
                      <div className="text-secondary text-[10px]">Size</div>
                      <div className="text-primary">${t.notional.toFixed(0)}</div>
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
    </div>
  );
}
