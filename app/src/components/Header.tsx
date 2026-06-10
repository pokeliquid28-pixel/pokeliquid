"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, Droplets, BarChart2, Trophy, BookOpen, Menu, X } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletButton } from "./WalletButton";
import { NotificationBell } from "./NotificationBell";
import { Logo } from "./Logo";
import { useOracle, OracleHealth } from "@/hooks/useOracle";
import { getSavedEmail, clearSessionWallet, SessionWalletName } from "@/lib/session-wallet";
import { clearLastWallet, setForceDisconnect } from "@/providers/SessionWalletProvider";
import { MARKETS } from "@/lib/markets";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SwapModal } from "./SwapModal";
import { SendModal } from "./SendModal";
import { ExportKeyModal } from "./ExportKeyModal";
import { AuthModal } from "./AuthModal";

// ─── Nav config ────────────────────────────────────────────────────────────────

const NAV = [
  { href: "/", label: "TRADE" },
  { href: "/pool", label: "POOL" },
  { href: "/stats", label: "STATS" },
  { href: "/prize-pool", label: "PRIZE POOL" },
  { href: "/leaderboard", label: "LEADERBOARD" },
  { href: "/positions", label: "PORTFOLIO" },
  { href: "/pl500", label: "PL500" },
  { href: "/referral", label: "REFERRAL" },
  { href: "/docs", label: "DOCS" },
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

// ─── Single market ticker item ────────────────────────────────────────────────

function useTickerItem(m: typeof MARKETS[0]) {
  const { price, readings, isLoading } = useOracle(m.oracleAddress, m.priceApiMarket);
  const priceUsd = price / 1_000_000;

  let pctChange = 0;
  if (readings.length >= 2) {
    const oldest = readings[0].price / 1_000_000;
    if (oldest > 0) pctChange = ((priceUsd - oldest) / oldest) * 100;
  }

  const positive = pctChange >= 0;
  return {
    id: m.id,
    name: m.name,
    price: isLoading ? "-.--" : priceUsd.toFixed(2),
    change: isLoading ? "+0.00%" : `${positive ? "+" : ""}${pctChange.toFixed(1)}%`,
    color: isLoading ? "#666" : positive ? "#00ff41" : "#ff3333",
    live: m.live,
  };
}

// ─── Desktop Ticker Bar ─────────────────────────────────────────────────────────

function TickerBar() {
  const item0 = useTickerItem(MARKETS[0]);
  const item1 = useTickerItem(MARKETS[1]);
  const item2 = useTickerItem(MARKETS[2]);
  const item3 = useTickerItem(MARKETS[3]);
  const items = [item0, item1, item2, item3];

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
        className="hidden md:flex"
        style={{
          background: "#111111",
          borderBottom: "1px solid #1a1a1a",
          height: 28,
          overflow: "hidden",
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

// ─── Mobile Hamburger Menu ────────────────────────────────────────────────────

function MobileMenuAction({
  label,
  onClick,
  color = "#ccc",
}: {
  label: string;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: "0.04em",
        padding: "12px 24px",
        background: "none",
        border: "none",
        color,
        cursor: "pointer",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      }}
    >
      {label}
    </button>
  );
}

function MobileMenu({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
}) {
  const { price, lastUpdated, isLoading } = useOracle();
  const { publicKey, connected, disconnect, wallet } = useWallet();
  const { connection } = useConnection();
  const [email, setEmail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [showSwap, setShowSwap] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const isExternal = connected && wallet && wallet.adapter.name !== SessionWalletName;

  useEffect(() => {
    if (isExternal) {
      setEmail(null);
    } else {
      setEmail(getSavedEmail());
    }
  }, [connected, isExternal]);

  // Poll SOL balance
  useEffect(() => {
    if (!connected || !publicKey) { setSolBalance(null); return; }
    let cancelled = false;
    const fetch_ = () =>
      connection.getBalance(publicKey).then((b) => {
        if (!cancelled) setSolBalance(b / LAMPORTS_PER_SOL);
      }).catch(() => {});
    fetch_();
    const id = setInterval(fetch_, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connected, publicKey, connection]);

  const priceUsd = price / 1_000_000;
  const ago = lastUpdated
    ? Math.max(0, Math.floor((Date.now() / 1000 - lastUpdated) / 60))
    : null;

  // Prevent body scroll when menu open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const addr = publicKey ? publicKey.toBase58() : null;

  // Always render modals even when menu is closed
  if (!open) return (
    <>
      {showSwap && <SwapModal onClose={() => setShowSwap(false)} />}
      {showSend && <SendModal onClose={() => setShowSend(false)} />}
      {showExport && <ExportKeyModal onClose={() => setShowExport(false)} />}
      {showAuth && (
        <AuthModal
          onClose={() => { setShowAuth(false); setEmail(getSavedEmail()); }}
          defaultMode={authMode}
        />
      )}
    </>
  );

  function handleCopy() {
    if (!addr) return;
    navigator.clipboard.writeText(addr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <style>{`
        @keyframes slide-in {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        .mobile-menu-panel {
          animation: slide-in 0.2s ease-out;
        }
      `}</style>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100,
          background: "rgba(0,0,0,0.6)",
        }}
      />
      {/* Panel */}
      <div
        className="mobile-menu-panel"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(300px, 85vw)",
          zIndex: 101,
          background: "#0a0a0a",
          borderRight: "1px solid #1a1a1a",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
        }}
      >
        {/* Close button */}
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 16px 8px" }}>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <X size={22} color="#888" />
          </button>
        </div>

        {/* Nav items */}
        <nav style={{ padding: "8px 0" }}>
          {NAV.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textDecoration: "none",
                  color: active ? "#00ff41" : "#ccc",
                  borderLeft: active ? "3px solid #00ff41" : "3px solid transparent",
                  background: active ? "rgba(0,255,65,0.04)" : "transparent",
                  transition: "background 0.15s",
                }}
              >
                <span>{label}</span>
                <span style={{ color: "#333", fontSize: 12 }}>&rsaquo;</span>
              </Link>
            );
          })}
        </nav>

        {/* Token CA */}
        <div style={{ padding: "12px 24px" }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Token CA</div>
          <button
            onClick={() => {
              navigator.clipboard.writeText("6TPQEMKviAYz3h7gWwtTZJSACMtF2tbofNnPwSyLpump");
            }}
            style={{
              background: "rgba(0,255,65,0.06)",
              border: "1px solid rgba(0,255,65,0.15)",
              borderRadius: 4,
              padding: "8px 12px",
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 10, color: "#00ff41", fontFamily: "monospace", wordBreak: "break-all" }}>
              6TPQEMKviAYz3h7gWwtTZJSACMtF2tbofNnPwSyLpump
            </span>
            <span style={{ fontSize: 9, color: "#555", display: "block", marginTop: 4 }}>Tap to copy</span>
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#1a1a1a", margin: "0 24px" }} />

        {/* Oracle info */}
        <div style={{ padding: "16px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <OracleDot />
          </div>
          <div style={{ fontSize: 12, color: "#ccc" }}>
            Oracle: {isLoading ? "-.--" : `$${priceUsd.toFixed(2)}`}
          </div>
          {ago !== null && (
            <div style={{ fontSize: 10, color: "#555", marginTop: 2 }}>
              Last update: {ago < 1 ? "just now" : `${ago}m ago`}
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#1a1a1a", margin: "0 24px" }} />

        {/* User info + wallet actions */}
        {connected && addr && (
          <div style={{ padding: "16px 0" }}>
            {/* Wallet identity */}
            <div style={{ padding: "0 24px", marginBottom: 12 }}>
              {isExternal && wallet && (
                <div style={{ fontSize: 11, color: "#00ff41", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {wallet.adapter.icon && (
                    <img src={wallet.adapter.icon} alt="" width={14} height={14} style={{ borderRadius: 2 }} />
                  )}
                  {wallet.adapter.name}
                </div>
              )}
              {email && (
                <div style={{ fontSize: 11, color: "#ccc", marginBottom: 4 }}>{email}</div>
              )}
              <div style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>
                {addr.slice(0, 4)}...{addr.slice(-4)}
              </div>
              {solBalance !== null && (
                <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                  <span style={{ color: "#666" }}>SOL:</span> {solBalance.toFixed(4)}
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "#1a1a1a", margin: "0 24px 4px" }} />

            {/* Wallet actions */}
            <MobileMenuAction
              label={copied ? "Copied!" : "Copy Address"}
              onClick={handleCopy}
              color={copied ? "#00ff41" : "#ccc"}
            />
            <MobileMenuAction
              label="Swap SOL > USDC"
              onClick={() => { onClose(); setShowSwap(true); }}
            />
            <MobileMenuAction
              label="Send / Withdraw"
              onClick={() => { onClose(); setShowSend(true); }}
            />
            {!isExternal && (
              <MobileMenuAction
                label="Export Key"
                onClick={() => { onClose(); setShowExport(true); }}
                color="#ffaa00"
              />
            )}
            {!isExternal && !email && (
              <MobileMenuAction
                label="Save Account"
                onClick={() => { onClose(); setAuthMode("signup"); setShowAuth(true); }}
                color="#00ff41"
              />
            )}

            {/* Divider */}
            <div style={{ height: 1, background: "#1a1a1a", margin: "4px 24px" }} />

            <MobileMenuAction
              label="Log Out"
              onClick={async () => {
                setForceDisconnect();
                clearLastWallet();
                if (!isExternal) {
                  clearSessionWallet();
                  fetch("/api/logout", { method: "POST" }).catch(() => {});
                }
                try { await disconnect(); } catch {}
                onClose();
                window.location.href = "/";
              }}
              color="#ff4444"
            />
          </div>
        )}
      </div>

      {/* Modals rendered outside the panel so they overlay properly */}
      {showSwap && <SwapModal onClose={() => setShowSwap(false)} />}
      {showSend && <SendModal onClose={() => setShowSend(false)} />}
      {showExport && <ExportKeyModal onClose={() => setShowExport(false)} />}
      {showAuth && (
        <AuthModal
          onClose={() => { setShowAuth(false); setEmail(getSavedEmail()); }}
          defaultMode={authMode}
        />
      )}
    </>
  );
}

// ─── Token CA (desktop) ──────────────────────────────────────────────────────────

const TOKEN_CA = "6TPQEMKviAYz3h7gWwtTZJSACMtF2tbofNnPwSyLpump";

function DesktopCA() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(TOKEN_CA);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy token CA"
      style={{
        background: "none",
        border: "1px solid #222",
        borderRadius: 4,
        padding: "3px 8px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#00ff41"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#222"; }}
    >
      <span style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.05em" }}>CA</span>
      <span style={{ fontSize: 10, color: "#888", fontFamily: "monospace" }}>
        {TOKEN_CA.slice(0, 4)}...{TOKEN_CA.slice(-4)}
      </span>
      <span style={{ fontSize: 9, color: copied ? "#00ff41" : "#555" }}>
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────────

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { price, isLoading: oracleLoading } = useOracle();
  const mobilePriceUsd = price / 1_000_000;

  // Start hidden to avoid SSR flash — useEffect will show when appropriate
  const [hideNav, setHideNav] = useState(true);
  const landingPassedRef = useRef(false);

  useEffect(() => {
    const noNavRoutes = ["/reset-password"];
    if (pathname === "/") {
      if (landingPassedRef.current) {
        setHideNav(false);
      } else {
        setHideNav(true);
      }
    } else if (noNavRoutes.includes(pathname)) {
      setHideNav(true);
    } else {
      // On any non-landing route, mark as passed and show nav
      landingPassedRef.current = true;
      setHideNav(false);
    }
  }, [pathname]);

  // Listen for custom event when user passes the landing page
  useEffect(() => {
    const handler = () => {
      landingPassedRef.current = true;
      setHideNav(false);
    };
    window.addEventListener("pokeliquid:passed-landing", handler);
    return () => window.removeEventListener("pokeliquid:passed-landing", handler);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (hideNav) return null;

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
        {/* ── MOBILE HEADER ──────────────────────────────────────── */}
        <div
          className="flex md:hidden"
          style={{
            height: 56,
            alignItems: "center",
            justifyContent: "space-between",
            paddingLeft: 16,
            paddingRight: 16,
          }}
        >
          {/* Left: hamburger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 6, flexShrink: 0 }}
          >
            <Menu size={24} color="#fff" />
          </button>

          {/* Center: logo (big and dominant) */}
          <Link
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              textDecoration: "none",
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
            }}
          >
            <Logo width={160} maxHeight={48} />
          </Link>

          {/* Right: oracle dot + price only */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <OracleDot />
            <span style={{ fontSize: 11, color: "#888", fontFamily: "'JetBrains Mono', monospace" }}>
              {oracleLoading ? "-.--" : `$${mobilePriceUsd.toFixed(2)}`}
            </span>
          </div>
        </div>

        {/* ── DESKTOP HEADER ─────────────────────────────────────── */}
        <div
          className="hidden md:flex"
          style={{
            height: 44,
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
            <Logo width={200} maxHeight={38} />
          </Link>

          {/* Center: nav */}
          <nav
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              flex: 1,
              justifyContent: "center",
            }}
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
                      (e.currentTarget as HTMLAnchorElement).style.color = "#ffffff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLAnchorElement).style.color = "#666";
                    }
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Right: CA + oracle dot + bell + wallet */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <DesktopCA />
            <OracleDot />
            <NotificationBell />
            <WalletButton />
          </div>
        </div>

        {/* Desktop: scrolling ticker bar */}
        <TickerBar />
      </header>

      {/* Mobile hamburger menu */}
      <MobileMenu open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} pathname={pathname} />

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
  { href: "/docs", label: "DOCS", Icon: BookOpen },
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
