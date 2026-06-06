"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { VersionedTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

type Props = {
  onClose: () => void;
};

export function SwapModal({ onClose }: Props) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Fetch SOL balance
  useEffect(() => {
    if (!publicKey) return;
    connection.getBalance(publicKey).then((b) => setSolBalance(b / LAMPORTS_PER_SOL)).catch(() => {});
  }, [publicKey, connection]);

  // Fetch quote when amount changes (debounced)
  useEffect(() => {
    const val = parseFloat(amount);
    if (!val || val <= 0) { setQuote(null); return; }

    const lamports = Math.floor(val * LAMPORTS_PER_SOL);
    setQuoteLoading(true);
    setQuote(null);

    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${lamports}&slippageBps=50`
        );
        if (!res.ok) throw new Error("Quote failed");
        const data = await res.json();
        setQuote(data);
      } catch {
        setQuote(null);
      }
      setQuoteLoading(false);
    }, 500);

    return () => clearTimeout(timeout);
  }, [amount]);

  async function handleSwap() {
    if (!quote || !publicKey || !signTransaction) return;
    setSwapping(true);
    setStatus(null);

    try {
      // Get swap transaction from Jupiter
      const res = await fetch("https://api.jup.ag/swap/v1/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: publicKey.toBase58(),
          wrapAndUnwrapSol: true,
        }),
      });

      if (!res.ok) throw new Error("Failed to build swap transaction");
      const { swapTransaction } = await res.json();

      // Deserialize and sign
      const txBuf = Buffer.from(swapTransaction, "base64");
      const tx = VersionedTransaction.deserialize(txBuf);
      const signed = await signTransaction(tx);

      // Send
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 2,
      });

      await connection.confirmTransaction(sig, "confirmed");

      const usdcOut = (Number(quote.outAmount) / 1_000_000).toFixed(2);
      setStatus({ type: "success", msg: `Swapped ${amount} SOL for ~$${usdcOut} USDC` });
      setAmount("");
      setQuote(null);

      // Refresh balance
      connection.getBalance(publicKey).then((b) => setSolBalance(b / LAMPORTS_PER_SOL)).catch(() => {});
    } catch (e: any) {
      setStatus({ type: "error", msg: e?.message ?? "Swap failed" });
    }
    setSwapping(false);
  }

  const usdcOut = quote ? (Number(quote.outAmount) / 1_000_000).toFixed(2) : null;
  const priceImpact = quote?.priceImpactPct ? (Number(quote.priceImpactPct) * 100).toFixed(2) : null;
  const inputVal = parseFloat(amount) || 0;
  const insufficientBalance = solBalance !== null && inputVal > solBalance;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,.7)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#0a0a0a",
          border: "1px solid #1a1a1a",
          width: "100%",
          maxWidth: 400,
          padding: 24,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 14, color: "#ccc", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            Swap SOL → USDC
          </span>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#666",
              fontSize: 18,
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>

        {/* Balance */}
        <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>
          Available: {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : "Loading..."}
        </div>

        {/* Input */}
        <div style={{ position: "relative", marginBottom: 16 }}>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0"
            style={{
              width: "100%",
              background: "#111",
              border: `1px solid ${insufficientBalance ? "#ff3333" : "#1a1a1a"}`,
              color: "#fff",
              fontSize: 18,
              fontFamily: "'JetBrains Mono', monospace",
              padding: "12px 70px 12px 12px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => solBalance && setAmount((solBalance - 0.01).toFixed(4))}
              style={{
                background: "rgba(0,255,65,.1)",
                border: "1px solid rgba(0,255,65,.3)",
                color: "#00ff41",
                fontSize: 9,
                padding: "2px 6px",
                cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              MAX
            </button>
            <span style={{ color: "#666", fontSize: 12 }}>SOL</span>
          </div>
        </div>
        {insufficientBalance && (
          <div style={{ fontSize: 10, color: "#ff3333", marginTop: -12, marginBottom: 12 }}>
            Insufficient SOL balance
          </div>
        )}

        {/* Arrow */}
        <div style={{ textAlign: "center", color: "#333", fontSize: 18, margin: "4px 0 12px" }}>↓</div>

        {/* Output */}
        <div
          style={{
            background: "#111",
            border: "1px solid #1a1a1a",
            padding: "12px",
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 18, color: usdcOut ? "#fff" : "#333" }}>
            {quoteLoading ? "..." : usdcOut ?? "0.00"}
          </span>
          <span style={{ color: "#666", fontSize: 12 }}>USDC</span>
        </div>

        {/* Rate info */}
        {quote && (
          <div style={{ fontSize: 10, color: "#555", marginBottom: 16, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Rate</span>
              <span>1 SOL ≈ ${(Number(quote.outAmount) / 1_000_000 / inputVal).toFixed(2)} USDC</span>
            </div>
            {priceImpact && (
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Price Impact</span>
                <span style={{ color: Number(priceImpact) > 1 ? "#ff3333" : "#666" }}>{priceImpact}%</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Slippage</span>
              <span>0.5%</span>
            </div>
          </div>
        )}

        {/* Status */}
        {status && (
          <div
            style={{
              fontSize: 11,
              padding: "8px 10px",
              marginBottom: 12,
              border: `1px solid ${status.type === "success" ? "#00ff41" : "#ff3333"}`,
              color: status.type === "success" ? "#00ff41" : "#ff3333",
              wordBreak: "break-word",
            }}
          >
            {status.msg}
          </div>
        )}

        {/* Swap button */}
        <button
          onClick={handleSwap}
          disabled={!quote || swapping || insufficientBalance || !inputVal}
          style={{
            width: "100%",
            padding: "12px",
            background: !quote || swapping || insufficientBalance ? "#1a1a1a" : "#00ff41",
            color: !quote || swapping || insufficientBalance ? "#555" : "#000",
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            cursor: !quote || swapping || insufficientBalance ? "not-allowed" : "pointer",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          {swapping ? "Swapping..." : "Swap"}
        </button>

        <div style={{ fontSize: 9, color: "#333", textAlign: "center", marginTop: 10 }}>
          Powered by Jupiter
        </div>
      </div>
    </div>
  );
}
