"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_PRICE_API || "/api/keeper";

// ── Types ────────────────────────────────────────────────────────────────────

type Trade = {
  user_pubkey: string;
  action: string;
  pnl: number | null;
  notional: number;
  direction: string;
};

type TradesResponse = {
  trades: Trade[];
  total: number;
};

type TraderRow = {
  pubkey: string;
  totalPnl: number;
  wins: number;
  trades: number;
  volume: number;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncateWallet(pubkey: string): string {
  if (pubkey.length <= 8) return pubkey;
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
}

function formatPnl(pnl: number): string {
  const abs = Math.abs(pnl);
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return pnl >= 0 ? `+$${formatted}` : `-$${formatted}`;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`;
  return `$${vol.toFixed(2)}`;
}

function aggregateTrades(trades: Trade[]): TraderRow[] {
  const map = new Map<string, TraderRow>();

  for (const trade of trades) {
    const existing = map.get(trade.user_pubkey);
    const pnl = trade.pnl ?? 0;
    const isWin = trade.pnl !== null && trade.pnl > 0;

    if (existing) {
      existing.totalPnl += pnl;
      existing.wins += isWin ? 1 : 0;
      existing.trades += 1;
      existing.volume += trade.notional;
    } else {
      map.set(trade.user_pubkey, {
        pubkey: trade.user_pubkey,
        totalPnl: pnl,
        wins: isWin ? 1 : 0,
        trades: 1,
        volume: trade.notional,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalPnl - a.totalPnl);
}

function rankColor(rank: number): string {
  if (rank === 1) return "#ffaa00";
  if (rank === 2) return "#c0c0c0";
  if (rank === 3) return "#cd7f32";
  return "#666666";
}

// ── Hook ─────────────────────────────────────────────────────────────────────

function useLeaderboard() {
  const [rows, setRows] = useState<TraderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch(`${API_BASE}/trades?limit=1000`)
        .then((r) => r.json())
        .then((data: TradesResponse) => {
          setRows(aggregateTrades(data.trades ?? []));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };

    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return { rows, loading };
}

// ── Page ─────────────────────────────────────────────────────────────────────

const COL_HEADERS = ["RANK", "WALLET", "TOTAL PnL", "WIN RATE", "TRADES", "VOLUME"];

export default function LeaderboardPage() {
  const { rows, loading } = useLeaderboard();

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0a0a",
        fontFamily: "'JetBrains Mono', 'Fira Mono', 'Consolas', monospace",
        padding: "32px 24px",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "0.05em",
            }}
          >
            LEADERBOARD
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#666666",
              marginTop: 4,
            }}
          >
            Top traders by total PnL
          </div>
        </div>

        {/* Table container */}
        <div
          style={{
            backgroundColor: "#111111",
            border: "1px solid #1a1a1a",
          }}
        >
          {/* Column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr 130px 100px 80px 110px",
              borderBottom: "1px solid #1a1a1a",
              padding: "10px 16px",
            }}
          >
            {COL_HEADERS.map((h) => (
              <div
                key={h}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#666666",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Body */}
          {loading ? (
            <div
              style={{
                padding: "48px 16px",
                textAlign: "center",
                fontSize: 12,
                color: "#666666",
              }}
            >
              Loading leaderboard...
            </div>
          ) : rows.length === 0 ? (
            <div
              style={{
                padding: "48px 16px",
                textAlign: "center",
                fontSize: 12,
                color: "#666666",
              }}
            >
              No trades yet — be the first
            </div>
          ) : (
            rows.map((row, idx) => {
              const rank = idx + 1;
              const winRate =
                row.trades > 0
                  ? ((row.wins / row.trades) * 100).toFixed(1)
                  : "0.0";
              const isEven = idx % 2 === 0;

              return (
                <div
                  key={row.pubkey}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 1fr 130px 100px 80px 110px",
                    padding: "10px 16px",
                    backgroundColor: isEven ? "#111111" : "#0a0a0a",
                    borderBottom: "1px solid #1a1a1a",
                    alignItems: "center",
                  }}
                >
                  {/* Rank */}
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: rankColor(rank),
                    }}
                  >
                    #{rank}
                  </div>

                  {/* Wallet */}
                  <div
                    style={{
                      fontSize: 12,
                      color: "#cccccc",
                      letterSpacing: "0.02em",
                    }}
                    title={row.pubkey}
                  >
                    {truncateWallet(row.pubkey)}
                  </div>

                  {/* Total PnL */}
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: row.totalPnl >= 0 ? "#00ff41" : "#ff3333",
                    }}
                  >
                    {formatPnl(row.totalPnl)}
                  </div>

                  {/* Win Rate */}
                  <div style={{ fontSize: 12, color: "#cccccc" }}>
                    {winRate}%
                  </div>

                  {/* Trades */}
                  <div style={{ fontSize: 12, color: "#cccccc" }}>
                    {row.trades}
                  </div>

                  {/* Volume */}
                  <div style={{ fontSize: 12, color: "#cccccc" }}>
                    {formatVolume(row.volume)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
