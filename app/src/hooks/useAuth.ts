"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

type AuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
  email: string | null;
  walletPubkey: string | null;
};

export function useAuth(): AuthState {
  const { connected } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [walletPubkey, setWalletPubkey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Check both server session AND localStorage wallet (for guest users)
    const hasLocalWallet = typeof window !== "undefined" && !!localStorage.getItem("pokeliquid_session_wallet");

    const check = async () => {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) throw new Error("Not authenticated");
        const data = await res.json();
        if (cancelled) return;
        setIsAuthenticated(true);
        setEmail(data.email ?? null);
        setWalletPubkey(data.walletPubkey ?? null);
      } catch {
        if (cancelled) return;
        // Guest users with a local session wallet are still authenticated
        setIsAuthenticated(hasLocalWallet || connected);
        setEmail(null);
        setWalletPubkey(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, [connected]);

  return { isAuthenticated, isLoading, email, walletPubkey };
}
