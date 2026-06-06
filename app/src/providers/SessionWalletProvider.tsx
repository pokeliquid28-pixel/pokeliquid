"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import {
  hasSessionWallet,
  SessionWalletName,
} from "@/lib/session-wallet";

const LAST_WALLET_KEY = "pokeliquid_last_wallet";

/** Persist which wallet the user last connected with. */
export function saveLastWallet(name: string) {
  if (typeof window !== "undefined") localStorage.setItem(LAST_WALLET_KEY, name);
}

export function getLastWallet(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_WALLET_KEY);
}

export function clearLastWallet() {
  if (typeof window !== "undefined") localStorage.removeItem(LAST_WALLET_KEY);
}

/** Returns true if the user last used an external wallet (Phantom, Solflare, etc.) */
export function isExternalWallet(): boolean {
  const last = getLastWallet();
  return !!last && last !== SessionWalletName;
}

/**
 * Auto-connects the appropriate wallet on page load:
 * - If user last used an external wallet (Phantom/Solflare), select that
 * - If user has a session wallet in localStorage, select the session wallet
 * - Otherwise, show the landing page (no auto-connect)
 */
export function SessionWalletProvider({ children }: { children: React.ReactNode }) {
  const { connected, wallet, select, wallets } = useWallet();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (connected) return;

    attempted.current = true;

    const lastWallet = getLastWallet();

    // If user previously used an external wallet, try to reconnect it
    if (lastWallet && lastWallet !== SessionWalletName) {
      const externalAdapter = wallets.find(
        (w) => w.adapter.name === lastWallet
      );
      if (externalAdapter && externalAdapter.adapter.readyState === WalletReadyState.Installed) {
        select(lastWallet as any);
        return;
      }
    }

    // Otherwise fall back to session wallet if one exists
    if (hasSessionWallet()) {
      const sessionAdapter = wallets.find(
        (w) => w.adapter.name === SessionWalletName
      );
      if (sessionAdapter) {
        select(SessionWalletName);
      }
    }
  }, [connected, wallet, select, wallets]);

  // Track which wallet the user connects with
  useEffect(() => {
    if (connected && wallet) {
      saveLastWallet(wallet.adapter.name);
    }
  }, [connected, wallet]);

  return <>{children}</>;
}
