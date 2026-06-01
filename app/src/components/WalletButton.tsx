"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getSavedEmail, clearSessionWallet, SessionWalletName } from "@/lib/session-wallet";
import { AuthModal } from "./AuthModal";

export function WalletButton() {
  const { connected, publicKey, disconnect, select } = useWallet();
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    // Check localStorage first (fast)
    const localEmail = getSavedEmail();
    if (localEmail) {
      setEmail(localEmail);
      return;
    }

    // Fall back to JWT session cookie via /api/me
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.email) setEmail(data.email);
      })
      .catch(() => {});
  }, [connected]);

  async function handleDisconnect() {
    // Clear server session cookie
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    disconnect();
  }

  if (connected && publicKey) {
    const addr = publicKey.toBase58();
    return (
      <>
        <div className="flex items-center gap-1.5 md:gap-2">
          {email ? (
            <span className="hidden md:inline text-[10px] font-mono text-secondary truncate max-w-[120px]">
              {email}
            </span>
          ) : (
            <button
              onClick={() => { setAuthMode("signup"); setShowAuth(true); }}
              className="hidden md:inline px-2 py-1 text-[10px] font-bold border border-[#a78bfa] text-[#a78bfa] hover:bg-[#a78bfa]/10 transition-colors"
            >
              Save Account
            </button>
          )}
          <span className="text-[10px] md:text-xs font-mono text-secondary">
            {addr.slice(0, 4)}...{addr.slice(-4)}
          </span>
          <button
            onClick={handleDisconnect}
            className="px-2 md:px-3 py-1.5 text-[10px] md:text-xs border border-border text-secondary hover:text-primary hover:border-primary/50 transition-colors min-h-[36px] md:min-h-0"
          >
            <span className="hidden md:inline">Disconnect</span>
            <span className="md:hidden">&times;</span>
          </button>
        </div>
        {showAuth && (
          <AuthModal
            onClose={() => { setShowAuth(false); setEmail(getSavedEmail()); }}
            defaultMode={authMode}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => { setAuthMode("login"); setShowAuth(true); }}
          className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-semibold border border-[#a78bfa] text-[#a78bfa] hover:bg-[#a78bfa]/10 transition-colors min-h-[36px] md:min-h-0"
        >
          Log In
        </button>
        <button
          onClick={() => select(SessionWalletName)}
          className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-semibold holo-bg text-black hover:opacity-90 transition-opacity min-h-[36px] md:min-h-0"
        >
          <span className="hidden md:inline">Try Without Account</span>
          <span className="md:hidden">Try</span>
        </button>
      </div>
      {showAuth && (
        <AuthModal
          onClose={() => { setShowAuth(false); setEmail(getSavedEmail()); }}
          defaultMode={authMode}
        />
      )}
    </>
  );
}
