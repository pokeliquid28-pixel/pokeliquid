"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

const API_BASE = process.env.NEXT_PUBLIC_PRICE_API || "/api/keeper";
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=358c9ec3-db8b-46a1-ac6c-d702d3a19340";
const PROGRAM_ID = new PublicKey("5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6");
const REFERRAL_SEED = Buffer.from("referral");

// ── Types ────────────────────────────────────────────────────────────────────

type TraderRow = {
  pubkey: string;
  totalPnl: number;
  wins: number;
  trades: number;
  volume: number;
  username?: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncateWallet(pubkey: string): string {
  if (pubkey.length <= 8) return pubkey;
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
}

function displayName(row: TraderRow): string {
  return row.username || truncateWallet(row.pubkey);
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
    const load = async () => {
      try {
        const r = await fetch(`${API_BASE}/leaderboard`);
        const data = await r.json();
        const traders: TraderRow[] = (data.traders ?? []).map((t: { user_pubkey: string; total_pnl: number; wins: number; trades: number; volume: number }) => ({
          pubkey: t.user_pubkey,
          totalPnl: t.total_pnl,
          wins: t.wins,
          trades: t.trades,
          volume: t.volume,
        }));

        // Batch-fetch referral usernames
        try {
          const connection = new Connection(RPC_URL, "confirmed");
          const pdas = traders.map((t) => {
            const [pda] = PublicKey.findProgramAddressSync(
              [REFERRAL_SEED, new PublicKey(t.pubkey).toBuffer()],
              PROGRAM_ID,
            );
            return pda;
          });
          const accounts = await connection.getMultipleAccountsInfo(pdas);
          accounts.forEach((acc, i) => {
            if (!acc?.data || acc.data.length < 73) return;
            const usernameLen = acc.data[72];
            if (usernameLen > 0 && usernameLen <= 32) {
              const username = acc.data.slice(40, 40 + usernameLen).toString("utf-8").replace(/\0/g, "");
              if (username.length > 0) traders[i].username = username;
            }
          });
        } catch {}

        setRows(traders);
      } catch {}
      setLoading(false);
    };

    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return { rows, loading };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  return <LeaderboardContent />;
}

function LeaderboardTable({
  title,
  subtitle,
  rows,
  loading,
  sortBy,
}: {
  title: string;
  subtitle: string;
  rows: TraderRow[];
  loading: boolean;
  sortBy: "pnl" | "volume";
}) {
  const sorted =
    sortBy === "volume"
      ? [...rows].sort((a, b) => b.volume - a.volume)
      : rows; // already sorted by PnL from aggregateTrades

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#ffffff",
            letterSpacing: "0.05em",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 12, color: "#666666", marginTop: 4 }}>
          {subtitle}
        </div>
      </div>

      <div
        style={{
          backgroundColor: "#111111",
          border: "1px solid #1a1a1a",
          overflowX: "auto",
        }}
      >
        {/* Column headers — desktop */}
        <div
          className="hidden md:grid"
          style={{
            gridTemplateColumns: "60px minmax(100px, 1fr) minmax(100px, 130px) 90px 70px 100px",
            gap: 12,
            borderBottom: "1px solid #1a1a1a",
            padding: "10px 16px",
          }}
        >
          {["RANK", "WALLET", sortBy === "volume" ? "VOLUME" : "TOTAL PNL", "WIN RATE", "TRADES", sortBy === "volume" ? "TOTAL PNL" : "VOLUME"].map((h) => (
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

        {/* Column headers — mobile */}
        <div
          className="grid md:hidden"
          style={{
            gridTemplateColumns: "50px 1fr minmax(80px, auto)",
            gap: 8,
            borderBottom: "1px solid #1a1a1a",
            padding: "10px 12px",
          }}
        >
          {["RANK", "WALLET", sortBy === "volume" ? "VOLUME" : "TOTAL PNL"].map((h) => (
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
        ) : sorted.length === 0 ? (
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
          sorted.map((row, idx) => {
            const rank = idx + 1;
            const winRate =
              row.trades > 0
                ? ((row.wins / row.trades) * 100).toFixed(1)
                : "0.0";
            const isEven = idx % 2 === 0;
            const primaryValue = sortBy === "volume" ? row.volume : row.totalPnl;
            const secondaryValue = sortBy === "volume" ? row.totalPnl : row.volume;

            return (
              <div key={row.pubkey}>
                {/* Desktop row */}
                <div
                  className="hidden md:grid"
                  style={{
                    gridTemplateColumns: "60px minmax(100px, 1fr) minmax(100px, 130px) 90px 70px 100px",
                    gap: 12,
                    padding: "10px 16px",
                    backgroundColor: isEven ? "#111111" : "#0a0a0a",
                    borderBottom: "1px solid #1a1a1a",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: rankColor(rank) }}>
                    #{rank}
                  </div>
                  <div
                    style={{ fontSize: 12, color: "#cccccc", letterSpacing: "0.02em" }}
                    title={row.pubkey}
                  >
                    {displayName(row)}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: sortBy === "volume"
                        ? "#cccccc"
                        : primaryValue >= 0
                          ? "#00ff41"
                          : "#ff3333",
                    }}
                  >
                    {sortBy === "volume" ? formatVolume(primaryValue) : formatPnl(primaryValue)}
                  </div>
                  <div style={{ fontSize: 12, color: "#cccccc" }}>{winRate}%</div>
                  <div style={{ fontSize: 12, color: "#cccccc" }}>{row.trades}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: sortBy === "volume"
                        ? secondaryValue >= 0
                          ? "#00ff41"
                          : "#ff3333"
                        : "#cccccc",
                    }}
                  >
                    {sortBy === "volume" ? formatPnl(secondaryValue) : formatVolume(secondaryValue)}
                  </div>
                </div>

                {/* Mobile row */}
                <div
                  className="grid md:hidden"
                  style={{
                    gridTemplateColumns: "50px 1fr minmax(80px, auto)",
                    gap: 8,
                    padding: "10px 12px",
                    backgroundColor: isEven ? "#111111" : "#0a0a0a",
                    borderBottom: "1px solid #1a1a1a",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: rankColor(rank) }}>
                    #{rank}
                  </div>
                  <div
                    style={{ fontSize: 11, color: "#cccccc", letterSpacing: "0.02em" }}
                    title={row.pubkey}
                  >
                    {displayName(row)}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      textAlign: "right",
                      color: sortBy === "volume"
                        ? "#cccccc"
                        : primaryValue >= 0
                          ? "#00ff41"
                          : "#ff3333",
                    }}
                  >
                    {sortBy === "volume" ? formatVolume(primaryValue) : formatPnl(primaryValue)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function LeaderboardContent() {
  const { rows, loading } = useLeaderboard();

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0a0a",
        fontFamily: "'JetBrains Mono', 'Fira Mono', 'Consolas', monospace",
        padding: "32px 16px",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <LeaderboardTable
          title="PNL LEADERBOARD"
          subtitle="Top traders by total PnL"
          rows={rows}
          loading={loading}
          sortBy="pnl"
        />
      </div>
    </div>
  );
}
