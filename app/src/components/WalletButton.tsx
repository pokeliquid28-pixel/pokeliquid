"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getSavedEmail, clearSessionWallet, createGuestWallet, SessionWalletName } from "@/lib/session-wallet";
import { clearLastWallet, isExternalWallet, setForceDisconnect } from "@/providers/SessionWalletProvider";
import { AuthModal } from "./AuthModal";
import { SwapModal } from "./SwapModal";
import { SendModal } from "./SendModal";
import { ExportKeyModal } from "./ExportKeyModal";

/* eslint-disable @next/next/no-img-element */

export function WalletButton() {
  const { connected, publicKey, disconnect, select, wallet, wallets } = useWallet();
  const { connection } = useConnection();
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [showSwap, setShowSwap] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);

  const isExternal = connected && wallet && wallet.adapter.name !== SessionWalletName;

  // Available external wallets
  const externalWallets = wallets.filter(
    (w) => w.adapter.name !== SessionWalletName &&
           (w.adapter.readyState === WalletReadyState.Installed ||
            w.adapter.readyState === WalletReadyState.Loadable)
  );

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
    if (isExternal) {
      setEmail(null);
      return;
    }
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
  }, [connected, isExternal]);

  async function handleDisconnect() {
    setForceDisconnect();
    clearLastWallet();
    setDropdownOpen(false);
    if (!isExternal) {
      await clearSessionWallet();
      fetch("/api/logout", { method: "POST" }).catch(() => {});
    }
    try { await disconnect(); } catch {}
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
    setDropdownOpen(false);
    setShowSwap(true);
  }

  function handleSend() {
    setDropdownOpen(false);
    setShowSend(true);
  }

  function handleExport() {
    setDropdownOpen(false);
    setShowExport(true);
  }

  async function handleSelectWallet(walletName: string) {
    select(walletName as any);
    setShowWalletPicker(false);
  }

  if (connected && publicKey) {
    const addr = publicKey.toBase58();
    const walletIcon = wallet?.adapter.icon;
    const walletName = wallet?.adapter.name;

    return (
      <>
        <div className="relative flex items-center gap-1.5 md:gap-2">
          {/* For session wallets without email — show save account button */}
          {!isExternal && !email && (
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

          {/* For session wallets with email — show email */}
          {!isExternal && email && (
            <span
              className="hidden md:inline text-[11px] font-mono truncate max-w-[120px]"
              style={{ color: "#666" }}
            >
              {email}
            </span>
          )}

          {/* Connected wallet chip */}
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="uppercase tracking-wider flex items-center gap-1.5"
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
            {isExternal && walletIcon && (
              <img src={walletIcon} alt="" width={16} height={16} style={{ borderRadius: 3 }} />
            )}
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
              {/* Wallet name for external wallets */}
              {isExternal && walletName && (
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "10px",
                    padding: "6px 10px",
                    color: "#00ff41",
                    borderBottom: "1px solid #1a1a1a",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {walletIcon && <img src={walletIcon} alt="" width={14} height={14} style={{ borderRadius: 2 }} />}
                  {walletName}
                </div>
              )}

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
                {copied ? "Copied!" : `${addr.slice(0, 8)}...${addr.slice(-8)}  copy`}
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

              {/* Swap SOL -> USDC */}
              <DropdownItem label="Swap SOL > USDC" onClick={handleSwap} />

              {/* Send */}
              <DropdownItem label="Send / Withdraw" onClick={handleSend} />

              {/* Export Key — only for session wallets */}
              {!isExternal && (
                <DropdownItem label="Export Key" onClick={handleExport} hoverColor="#ffaa00" />
              )}

              {/* Disconnect */}
              <DropdownItem label="Disconnect" onClick={handleDisconnect} hoverColor="#ff4444" />
            </div>
          )}
        </div>

        {showAuth && (
          <AuthModal
            onClose={() => { setShowAuth(false); setEmail(getSavedEmail()); }}
            defaultMode={authMode}
          />
        )}
        {showSwap && <SwapModal onClose={() => setShowSwap(false)} />}
        {showSend && <SendModal onClose={() => setShowSend(false)} />}
        {showExport && <ExportKeyModal onClose={() => setShowExport(false)} />}
      </>
    );
  }

  // Not connected
  return (
    <>
      <div className="flex items-center gap-1.5">
        {/* Connect Wallet — shown when external wallets detected */}
        {externalWallets.length > 0 && (
          <button
            onClick={() => setShowWalletPicker(true)}
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
            Connect
          </button>
        )}

        {/* Log In — always shown */}
        <button
          onClick={() => { setAuthMode("login"); setShowAuth(true); }}
          className="uppercase tracking-wider"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "13px",
            fontWeight: 700,
            padding: "8px 18px",
            background: externalWallets.length > 0 ? "transparent" : "#00ff41",
            color: externalWallets.length > 0 ? "#00ff41" : "#000000",
            border: externalWallets.length > 0 ? "1px solid rgba(0,255,65,0.4)" : "none",
            boxShadow: externalWallets.length > 0 ? "none" : "3px 3px 0 #009926",
            cursor: "pointer",
            transition: "box-shadow .12s, transform .12s",
            letterSpacing: "0.06em",
            minHeight: "36px",
          }}
          onMouseEnter={(e) => {
            if (externalWallets.length > 0) {
              e.currentTarget.style.borderColor = "#00ff41";
              e.currentTarget.style.background = "rgba(0,255,65,0.06)";
            } else {
              e.currentTarget.style.boxShadow = "1px 1px 0 #009926";
              e.currentTarget.style.transform = "translate(2px, 2px)";
            }
          }}
          onMouseLeave={(e) => {
            if (externalWallets.length > 0) {
              e.currentTarget.style.borderColor = "rgba(0,255,65,0.4)";
              e.currentTarget.style.background = "transparent";
            } else {
              e.currentTarget.style.boxShadow = "3px 3px 0 #009926";
              e.currentTarget.style.transform = "translate(0, 0)";
            }
          }}
        >
          Log In
        </button>
      </div>

      {showAuth && (
        <AuthModal
          onClose={() => { setShowAuth(false); setEmail(getSavedEmail()); }}
          defaultMode={authMode}
        />
      )}

      {/* Wallet picker modal */}
      {showWalletPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm border border-border bg-panel shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h3 className="text-sm font-bold text-primary">Connect Wallet</h3>
              <button
                onClick={() => setShowWalletPicker(false)}
                className="text-secondary hover:text-primary text-lg leading-none"
              >
                &times;
              </button>
            </div>
            <div className="px-5 pb-5 space-y-2">
              {externalWallets.map((w) => (
                <button
                  key={w.adapter.name}
                  onClick={() => handleSelectWallet(w.adapter.name)}
                  className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
                  style={{
                    background: "transparent",
                    border: "1px solid #1a1a1a",
                    cursor: "pointer",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 13,
                    color: "#ccc",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#00ff41";
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#1a1a1a";
                    e.currentTarget.style.color = "#ccc";
                  }}
                >
                  {w.adapter.icon && (
                    <img src={w.adapter.icon} alt={w.adapter.name} width={24} height={24} style={{ borderRadius: 4 }} />
                  )}
                  <span>{w.adapter.name}</span>
                  {w.adapter.readyState === WalletReadyState.Installed && (
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "#00ff41" }}>Detected</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DropdownItem({
  label,
  onClick,
  hoverColor = "#00ff41",
}: {
  label: string;
  onClick: () => void;
  hoverColor?: string;
}) {
  return (
    <button
      onClick={onClick}
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
        e.currentTarget.style.color = hoverColor;
        e.currentTarget.style.borderColor = hoverColor;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "#888";
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      {label}
    </button>
  );
}
