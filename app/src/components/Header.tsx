"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, Droplets, BarChart2, Trophy } from "lucide-react";
import { WalletButton } from "./WalletButton";
import { NotificationBell } from "./NotificationBell";
import { Logo } from "./Logo";
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

// ─── Desktop Ticker Bar ─────────────────────────────────────────────────────────

function TickerBar() {
  const { price, readings, isLoading } = useOracle();

  const priceUsd = price / 1_000_000;

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

  const items = MARKETS.map((m) => ({
    id: m.id,
    name: m.name,
    price: isLoading ? "-.--" : priceUsd.toFixed(2),
    change: isLoading ? "+0.00%" : `${changePrefix}${pctChange.toFixed(1)}%`,
    color: isLoading ? "#666" : changeColor,
    live: m.live,
  }));

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
              <span style={{ color: item.live ? "#888" : "#444", letterSpacing: "0.05em" }}>
                {item.name}
              </span>
              {item.live ? (
                <>
                  <span style={{ color: item.color }}>{item.change}</span>
                  <span style={{ color: "#ccc" }}>${item.price}</span>
                </>
              ) : (
                <span style={{ color: "#444" }}>SOON</span>
              )}
              <span style={{ color: "#2a2a2a", paddingLeft: 16 }}>|</span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Mobile Market Selector ─────────────────────────────────────────────────────

function MobileMarketSelector() {
  const { price, readings, isLoading } = useOracle();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const priceUsd = price / 1_000_000;
  let pctChange = 0;
  if (readings.length >= 2) {
    const oldest = readings[0].price / 1_000_000;
    if (oldest > 0) pctChange = ((priceUsd - oldest) / oldest) * 100;
  }
  const positive = pctChange >= 0;
  const changeColor = positive ? "#00ff41" : "#ff3333";

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const activeMarket = MARKETS.find((m) => m.live) || MARKETS[0];

  return (
    <div
      ref={ref}
      className="flex md:hidden relative"
      style={{
        background: "#111111",
        borderBottom: "1px solid #1a1a1a",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 11,
        }}
      >
        <span style={{ color: "#ccc", letterSpacing: "0.04em" }}>{activeMarket.name}</span>
        <span style={{ color: "#555", fontSize: 10 }}>{open ? "\u25B2" : "\u25BC"}</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 60,
            background: "#111111",
            border: "1px solid #1a1a1a",
            borderTop: "none",
          }}
        >
          {MARKETS.map((m) => (
            <button
              key={m.id}
              disabled={!m.live}
              onClick={() => setOpen(false)}
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "10px 16px",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid #1a1a1a",
                cursor: m.live ? "pointer" : "not-allowed",
                opacity: m.live ? 1 : 0.4,
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    background: m.live ? "#00ff41" : "#333",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: "#ccc", fontSize: 11, letterSpacing: "0.04em" }}>{m.name}</span>
              </div>
              <div style={{ paddingLeft: 14, fontSize: 10 }}>
                {m.live ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "#ccc" }}>${isLoading ? "-.--" : priceUsd.toFixed(2)}</span>
                    <span style={{ color: changeColor }}>
                      {isLoading ? "+0.0%" : `${positive ? "+" : ""}${pctChange.toFixed(1)}%`}
                    </span>
                    <span style={{ color: "#00ff41", fontSize: 9, border: "1px solid rgba(0,255,65,.3)", padding: "0 4px" }}>{m.badge}</span>
                  </span>
                ) : (
                  <span style={{ color: "#555", fontSize: 10 }}>SOON</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────────

export function Header() {
  const pathname = usePathname();

  return (
    <>
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
          {/* Left: logo */}
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            <span className="hidden md:block"><Logo size={32} /></span>
            <span className="block md:hidden"><Logo size={28} /></span>
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

        {/* Desktop: scrolling ticker bar */}
        <TickerBar />
        {/* Mobile: compact market selector */}
        <MobileMarketSelector />
      </header>

      {/* Bottom tab bar (mobile only) */}
      <BottomTabBar pathname={pathname} />
    </>
  );
}

// ─── Bottom Tab Bar (mobile) ─────────────────────────────────────────────────

const MOBILE_TABS = [
  { href: "/", label: "TRADE", Icon: Zap },
  { href: "/pool", label: "POOL", Icon: Droplets },
  { href: "/stats", label: "STATS", Icon: BarChart2 },
  { href: "/leaderboard", label: "BOARD", Icon: Trophy },
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
      {MOBILE_TABS.map(({ href, label, Icon }) => {
        const active = pathname === href;
        const color = active ? "#ffffff" : "#444444";
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
              gap: 3,
              textDecoration: "none",
              transition: "color 0.15s",
            }}
          >
            <Icon size={20} color={color} strokeWidth={active ? 2.5 : 1.5} />
            <span
              style={{
                fontSize: 9,
                letterSpacing: "0.06em",
                fontWeight: active ? 700 : 400,
                color: active ? "#00ff41" : "#444444",
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
