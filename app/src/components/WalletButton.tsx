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
  const [dropdownOpen, setDropdownOpen] = useState(false);

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
    setDropdownOpen(false);
    disconnect();
  }

  if (connected && publicKey) {
    const addr = publicKey.toBase58();
    return (
      <>
        <div className="relative flex items-center gap-1.5 md:gap-2">
          {email ? (
            <span
              className="hidden md:inline text-[11px] font-mono truncate max-w-[120px]"
              style={{ color: "#555" }}
            >
              {email}
            </span>
          ) : (
            <button
              onClick={() => { setAuthMode("signup"); setShowAuth(true); }}
              className="hidden md:inline uppercase tracking-wider"
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: "11px",
                padding: "4px 10px",
                background: "rgba(0,255,136,.08)",
                color: "#00ff88",
                border: "1px solid rgba(0,255,136,.3)",
                cursor: "pointer",
                transition: "background .15s",
              }}
            >
              Save Account
            </button>
          )}

          {/* Connected wallet chip */}
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="uppercase tracking-wider"
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "11px",
              padding: "5px 12px",
              background: "rgba(0,255,136,.08)",
              color: "#00ff88",
              border: "1px solid rgba(0,255,136,.3)",
              cursor: "pointer",
              transition: "background .15s",
            }}
          >
            <span className="font-mono" style={{ fontSize: "11px", color: "#00ff88" }}>
              {addr.slice(0, 4)}...{addr.slice(-4)}
            </span>
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-50 min-w-[160px]"
              style={{
                background: "#0d0d0d",
                border: "1px solid #1f1f1f",
                padding: "4px",
              }}
            >
              <button
                onClick={handleDisconnect}
                className="w-full text-left uppercase tracking-wider"
                style={{
                  fontFamily: "'Barlow Condensed', sans-serif",
                  fontSize: "11px",
                  padding: "6px 10px",
                  background: "transparent",
                  color: "#888",
                  border: "1px solid transparent",
                  cursor: "pointer",
                  transition: "color .15s, border-color .15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#ff4444";
                  e.currentTarget.style.borderColor = "#ff4444";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#888";
                  e.currentTarget.style.borderColor = "transparent";
                }}
              >
                Disconnect
              </button>
            </div>
          )}
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
          className="uppercase tracking-wider"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: "13px",
            fontWeight: 700,
            padding: "8px 18px",
            background: "#ffe000",
            color: "#1a1200",
            border: "none",
            boxShadow: "3px 3px 0 #b89e00",
            cursor: "pointer",
            transition: "box-shadow .12s, transform .12s",
            letterSpacing: "0.06em",
            minHeight: "36px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "1px 1px 0 #b89e00";
            e.currentTarget.style.transform = "translate(2px, 2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "3px 3px 0 #b89e00";
            e.currentTarget.style.transform = "translate(0, 0)";
          }}
        >
          Log In
        </button>
        <button
          onClick={() => select(SessionWalletName)}
          className="uppercase tracking-wider"
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontSize: "13px",
            fontWeight: 700,
            padding: "8px 18px",
            background: "#ffe000",
            color: "#1a1200",
            border: "none",
            boxShadow: "3px 3px 0 #b89e00",
            cursor: "pointer",
            transition: "box-shadow .12s, transform .12s",
            letterSpacing: "0.06em",
            minHeight: "36px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "1px 1px 0 #b89e00";
            e.currentTarget.style.transform = "translate(2px, 2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "3px 3px 0 #b89e00";
            e.currentTarget.style.transform = "translate(0, 0)";
          }}
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
