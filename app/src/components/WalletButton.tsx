"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getSavedEmail, clearSessionWallet, createGuestWallet, SessionWalletName } from "@/lib/session-wallet";
import { AuthModal } from "./AuthModal";

export function WalletButton() {
  const { connected, publicKey, disconnect, select } = useWallet();
  const { connection } = useConnection();
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);

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

  useEffect(() => {
    const localEmail = getSavedEmail();
    if (localEmail) {
      setEmail(localEmail);
      return;
    }
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.email) setEmail(data.email);
      })
      .catch(() => {});
  }, [connected]);

  function handleDisconnect() {
    clearSessionWallet();
    disconnect();
    setDropdownOpen(false);
    fetch("/api/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/";
  }

  function handleCopyAddress() {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey.toBase58()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleSwap() {
    if (!publicKey) return;
    setDropdownOpen(false);
    // Jupiter swap: SOL → USDC
    window.open(
      `https://jup.ag/swap/SOL-USDC?referrer=${publicKey.toBase58()}`,
      "_blank"
    );
  }

  if (connected && publicKey) {
    const addr = publicKey.toBase58();
    return (
      <>
        <div className="relative flex items-center gap-1.5 md:gap-2">
          {email ? (
            <span
              className="hidden md:inline text-[11px] font-mono truncate max-w-[120px]"
              style={{ color: "#666" }}
            >
              {email}
            </span>
          ) : (
            <button
              onClick={() => { setAuthMode("signup"); setShowAuth(true); }}
              className="hidden md:inline uppercase tracking-wider"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "11px",
                padding: "4px 10px",
                background: "rgba(0,255,136,.08)",
                color: "#00ff41",
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
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
              padding: "5px 12px",
              background: "rgba(0,255,136,.08)",
              color: "#00ff41",
              border: "1px solid rgba(0,255,136,.3)",
              cursor: "pointer",
              transition: "background .15s",
            }}
          >
            <span className="font-mono" style={{ fontSize: "11px", color: "#00ff41" }}>
              {addr.slice(0, 4)}...{addr.slice(-4)}
            </span>
          </button>

          {/* Dropdown */}
          {dropdownOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-50 min-w-[200px]"
              style={{
                background: "#111111",
                border: "1px solid #1a1a1a",
                padding: "4px",
              }}
            >
              {/* Full address + copy */}
              <button
                onClick={handleCopyAddress}
                className="w-full text-left uppercase tracking-wider"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10px",
                  padding: "8px 10px",
                  background: "transparent",
                  color: copied ? "#00ff41" : "#888",
                  border: "1px solid transparent",
                  cursor: "pointer",
                  transition: "color .15s",
                  wordBreak: "break-all",
                  textTransform: "none",
                }}
                onMouseEnter={(e) => {
                  if (!copied) e.currentTarget.style.color = "#ccc";
                }}
                onMouseLeave={(e) => {
                  if (!copied) e.currentTarget.style.color = "#888";
                }}
              >
                {copied ? "✓ Copied!" : `${addr.slice(0, 8)}...${addr.slice(-8)}  ⧉`}
              </button>

              {/* SOL Balance */}
              {solBalance !== null && (
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "11px",
                    padding: "6px 10px",
                    color: "#ccc",
                    borderBottom: "1px solid #1a1a1a",
                  }}
                >
                  <span style={{ color: "#666" }}>SOL:</span>{" "}
                  {solBalance.toFixed(4)}
                </div>
              )}

              {/* Swap SOL → USDC */}
              <button
                onClick={handleSwap}
                className="w-full text-left uppercase tracking-wider"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "11px",
                  padding: "6px 10px",
                  background: "transparent",
                  color: "#888",
                  border: "1px solid transparent",
                  cursor: "pointer",
                  transition: "color .15s, border-color .15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#00ff41";
                  e.currentTarget.style.borderColor = "#00ff41";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#888";
                  e.currentTarget.style.borderColor = "transparent";
                }}
              >
                Swap SOL → USDC
              </button>

              {/* Disconnect */}
              <button
                onClick={handleDisconnect}
                className="w-full text-left uppercase tracking-wider"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
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
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            fontWeight: 700,
            padding: "8px 18px",
            background: "#00ff41",
            color: "#000000",
            border: "none",
            boxShadow: "3px 3px 0 #009926",
            cursor: "pointer",
            transition: "box-shadow .12s, transform .12s",
            letterSpacing: "0.06em",
            minHeight: "36px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "1px 1px 0 #009926";
            e.currentTarget.style.transform = "translate(2px, 2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "3px 3px 0 #009926";
            e.currentTarget.style.transform = "translate(0, 0)";
          }}
        >
          Log In
        </button>
        <button
          onClick={async () => { await createGuestWallet(); select(SessionWalletName); }}
          className="uppercase tracking-wider"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            fontWeight: 700,
            padding: "8px 18px",
            background: "#00ff41",
            color: "#000000",
            border: "none",
            boxShadow: "3px 3px 0 #009926",
            cursor: "pointer",
            transition: "box-shadow .12s, transform .12s",
            letterSpacing: "0.06em",
            minHeight: "36px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = "1px 1px 0 #009926";
            e.currentTarget.style.transform = "translate(2px, 2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "3px 3px 0 #009926";
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
