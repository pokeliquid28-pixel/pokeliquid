"use client";

import { useState } from "react";
import { getSessionPrivateKey } from "@/lib/session-wallet";
import bs58 from "bs58";

type Props = { onClose: () => void };

export function ExportKeyModal({ onClose }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const secretKey = getSessionPrivateKey();
  const base58Key = secretKey ? bs58.encode(new Uint8Array(secretKey)) : null;

  function handleCopy() {
    if (!base58Key) return;
    navigator.clipboard.writeText(base58Key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", width: "100%", maxWidth: 420, padding: 24, fontFamily: "'JetBrains Mono', monospace" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 14, color: "#ccc", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Export Private Key
          </span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#666", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        {/* Warning */}
        <div style={{
          fontSize: 11, padding: "10px 12px", marginBottom: 16,
          border: "1px solid #ff3333", color: "#ff3333", background: "rgba(255,51,51,.08)",
          lineHeight: 1.5,
        }}>
          Never share your private key with anyone. Anyone with this key has full control of your wallet and funds. Store it securely.
        </div>

        {!base58Key ? (
          <div style={{ fontSize: 12, color: "#666" }}>
            No session wallet found. This feature is only available for generated wallets.
          </div>
        ) : !revealed ? (
          <button
            onClick={() => setRevealed(true)}
            style={{
              width: "100%", padding: "12px",
              background: "#1a1a1a", color: "#ff3333",
              border: "1px solid #ff3333", fontSize: 12, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase",
            }}
          >
            Reveal Private Key
          </button>
        ) : (
          <div>
            <div style={{
              background: "#111", border: "1px solid #1a1a1a", padding: "12px",
              fontSize: 10, color: "#ccc", wordBreak: "break-all", lineHeight: 1.6,
              marginBottom: 12, userSelect: "all",
            }}>
              {base58Key}
            </div>
            <button
              onClick={handleCopy}
              style={{
                width: "100%", padding: "10px",
                background: copied ? "rgba(0,255,65,.1)" : "#1a1a1a",
                color: copied ? "#00ff41" : "#ccc",
                border: `1px solid ${copied ? "#00ff41" : "#333"}`,
                fontSize: 11, fontWeight: 700,
                fontFamily: "'JetBrains Mono', monospace",
                cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase",
              }}
            >
              {copied ? "Copied!" : "Copy to Clipboard"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
