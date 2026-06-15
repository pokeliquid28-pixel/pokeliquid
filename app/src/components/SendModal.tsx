"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

type Props = { onClose: () => void };

type Token = "SOL" | "USDC";

export function SendModal({ onClose }: Props) {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [token, setToken] = useState<Token>("USDC");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    connection.getBalance(publicKey).then((b) => setSolBalance(b / LAMPORTS_PER_SOL)).catch(() => {});
    getAssociatedTokenAddress(USDC_MINT, publicKey)
      .then((ata) => getAccount(connection, ata))
      .then((acc) => setUsdcBalance(Number(acc.amount) / 1e6))
      .catch(() => setUsdcBalance(0));
  }, [publicKey, connection]);

  const balance = token === "SOL" ? solBalance : usdcBalance;
  const inputVal = parseFloat(amount) || 0;
  const insufficient = balance !== null && inputVal > balance;

  let recipientValid = false;
  try {
    if (recipient.length >= 32) { new PublicKey(recipient); recipientValid = true; }
  } catch {}

  async function handleSend() {
    if (!publicKey || !sendTransaction || !recipientValid || inputVal <= 0) return;
    setSending(true);
    setStatus(null);

    try {
      const dest = new PublicKey(recipient);
      const tx = new Transaction();

      if (token === "SOL") {
        tx.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: dest,
            lamports: Math.floor(inputVal * LAMPORTS_PER_SOL),
          })
        );
      } else {
        const fromAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const toAta = await getAssociatedTokenAddress(USDC_MINT, dest);

        // Create recipient ATA if needed
        try {
          await getAccount(connection, toAta);
        } catch {
          tx.add(createAssociatedTokenAccountInstruction(publicKey, toAta, dest, USDC_MINT));
        }

        tx.add(
          createTransferInstruction(fromAta, toAta, publicKey, Math.floor(inputVal * 1e6))
        );
      }

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      setStatus({ type: "success", msg: `Sent ${inputVal} ${token} to ${recipient.slice(0, 6)}...${recipient.slice(-4)}` });
      setAmount("");

      // Refresh balances
      connection.getBalance(publicKey).then((b) => setSolBalance(b / LAMPORTS_PER_SOL)).catch(() => {});
      getAssociatedTokenAddress(USDC_MINT, publicKey)
        .then((ata) => getAccount(connection, ata))
        .then((acc) => setUsdcBalance(Number(acc.amount) / 1e6))
        .catch(() => {});
    } catch (e: any) {
      setStatus({ type: "error", msg: e?.message ?? "Send failed" });
    }
    setSending(false);
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#0a0a0a", border: "1px solid #1a1a1a", width: "100%", maxWidth: 400, padding: 24, fontFamily: "'JetBrains Mono', monospace" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 14, color: "#ccc", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Send {token}
          </span>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#666", fontSize: 18, cursor: "pointer" }}>×</button>
        </div>

        {/* Info notice */}
        <div style={{
          fontSize: 10, padding: "10px 12px", marginBottom: 16,
          border: "1px solid #333", color: "#999", background: "rgba(255,255,255,.02)",
          lineHeight: 1.6,
        }}>
          Looking to withdraw from the protocol? Your deposited collateral is managed on the <strong style={{ color: "#00ff41" }}>Trade</strong> page — use the Deposit/Withdraw panel there. This screen only sends tokens already in your wallet.
        </div>

        {/* Token selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["SOL", "USDC"] as Token[]).map((t) => (
            <button
              key={t}
              onClick={() => { setToken(t); setAmount(""); }}
              style={{
                flex: 1, padding: "8px", fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                background: token === t ? "rgba(0,255,65,.1)" : "transparent",
                border: `1px solid ${token === t ? "#00ff41" : "#1a1a1a"}`,
                color: token === t ? "#00ff41" : "#666",
                cursor: "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Balance */}
        <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>
          Available: {balance !== null ? `${balance.toFixed(token === "SOL" ? 4 : 2)} ${token}` : "Loading..."}
        </div>

        {/* Recipient */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>Recipient Address</div>
          <input
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            placeholder="Solana address..."
            style={{
              width: "100%", background: "#111",
              border: `1px solid ${recipient && !recipientValid ? "#ff3333" : "#1a1a1a"}`,
              color: "#fff", fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              padding: "10px 12px", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Amount */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>Amount</div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step={token === "SOL" ? "0.01" : "1"}
            min="0"
            style={{
              width: "100%", background: "#111",
              border: `1px solid ${insufficient ? "#ff3333" : "#1a1a1a"}`,
              color: "#fff", fontSize: 18,
              fontFamily: "'JetBrains Mono', monospace",
              padding: "12px 80px 12px 12px", outline: "none", boxSizing: "border-box",
            }}
          />
          <div style={{ position: "absolute", right: 12, bottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => {
                if (balance === null) return;
                setAmount(token === "SOL" ? Math.max(0, balance - 0.005).toFixed(4) : balance.toFixed(2));
              }}
              style={{
                background: "rgba(0,255,65,.1)", border: "1px solid rgba(0,255,65,.3)",
                color: "#00ff41", fontSize: 9, padding: "2px 6px", cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              MAX
            </button>
            <span style={{ color: "#666", fontSize: 12 }}>{token}</span>
          </div>
        </div>

        {insufficient && (
          <div style={{ fontSize: 10, color: "#ff3333", marginTop: -12, marginBottom: 12 }}>
            Insufficient {token} balance
          </div>
        )}

        {/* Status */}
        {status && (
          <div style={{
            fontSize: 11, padding: "8px 10px", marginBottom: 12,
            border: `1px solid ${status.type === "success" ? "#00ff41" : "#ff3333"}`,
            color: status.type === "success" ? "#00ff41" : "#ff3333",
            wordBreak: "break-word",
          }}>
            {status.msg}
          </div>
        )}

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!recipientValid || sending || insufficient || inputVal <= 0}
          style={{
            width: "100%", padding: "12px",
            background: !recipientValid || sending || insufficient || inputVal <= 0 ? "#1a1a1a" : "#00ff41",
            color: !recipientValid || sending || insufficient || inputVal <= 0 ? "#555" : "#000",
            border: "none", fontSize: 13, fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            cursor: !recipientValid || sending || insufficient || inputVal <= 0 ? "not-allowed" : "pointer",
            letterSpacing: "0.1em", textTransform: "uppercase",
          }}
        >
          {sending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}
