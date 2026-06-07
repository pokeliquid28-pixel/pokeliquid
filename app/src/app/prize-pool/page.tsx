"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const API_BASE = process.env.NEXT_PUBLIC_PRICE_API || "/api/keeper";

const CONTEST_END = new Date("2026-06-20T23:59:59Z");

// ── Types ────────────────────────────────────────────────────────────────────

type Trade = {
  user_pubkey: string;
  action: string;
  pnl: number | null;
  notional: number;
  direction: string;
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
  const formatted = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
      map.set(trade.user_pubkey, { pubkey: trade.user_pubkey, totalPnl: pnl, wins: isWin ? 1 : 0, trades: 1, volume: trade.notional });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.volume - a.volume);
}

function rankColor(rank: number): string {
  if (rank === 1) return "#ffaa00";
  if (rank === 2) return "#c0c0c0";
  if (rank === 3) return "#cd7f32";
  return "#666666";
}

// ── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, CONTEST_END.getTime() - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  const ended = diff === 0;

  return { days, hours, minutes, seconds, ended };
}

// ── Leaderboard hook ─────────────────────────────────────────────────────────

type BonusWinner = { pubkey: string; pnl: number; timestamp: number; paid?: boolean };

// Wallets that have been paid out already
const PAID_WALLETS = new Set([
  "26FUVaUHbRmMvYM64UWG28HyxoYZoRW4uWbvB5yiPFaP",
  "F1pVGJtAuXbKXVfCAsfbZ82ZZZbzndw98eznW6EcF9RE",
]);

function useLeaderboard() {
  const [rows, setRows] = useState<TraderRow[]>([]);
  const [bonusWinners, setBonusWinners] = useState<BonusWinner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch(`${API_BASE}/trades/recent?limit=200`)
        .then((r) => r.json())
        .then((data) => {
          const trades: Trade[] = data.trades ?? [];
          setRows(aggregateTrades(trades));

          // Find first 4 unique wallets to close a trade with PnL > $5
          const winners: BonusWinner[] = [];
          const seen = new Set<string>();
          const closed = trades
            .filter((t) => t.action === "close" && t.pnl !== null && t.pnl > 5)
            .sort((a, b) => (a as any).timestamp - (b as any).timestamp);
          for (const t of closed) {
            if (!seen.has(t.user_pubkey) && winners.length < 4) {
              seen.add(t.user_pubkey);
              winners.push({ pubkey: t.user_pubkey, pnl: t.pnl!, timestamp: (t as any).timestamp ?? 0, paid: PAID_WALLETS.has(t.user_pubkey) });
            }
          }
          setBonusWinners(winners);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return { rows, bonusWinners, loading };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PrizePoolPage() {
  return <PrizePoolContent />;
}

function PrizePoolContent() {
  const { days, hours, minutes, seconds, ended } = useCountdown();
  const { rows, bonusWinners, loading } = useLeaderboard();

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
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 11, color: "#00ff41", letterSpacing: "0.15em", fontWeight: 600, marginBottom: 8 }}>
            TRADING COMPETITION
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#ffffff", margin: 0, letterSpacing: "-0.02em" }}>
            PRIZE POOL
          </h1>
        </div>

        {/* Prize card + countdown */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 32,
            marginBottom: 48,
          }}
        >
          {/* Mew ex card */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                border: "2px solid #ffaa00",
                padding: 4,
                backgroundColor: "#111111",
                boxShadow: "0 0 30px rgba(255, 170, 0, 0.15)",
              }}
            >
              <Image
                src="/mew-ex-prize.jpeg"
                alt="Mew ex 232/091 - Prize Card"
                width={280}
                height={390}
                style={{ display: "block" }}
                priority
              />
            </div>
            <div
              style={{
                position: "absolute",
                top: -12,
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: "#ffaa00",
                color: "#000000",
                fontSize: 10,
                fontWeight: 800,
                padding: "4px 14px",
                letterSpacing: "0.1em",
                whiteSpace: "nowrap",
              }}
            >
              1ST PLACE PRIZE
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#999999", marginBottom: 4 }}>
              Mew ex 232/091 &middot; Paldean Fates &middot; Illustration Rare
            </div>
            <div style={{ fontSize: 11, color: "#666666" }}>
              Shipped to winner worldwide &middot; PSA grading eligible
            </div>
          </div>

          {/* Countdown */}
          <div
            style={{
              border: "1px solid #1a1a1a",
              backgroundColor: "#111111",
              padding: "20px 32px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 10, color: "#666666", letterSpacing: "0.1em", marginBottom: 12 }}>
              {ended ? "COMPETITION ENDED" : "TIME REMAINING"}
            </div>
            {ended ? (
              <div style={{ fontSize: 16, color: "#ff3333", fontWeight: 700 }}>
                Competition has ended
              </div>
            ) : (
              <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
                {[
                  { value: days, label: "DAYS" },
                  { value: hours, label: "HRS" },
                  { value: minutes, label: "MIN" },
                  { value: seconds, label: "SEC" },
                ].map((t) => (
                  <div key={t.label}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#00ff41", lineHeight: 1 }}>
                      {String(t.value).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: 9, color: "#666666", marginTop: 4, letterSpacing: "0.08em" }}>
                      {t.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#999999", marginTop: 12 }}>
              Ends June 20, 2026 at 11:59:59 PM UTC
            </div>
          </div>
        </div>

        {/* Rules */}
        <div
          style={{
            border: "1px solid #1a1a1a",
            backgroundColor: "#111111",
            padding: "24px",
            marginBottom: 40,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#ffffff", letterSpacing: "0.05em", marginBottom: 16 }}>
            HOW TO WIN
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              {
                num: "01",
                title: "Trade any market on Pokeliquid",
                desc: "Open long or short positions on any of our Pokemon card perpetual markets. All markets count toward your volume.",
              },
              {
                num: "02",
                title: "Accumulate the most trading volume",
                desc: "Every position you open adds to your total volume. The trader with the highest cumulative volume by the deadline wins.",
              },
              {
                num: "03",
                title: "Win the Mew ex card",
                desc: "The #1 volume trader when the clock hits zero takes home the Mew ex 232/091 Illustration Rare, shipped anywhere in the world.",
              },
            ].map((rule) => (
              <div key={rule.num} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#00ff41",
                    minWidth: 36,
                    lineHeight: 1,
                    paddingTop: 2,
                  }}
                >
                  {rule.num}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", marginBottom: 4 }}>
                    {rule.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#999999", lineHeight: 1.5 }}>
                    {rule.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid #1a1a1a",
              fontSize: 11,
              color: "#666666",
              lineHeight: 1.6,
            }}
          >
            <span style={{ color: "#999999", fontWeight: 600 }}>Rules:</span>{" "}
            Volume is calculated from the notional value of each position opened.
            Only positions opened during the competition period count.
            One winner. No wash trading — suspicious activity will be disqualified.
            Winner will be contacted via on-chain message or Twitter/X DM to arrange shipping.
          </div>
        </div>

        {/* Bonus Prize */}
        <div
          style={{
            border: "1px solid #1a1a1a",
            backgroundColor: "#111111",
            padding: "24px",
            marginBottom: 40,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#ffffff", letterSpacing: "0.05em" }}>
              BONUS: $100 USDC BOUNTY
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 700,
                backgroundColor: "#00ff41",
                color: "#000000",
                padding: "2px 8px",
                letterSpacing: "0.08em",
              }}
            >
              {bonusWinners.filter(w => w.paid).length} PAID · {bonusWinners.length}/4 CLAIMED
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#999999", lineHeight: 1.6, marginBottom: 20 }}>
            The first <span style={{ color: "#ffffff", fontWeight: 600 }}>4 traders</span> to close a position
            with a realized PnL greater than <span style={{ color: "#00ff41", fontWeight: 600 }}>$5.00</span> each
            win <span style={{ color: "#ffaa00", fontWeight: 600 }}>$100 USDC</span>, sent directly to their wallet.
          </div>

          {/* Slots */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {[0, 1, 2, 3].map((i) => {
              const winner = bonusWinners[i];
              return (
                <div
                  key={i}
                  style={{
                    border: winner ? (winner.paid ? "1px solid #ffaa00" : "1px solid #00ff41") : "1px solid #222222",
                    backgroundColor: winner ? (winner.paid ? "rgba(255, 170, 0, 0.05)" : "rgba(0, 255, 65, 0.03)") : "#0a0a0a",
                    padding: "14px 16px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 10, color: "#666666", letterSpacing: "0.08em", marginBottom: 8 }}>
                    SLOT #{i + 1}
                  </div>
                  {winner ? (
                    <>
                      <div style={{ fontSize: 12, color: winner.paid ? "#ffaa00" : "#00ff41", fontWeight: 700, marginBottom: 4 }}>
                        {winner.paid ? "PAID ✓" : "CLAIMED"}
                      </div>
                      <div style={{ fontSize: 11, color: "#cccccc" }} title={winner.pubkey}>
                        {truncateWallet(winner.pubkey)}
                      </div>
                      <div style={{ fontSize: 10, color: "#00ff41", marginTop: 4 }}>
                        +${winner.pnl.toFixed(2)} PnL
                      </div>
                      {winner.paid && (
                        <div style={{ fontSize: 9, color: "#ffaa00", marginTop: 2 }}>
                          $100 USDC sent
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 16, color: "#ffaa00", fontWeight: 800, marginBottom: 4 }}>
                        $100
                      </div>
                      <div style={{ fontSize: 10, color: "#666666" }}>
                        UNCLAIMED
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 10, color: "#666666", marginTop: 12, lineHeight: 1.5 }}>
            First come, first served. One claim per wallet. Close any position with {">"}$5 realized profit to qualify.
          </div>
        </div>

        {/* Volume Leaderboard */}
        <div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#ffffff", letterSpacing: "0.05em" }}>
              VOLUME LEADERBOARD
            </div>
            <div style={{ fontSize: 12, color: "#666666", marginTop: 4 }}>
              Top traders by total trading volume
            </div>
          </div>

          <div style={{ backgroundColor: "#111111", border: "1px solid #1a1a1a", overflowX: "auto" }}>
            {/* Desktop header */}
            <div
              className="hidden md:grid"
              style={{
                gridTemplateColumns: "60px minmax(100px, 1fr) minmax(100px, 130px) 90px 70px 100px",
                gap: 12,
                borderBottom: "1px solid #1a1a1a",
                padding: "10px 16px",
              }}
            >
              {["RANK", "WALLET", "VOLUME", "WIN RATE", "TRADES", "TOTAL PNL"].map((h) => (
                <div
                  key={h}
                  style={{ fontSize: 10, fontWeight: 600, color: "#666666", textTransform: "uppercase", letterSpacing: "0.08em" }}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Mobile header */}
            <div
              className="grid md:hidden"
              style={{
                gridTemplateColumns: "50px 1fr minmax(80px, auto)",
                gap: 8,
                borderBottom: "1px solid #1a1a1a",
                padding: "10px 12px",
              }}
            >
              {["RANK", "WALLET", "VOLUME"].map((h) => (
                <div
                  key={h}
                  style={{ fontSize: 10, fontWeight: 600, color: "#666666", textTransform: "uppercase", letterSpacing: "0.08em" }}
                >
                  {h}
                </div>
              ))}
            </div>

            {/* Body */}
            {loading ? (
              <div style={{ padding: "48px 16px", textAlign: "center", fontSize: 12, color: "#666666" }}>
                Loading...
              </div>
            ) : rows.length === 0 ? (
              <div style={{ padding: "48px 16px", textAlign: "center", fontSize: 12, color: "#666666" }}>
                No trades yet — be the first
              </div>
            ) : (
              rows.map((row, idx) => {
                const rank = idx + 1;
                const winRate = row.trades > 0 ? ((row.wins / row.trades) * 100).toFixed(1) : "0.0";
                const isEven = idx % 2 === 0;

                return (
                  <div key={row.pubkey}>
                    {/* Desktop row */}
                    <div
                      className="hidden md:grid"
                      style={{
                        gridTemplateColumns: "60px minmax(100px, 1fr) minmax(100px, 130px) 90px 70px 100px",
                        gap: 12,
                        padding: "10px 16px",
                        backgroundColor: rank === 1 ? "rgba(255, 170, 0, 0.05)" : isEven ? "#111111" : "#0a0a0a",
                        borderBottom: "1px solid #1a1a1a",
                        borderLeft: rank === 1 ? "2px solid #ffaa00" : "2px solid transparent",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: rankColor(rank) }}>
                        #{rank}
                      </div>
                      <div style={{ fontSize: 12, color: "#cccccc", letterSpacing: "0.02em" }} title={row.pubkey}>
                        {truncateWallet(row.pubkey)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#cccccc" }}>
                        {formatVolume(row.volume)}
                      </div>
                      <div style={{ fontSize: 12, color: "#cccccc" }}>{winRate}%</div>
                      <div style={{ fontSize: 12, color: "#cccccc" }}>{row.trades}</div>
                      <div style={{ fontSize: 12, color: row.totalPnl >= 0 ? "#00ff41" : "#ff3333" }}>
                        {formatPnl(row.totalPnl)}
                      </div>
                    </div>

                    {/* Mobile row */}
                    <div
                      className="grid md:hidden"
                      style={{
                        gridTemplateColumns: "50px 1fr minmax(80px, auto)",
                        gap: 8,
                        padding: "10px 12px",
                        backgroundColor: rank === 1 ? "rgba(255, 170, 0, 0.05)" : isEven ? "#111111" : "#0a0a0a",
                        borderBottom: "1px solid #1a1a1a",
                        borderLeft: rank === 1 ? "2px solid #ffaa00" : "2px solid transparent",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: rankColor(rank) }}>
                        #{rank}
                      </div>
                      <div style={{ fontSize: 11, color: "#cccccc", letterSpacing: "0.02em" }} title={row.pubkey}>
                        {truncateWallet(row.pubkey)}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, textAlign: "right", color: "#cccccc" }}>
                        {formatVolume(row.volume)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
