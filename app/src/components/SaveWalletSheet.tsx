"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getSavedEmail, SessionWalletName } from "@/lib/session-wallet";
import { AuthModal } from "./AuthModal";

const DISMISSED_KEY = "pokeliquid_save_dismissed";
const TRADE_COUNT_KEY = "pokeliquid_trade_count";

export function incrementTradeCount() {
  if (typeof window === "undefined") return;
  const count = parseInt(localStorage.getItem(TRADE_COUNT_KEY) ?? "0", 10);
  localStorage.setItem(TRADE_COUNT_KEY, String(count + 1));
}

export function getTradeCount(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(TRADE_COUNT_KEY) ?? "0", 10);
}

export function SaveWalletSheet() {
  const { wallet, connected } = useWallet();
  const [showAuth, setShowAuth] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!connected) return;
    if (wallet?.adapter.name !== SessionWalletName) return;
    if (getSavedEmail()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const count = getTradeCount();
    if (count >= 1) {
      const t = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(t);
    }
  }, [connected, wallet]);

  if (!visible) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setVisible(false);
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4 animate-in slide-in-from-bottom">
        <div className="w-full max-w-md border border-border bg-panel shadow-2xl shadow-black/50">
          <div className="px-5 pt-5 pb-3">
            <h3 className="text-sm font-bold text-primary">
              Save your wallet
            </h3>
            <p className="text-xs text-secondary mt-1.5 leading-relaxed">
              Create an account to keep your wallet and positions safe across
              devices and browser sessions.
            </p>
          </div>
          <div className="px-5 pb-5 flex gap-2">
            <button
              onClick={() => setShowAuth(true)}
              className="flex-1 py-2.5 text-xs btn-green"
            >
              Create Account
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2.5 text-xs border border-border text-secondary hover:text-primary transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
      {showAuth && (
        <AuthModal
          onClose={() => {
            setShowAuth(false);
            if (getSavedEmail()) setVisible(false);
          }}
          defaultMode="signup"
        />
      )}
    </>
  );
}
