"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { toPng } from "html-to-image";

const API_BASE = process.env.NEXT_PUBLIC_PRICE_API || "/api/keeper";

type Trade = {
  id: number;
  timestamp: number;
  action: string;
  direction: string;
  notional: number;
  pnl: number | null;
  fee_paid: number;
  market: string | null;
};

type PnlStats = {
  totalPnl: number;
  totalVolume: number;
  totalTrades: number;
  wins: number;
  losses: number;
  bestTrade: number;
  worstTrade: number;
  totalFees: number;
  topMarket: string | null;
};

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
  "UMBREON-161/131-PE": "UMBREON",
  "MEW-232/091-PF": "MEW",
  "KABUTO-FOSSIL-1E": "KABUTO",
  "GENGAR-284/217-AH": "GENGAR",
  "DRAGONITE-290/217-AH": "DRAGONITE",
  "CLEFAIRY-094/088-PO": "CLEFAIRY",
  "MEGA-GRENINJA-117/086-CR": "MEGA-GREN",
  "CHAOS-RISING-BB": "CR-BB",
  "PIKACHU-238/191-SS": "PIKA-SS",
  "GIRATINA-GG69/GG70-CZ": "GIRATINA",
  "MISTYS-PSYDUCK-193/182-DR": "M-PSYDUCK",
};

function computeStats(trades: Trade[]): PnlStats {
  let totalPnl = 0;
  let totalVolume = 0;
  let totalFees = 0;
  let wins = 0;
  let losses = 0;
  let bestTrade = 0;
  let worstTrade = 0;
  const marketVolume: Record<string, number> = {};

  const closes = trades.filter(
    (t) => t.action === "close" || t.action === "sl" || t.action === "tp" || t.action === "liquidate"
  );

  for (const t of trades) {
    totalVolume += t.notional;
    totalFees += t.fee_paid;
    if (t.market) {
      marketVolume[t.market] = (marketVolume[t.market] || 0) + t.notional;
    }
  }

  for (const t of closes) {
    const pnl = t.pnl ?? 0;
    totalPnl += pnl;
    if (pnl > 0) wins++;
    if (pnl < 0) losses++;
    if (pnl > bestTrade) bestTrade = pnl;
    if (pnl < worstTrade) worstTrade = pnl;
  }

  let topMarket: string | null = null;
  let topVol = 0;
  for (const [m, v] of Object.entries(marketVolume)) {
    if (v > topVol) { topVol = v; topMarket = m; }
  }

  return {
    totalPnl,
    totalVolume,
    totalTrades: trades.length,
    wins,
    losses,
    bestTrade,
    worstTrade,
    totalFees,
    topMarket,
  };
}

function StatBlock({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || "#ccc" }}>
        {value}
      </div>
    </div>
  );
}

export function PnlExportButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-[10px] md:text-xs font-mono border border-border text-secondary hover:text-primary hover:border-primary/50 transition-colors"
      >
        Export PnL
      </button>
      {open && <PnlExportModal onClose={() => setOpen(false)} />}
    </>
  );
}

function PnlExportModal({ onClose }: { onClose: () => void }) {
  const { publicKey } = useWallet();
  const cardRef = useRef<HTMLDivElement>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!publicKey) return;
    fetch(`${API_BASE}/trades?user=${publicKey.toBase58()}&limit=100`)
      .then((r) => r.json())
      .then((data) => setTrades(data.trades || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [publicKey]);

  const handleSave = useCallback(async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: "#0a0a0a",
      });
      const link = document.createElement("a");
      link.download = `pokeliquid-pnl-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Failed to export:", e);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: "#0a0a0a",
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
    } catch (e) {
      console.error("Failed to copy:", e);
    } finally {
      setSaving(false);
    }
  }, []);

  if (!publicKey) return null;

  const stats = computeStats(trades);
  const isProfit = stats.totalPnl >= 0;
  const winRate = stats.wins + stats.losses > 0
    ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)
    : "0.0";
  const addr = publicKey.toBase58();

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 201,
          width: "min(440px, 92vw)",
          fontFamily: "'JetBrains Mono', 'Fira Mono', 'Consolas', monospace",
        }}
      >
        {loading ? (
          <div style={{
            background: "#111",
            border: "1px solid #1a1a1a",
            padding: 48,
            textAlign: "center",
            fontSize: 12,
            color: "#666",
          }}>
            Loading stats...
          </div>
        ) : (
          <>
            {/* The card itself — this gets exported */}
            <div
              ref={cardRef}
              style={{
                background: "#0a0a0a",
                border: "1px solid #1a1a1a",
                padding: 24,
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-192.png" alt="Pokeliquid" width={36} height={36} style={{ objectFit: "contain" }} />
                  <div>
                    <div style={{ fontSize: 12, color: "#00ff41", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 2 }}>
                      POKELIQUID
                    </div>
                    <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.08em" }}>
                      POKEMON CARD PERPS
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.08em" }}>
                    {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
              </div>

              {/* Big PnL number */}
              <div style={{
                textAlign: "center",
                padding: "20px 0",
                borderTop: "1px solid #1a1a1a",
                borderBottom: "1px solid #1a1a1a",
                marginBottom: 20,
              }}>
                <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
                  Total Realized PnL
                </div>
                <div style={{
                  fontSize: 36,
                  fontWeight: 800,
                  color: isProfit ? "#00ff41" : "#ff3333",
                  lineHeight: 1,
                }}>
                  {isProfit ? "+" : ""}${Math.abs(stats.totalPnl).toFixed(2)}
                </div>
                <div style={{
                  fontSize: 11,
                  color: isProfit ? "#00ff41" : "#ff3333",
                  marginTop: 6,
                  opacity: 0.7,
                }}>
                  {isProfit ? "PROFIT" : "LOSS"}
                </div>
              </div>

              {/* Stats grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 16,
                marginBottom: 20,
              }}>
                <StatBlock label="Win Rate" value={`${winRate}%`} color={parseFloat(winRate) >= 50 ? "#00ff41" : "#ff3333"} />
                <StatBlock label="Trades" value={String(stats.totalTrades)} />
                <StatBlock
                  label="Volume"
                  value={stats.totalVolume >= 1000 ? `$${(stats.totalVolume / 1000).toFixed(1)}K` : `$${stats.totalVolume.toFixed(0)}`}
                />
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 16,
                marginBottom: 20,
              }}>
                <StatBlock label="Best Trade" value={`+$${stats.bestTrade.toFixed(2)}`} color="#00ff41" />
                <StatBlock label="Worst Trade" value={`-$${Math.abs(stats.worstTrade).toFixed(2)}`} color="#ff3333" />
                <StatBlock
                  label="Top Market"
                  value={stats.topMarket ? (MARKET_LABELS[stats.topMarket] || stats.topMarket) : "—"}
                  color="#ffaa00"
                />
              </div>

              {/* W/L bar */}
              {(stats.wins + stats.losses) > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#555", marginBottom: 4 }}>
                    <span>{stats.wins}W</span>
                    <span>{stats.losses}L</span>
                  </div>
                  <div style={{ height: 6, display: "flex", overflow: "hidden" }}>
                    <div style={{
                      width: `${(stats.wins / (stats.wins + stats.losses)) * 100}%`,
                      background: "#00ff41",
                      minWidth: stats.wins > 0 ? 4 : 0,
                    }} />
                    <div style={{
                      flex: 1,
                      background: "#ff3333",
                      minWidth: stats.losses > 0 ? 4 : 0,
                    }} />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{
                paddingTop: 12,
                borderTop: "1px solid #1a1a1a",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 9, color: "#333" }}>
                  pokeliquid.xyz
                </div>
              </div>
            </div>

            {/* Action buttons (not part of the exported image) */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: "10px",
                  fontSize: 11,
                  fontWeight: 700,
                  background: "none",
                  border: "1px solid #00ff41",
                  color: "#00ff41",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.5 : 1,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.04em",
                }}
              >
                {saving ? "SAVING..." : "SAVE AS PNG"}
              </button>
              <button
                onClick={handleCopy}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: "10px",
                  fontSize: 11,
                  fontWeight: 700,
                  background: "none",
                  border: "1px solid #888",
                  color: "#ccc",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.5 : 1,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.04em",
                }}
              >
                COPY TO CLIPBOARD
              </button>
            </div>
            <button
              onClick={onClose}
              style={{
                width: "100%",
                marginTop: 8,
                padding: "8px",
                fontSize: 10,
                background: "none",
                border: "1px solid #222",
                color: "#555",
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              CLOSE
            </button>
          </>
        )}
      </div>
    </>
  );
}
