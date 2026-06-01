"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  hasSessionWallet,
  SessionWalletName,
} from "@/lib/session-wallet";

/**
 * Auto-connects the session wallet if one already exists in localStorage
 * (returning user). New users see Log In / Try Without Account buttons.
 */
export function SessionWalletProvider({ children }: { children: React.ReactNode }) {
  const { connected, wallet, select, connect, wallets } = useWallet();
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    if (connected) return;

    // Only auto-connect if the user already has a saved session wallet
    if (!hasSessionWallet()) return;

    attempted.current = true;

    const sessionAdapter = wallets.find(
      (w) => w.adapter.name === SessionWalletName
    );
    if (sessionAdapter) {
      select(SessionWalletName);
    }
  }, [connected, wallet, select, connect, wallets]);

  return <>{children}</>;
}
