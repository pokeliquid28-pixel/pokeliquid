"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  getSessionPrivateKey,
  getSavedEmail,
  setSavedEmail,
  SessionWalletName,
} from "@/lib/session-wallet";

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
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // Only show for session wallet users
    if (!connected) return;
    if (wallet?.adapter.name !== SessionWalletName) return;
    if (getSavedEmail()) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Show after first trade
    const count = getTradeCount();
    if (count >= 1) {
      // Small delay so it doesn't flash immediately
      const t = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(t);
    }
  }, [connected, wallet]);

  if (!visible) return null;

  async function handleSave() {
    if (!email || loading) return;
    setLoading(true);
    setStatus("idle");
    setErrorMsg("");

    try {
      const privateKey = getSessionPrivateKey();
      if (!privateKey) throw new Error("No session wallet found");

      const res = await fetch("/api/save-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          privateKey: JSON.stringify(privateKey),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save wallet");
      }

      setSavedEmail(email);
      setStatus("success");
      setTimeout(() => setVisible(false), 3000);
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "true");
    setVisible(false);
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center p-4 animate-in slide-in-from-bottom">
      <div className="w-full max-w-md border border-border bg-panel shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-bold text-primary flex items-center gap-2">
            <span className="text-lg">💾</span> Save your wallet
          </h3>
          <p className="text-xs text-secondary mt-1.5 leading-relaxed">
            Enter your email to recover your wallet and positions from any device.
          </p>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 space-y-3">
          {status === "success" ? (
            <div className="border border-long bg-long/10 p-4 text-center space-y-1">
              <div className="text-sm font-bold text-long">Wallet saved!</div>
              <div className="text-xs text-secondary">
                Check your email for a recovery link.
              </div>
            </div>
          ) : (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />

              {status === "error" && (
                <div className="text-xs text-short">{errorMsg}</div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={!email || loading}
                  className="flex-1 py-2.5 text-xs font-bold bg-[#a78bfa] text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Saving..." : "Save Wallet"}
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-4 py-2.5 text-xs border border-border text-secondary hover:text-primary transition-colors"
                >
                  Skip for now
                </button>
              </div>

              <p className="text-[10px] text-secondary/60 flex items-center gap-1">
                <span>🔒</span> Your key is encrypted. We never store it in plaintext.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
