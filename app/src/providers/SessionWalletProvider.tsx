"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  hasSessionWallet,
  getSavedEmail,
  SessionWalletName,
} from "@/lib/session-wallet";

/**
 * Auto-connects the session wallet if:
 * 1. No external wallet (Phantom/Solflare) is connected
 * 2. A session wallet exists in localStorage OR none exists yet (auto-create)
 */
export function SessionWalletProvider({ children }: { children: React.ReactNode }) {
  const { connected, wallet, select, connect, wallets } = useWallet();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (connected) return; // Already connected to something

    // Give external wallets a moment to auto-connect
    const timer = setTimeout(() => {
      if (attempted.current) return;
      attempted.current = true;

      // Check if an external wallet is already detected/connected
      const externalConnected = wallets.some(
        (w) =>
          w.adapter.name !== SessionWalletName &&
          w.adapter.connected
      );
      if (externalConnected) return;

      // Select and connect session wallet
      const sessionAdapter = wallets.find(
        (w) => w.adapter.name === SessionWalletName
      );
      if (sessionAdapter) {
        select(SessionWalletName);
        // connect() is called automatically by WalletProvider when autoConnect is true
      }
    }, 1500); // Wait 1.5s for external wallets to auto-detect

    return () => clearTimeout(timer);
  }, [connected, wallet, select, connect, wallets]);

  return <>{children}</>;
}

/**
 * WelcomeBack banner for returning users with saved email.
 */
export function WelcomeBackBanner() {
  const { connected, wallet } = useWallet();
  const email = typeof window !== "undefined" ? getSavedEmail() : null;

  if (!connected || !email) return null;
  if (wallet?.adapter.name !== SessionWalletName) return null;

  return (
    <div className="border-b border-border bg-panel/50 py-2 px-4 text-center">
      <span className="text-xs text-secondary">
        Welcome back,{" "}
        <span className="text-primary font-mono">{email}</span>
      </span>
    </div>
  );
}
