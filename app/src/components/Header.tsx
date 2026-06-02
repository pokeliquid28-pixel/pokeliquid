"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";
import { NotificationBell } from "./NotificationBell";
import { Logo } from "./Logo";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { useOracle, OracleHealth } from "@/hooks/useOracle";
import { useProtocolState } from "@/hooks/useProtocolState";
import { formatSol, formatUsdc } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Trade", icon: "⚡" },
  { href: "/pool", label: "Pool", icon: "💧" },
  { href: "/stats", label: "Stats", icon: "📊" },
];

function Balances() {
  const { connected } = useWallet();
  const { solLamports, usdcRaw, isLoading } = useWalletBalances();

  if (!connected) return null;
  if (isLoading) {
    return (
      <div className="hidden md:flex items-center gap-3 text-xs font-mono text-secondary">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton h-3 w-16" />
      </div>
    );
  }

  return (
    <div className="hidden md:flex items-center gap-4 text-xs font-mono">
      <span className="text-secondary">
        <span className="text-primary">{formatSol(solLamports)}</span> SOL
      </span>
      <span className="text-secondary">
        <span className="text-primary">{formatUsdc(usdcRaw)}</span> USDC
      </span>
    </div>
  );
}

const HEALTH_COLORS: Record<OracleHealth, string> = {
  fresh: "bg-green-500",
  degraded: "bg-yellow-500",
  stale: "bg-red-500",
};

const HEALTH_LABELS: Record<OracleHealth, string> = {
  fresh: "Oracle OK",
  degraded: "Oracle Delayed",
  stale: "Oracle Stale",
};

function OracleIndicator() {
  const { health, secondsSinceUpdate, isLoading } = useOracle();

  if (isLoading) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs font-mono text-secondary" title={HEALTH_LABELS[health]}>
      <span className={`inline-block w-2 h-2 rounded-full ${HEALTH_COLORS[health]}`} />
      {health === "stale" && (
        <span className="hidden md:inline text-red-400">Oracle Stale</span>
      )}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();
  const protocol = useProtocolState();

  return (
    <>
      {protocol.isPaused && (
        <div className="bg-red-900/80 text-red-200 text-center text-xs font-mono py-1.5 px-4">
          <span className="hidden md:inline">Protocol paused — oracle update required</span>
          <span className="md:hidden">Protocol paused</span>
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-3 md:px-6 h-12 md:h-14 flex items-center justify-between gap-2 md:gap-6">
          {/* Logo */}
          <Link href="/" className="shrink-0">
            <Logo size={80} />
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-0.5 md:gap-1">
            {NAV.map(({ href, label, icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  className={`px-2.5 md:px-4 py-1.5 text-sm font-medium transition-colors min-h-[44px] flex items-center ${
                    active
                      ? "holo-text border-b-2 border-transparent"
                      : "text-secondary hover:text-primary"
                  }`}
                  style={
                    active
                      ? {
                          borderImage:
                            "linear-gradient(135deg,#ff6ec7,#a78bfa,#38bdf8,#34d399) 1",
                          borderBottom: "2px solid",
                        }
                      : {}
                  }
                >
                  <span className="md:hidden">{icon}</span>
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right: oracle health + balances + wallet */}
          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            <OracleIndicator />
            <Balances />
            <NotificationBell />
            <WalletButton />
          </div>
        </div>
      </header>
    </>
  );
}
