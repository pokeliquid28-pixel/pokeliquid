"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { NotificationBell } from "./NotificationBell";
import { useOracle, OracleHealth } from "@/hooks/useOracle";
import { MARKETS } from "@/lib/markets";

// ─── Nav config ────────────────────────────────────────────────────────────────

const NAV = [
  { href: "/", label: "TRADE" },
  { href: "/pool", label: "POOL" },
  { href: "/stats", label: "STATS" },
  { href: "/leaderboard", label: "LEADERBOARD" },
];

// ─── Oracle health ──────────────────────────────────────────────────────────────

const ORACLE_DOT_COLOR: Record<OracleHealth, string> = {
  fresh: "#00ff41",
  degraded: "#ffaa00",
  stale: "#ff3333",
};

const ORACLE_LABEL: Record<OracleHealth, string> = {
  fresh: "Oracle OK",
  degraded: "Oracle Degraded",
  stale: "Oracle Stale",
};

function OracleDot() {
  const { health, isLoading } = useOracle();
  if (isLoading) {
    return (
      <span
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          background: "#333",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      title={ORACLE_LABEL[health]}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        background: ORACLE_DOT_COLOR[health],
        flexShrink: 0,
        boxShadow: `0 0 6px ${ORACLE_DOT_COLOR[health]}`,
      }}
    />
  );
}

// ─── Ticker Bar ─────────────────────────────────────────────────────────────────

function TickerBar() {
  const { price, readings, isLoading } = useOracle();

  const priceUsd = price / 1_000_000;

  // Compute % change from oldest available reading vs current
  let pctChange = 0;
  if (readings.length >= 2) {
    const oldest = readings[0].price / 1_000_000;
    if (oldest > 0) {
      pctChange = ((priceUsd - oldest) / oldest) * 100;
    }
  }

  const positive = pctChange >= 0;
  const changeColor = positive ? "#00ff41" : "#ff3333";
  const changePrefix = positive ? "+" : "";

  // Build ticker items — one per market (only one currently)
  const items = MARKETS.map((m) => ({
    id: m.id,
    name: m.name,
    price: isLoading ? "-.--" : priceUsd.toFixed(2),
    change: isLoading ? "+0.00%" : `${changePrefix}${pctChange.toFixed(1)}%`,
    color: isLoading ? "#666" : changeColor,
  }));

  // Duplicate for seamless loop — minimum 6 copies so there's always content off-screen
  const copies = Math.max(6, Math.ceil(12 / items.length));
  const repeated = Array.from({ length: copies }, () => items).flat();

  return (
    <>
      <style>{`
        @keyframes ticker-scroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          width: max-content;
          animation: ticker-scroll 28s linear infinite;
          will-change: transform;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
      `}</style>
      <div
        style={{
          background: "#111111",
          borderBottom: "1px solid #1a1a1a",
          height: 28,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontSize: 11,
          position: "relative",
        }}
      >
        <div className="ticker-track">
          {repeated.map((item, i) => (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                paddingRight: 40,
                whiteSpace: "nowrap",
                color: "#666",
              }}
            >
              <span style={{ color: "#888", letterSpacing: "0.05em" }}>
                {item.name}
              </span>
              <span style={{ color: item.color }}>{item.change}</span>
              <span style={{ color: "#ccc" }}>${item.price}</span>
              <span style={{ color: "#2a2a2a", paddingLeft: 16 }}>|</span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────────

export function Header() {
  const pathname = usePathname();

  return (
    <>
      {/* Main header bar */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "#0a0a0a",
          borderBottom: "1px solid #1a1a1a",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        }}
      >
        <div
          style={{
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: 16,
            paddingRight: 16,
            gap: 8,
          }}
        >
          {/* Left: wordmark */}
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              flexShrink: 0,
              letterSpacing: "0.08em",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <span style={{ color: "#ffffff" }}>POKE</span>
            <span style={{ color: "#00ff41" }}>LIQUID</span>
          </Link>

          {/* Center: nav (hidden on mobile) */}
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              flex: 1,
              justifyContent: "center",
            }}
            className="hidden md:flex"
          >
            {NAV.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    textDecoration: "none",
                    padding: "0 14px",
                    height: 44,
                    display: "flex",
                    alignItems: "center",
                    color: active ? "#00ff41" : "#666",
                    borderBottom: active
                      ? "2px solid #00ff41"
                      : "2px solid transparent",
                    transition: "color 0.15s, border-color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLAnchorElement).style.color =
                        "#ffffff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLAnchorElement).style.color =
                        "#666";
                    }
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right: oracle dot + DEVNET badge + bell + wallet */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <OracleDot />

            {/* DEVNET badge */}
            <span
              className="hidden md:inline"
              style={{
                fontSize: 9,
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                color: "#ff3333",
                border: "1px solid #ff3333",
                padding: "1px 5px",
                letterSpacing: "0.1em",
                lineHeight: 1.4,
              }}
            >
              DEVNET
            </span>

            <NotificationBell />
            <WalletButton />
          </div>
        </div>

        {/* Ticker bar */}
        <TickerBar />
      </header>

      {/* Bottom tab bar (mobile only) */}
      <BottomTabBar pathname={pathname} />
    </>
  );
}

// ─── Bottom Tab Bar (mobile) ─────────────────────────────────────────────────

const MOBILE_TABS = [
  { href: "/", label: "TRADE", icon: "\u26A1" },
  { href: "/pool", label: "POOL", icon: "\uD83D\uDCA7" },
  { href: "/stats", label: "STATS", icon: "\uD83D\uDCCA" },
  { href: "/leaderboard", label: "BOARD", icon: "\uD83C\uDFC6" },
];

function BottomTabBar({ pathname }: { pathname: string }) {
  return (
    <nav
      className="flex md:hidden"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: 56,
        background: "#111111",
        borderTop: "1px solid #1a1a1a",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      }}
    >
      {MOBILE_TABS.map(({ href, label, icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              textDecoration: "none",
              color: active ? "#00ff41" : "#555",
              transition: "color 0.15s",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
            <span
              style={{
                fontSize: 9,
                letterSpacing: "0.06em",
                fontWeight: active ? 700 : 400,
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
