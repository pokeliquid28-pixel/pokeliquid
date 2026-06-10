"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import BN from "bn.js";

import { getProgram, getReadonlyProgram } from "@/lib/program";
import {
  PROTOCOL_STATE,
  FEE_VAULT,
  USDC_MINT,
  PROGRAM_ID,
  REFERRAL_SEED,
  getReferralAccountPDA,
} from "@/lib/addresses";

type ReferralData = {
  owner: PublicKey;
  username: string;
  pendingFees: number;
  totalEarned: number;
  totalReferrals: number;
};

export default function ReferralPage() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [referral, setReferral] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [usernameInput, setUsernameInput] = useState("");
  const [registering, setRegistering] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [txMsg, setTxMsg] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchReferral = useCallback(async () => {
    if (!publicKey) {
      setReferral(null);
      setLoading(false);
      return;
    }
    try {
      const program = getReadonlyProgram(connection);
      const pda = getReferralAccountPDA(publicKey);
      const acct = await (program.account as any).referralAccount.fetch(pda);
      const usernameBytes = acct.username.slice(0, acct.usernameLen);
      const username = Buffer.from(usernameBytes).toString("utf-8");
      setReferral({
        owner: acct.owner,
        username,
        pendingFees: acct.pendingFees.toNumber ? acct.pendingFees.toNumber() : Number(acct.pendingFees),
        totalEarned: acct.totalEarned.toNumber ? acct.totalEarned.toNumber() : Number(acct.totalEarned),
        totalReferrals: acct.totalReferrals.toNumber ? acct.totalReferrals.toNumber() : Number(acct.totalReferrals),
      });
    } catch {
      setReferral(null);
    } finally {
      setLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    setLoading(true);
    fetchReferral();
  }, [fetchReferral]);

  async function handleRegister() {
    if (!publicKey || !anchorWallet || !usernameInput.trim()) return;
    setRegistering(true);
    setTxMsg(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const pda = getReferralAccountPDA(publicKey);
      await (program.methods as any)
        .registerReferral(usernameInput.trim())
        .accounts({
          user: publicKey,
          referralAccount: pda,
        })
        .rpc();
      setTxMsg({ type: "success", msg: "Referral account created!" });
      setUsernameInput("");
      setTimeout(fetchReferral, 2000);
    } catch (e: any) {
      setTxMsg({ type: "error", msg: e?.message ?? "Registration failed" });
    } finally {
      setRegistering(false);
    }
  }

  async function handleClaim() {
    if (!publicKey || !anchorWallet || !referral || referral.pendingFees === 0) return;
    setClaiming(true);
    setTxMsg(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const pda = getReferralAccountPDA(publicKey);
      const userAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      await (program.methods as any)
        .claimReferral()
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          referralAccount: pda,
          userTokenAccount: userAta,
          feeVault: FEE_VAULT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      setTxMsg({ type: "success", msg: `Claimed $${(referral.pendingFees / 1_000_000).toFixed(2)} USDC!` });
      setTimeout(fetchReferral, 2000);
    } catch (e: any) {
      setTxMsg({ type: "error", msg: e?.message ?? "Claim failed" });
    } finally {
      setClaiming(false);
    }
  }

  function handleCopyLink() {
    if (!referral) return;
    const link = `https://pokeliquid.xyz/ref/${referral.username}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const pendingUsdc = referral ? (referral.pendingFees / 1_000_000).toFixed(2) : "0.00";
  const totalUsdc = referral ? (referral.totalEarned / 1_000_000).toFixed(2) : "0.00";

  return (
    <div
      style={{
        minHeight: "calc(100dvh - 120px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#fff",
            letterSpacing: "0.06em",
            marginBottom: 8,
          }}
        >
          REFERRALS
        </h1>
        <p style={{ fontSize: 12, color: "#666", marginBottom: 32 }}>
          Earn 10% of trading fees from every trader you refer.
        </p>

        {!connected ? (
          <div
            style={{
              border: "1px solid #1a1a1a",
              padding: 24,
              textAlign: "center",
              color: "#666",
              fontSize: 13,
            }}
          >
            Connect your wallet to get started.
          </div>
        ) : loading ? (
          <div style={{ color: "#666", fontSize: 13 }}>Loading...</div>
        ) : !referral ? (
          /* ── Registration ── */
          <div style={{ border: "1px solid #1a1a1a", padding: 24 }}>
            <div style={{ fontSize: 13, color: "#ccc", marginBottom: 16 }}>
              Choose a username to create your referral link.
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                type="text"
                maxLength={32}
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                placeholder="username"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid #333",
                  padding: "10px 14px",
                  color: "#fff",
                  fontSize: 14,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <button
                onClick={handleRegister}
                disabled={registering || !usernameInput.trim()}
                style={{
                  background: usernameInput.trim() ? "#00ff41" : "#333",
                  color: usernameInput.trim() ? "#000" : "#666",
                  border: "none",
                  padding: "10px 20px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: usernameInput.trim() ? "pointer" : "not-allowed",
                  letterSpacing: "0.06em",
                  fontFamily: "inherit",
                }}
              >
                {registering ? "..." : "CREATE"}
              </button>
            </div>
            <div style={{ fontSize: 10, color: "#555" }}>
              Your link will be: pokeliquid.xyz/ref/{usernameInput || "username"}
            </div>
          </div>
        ) : (
          /* ── Dashboard ── */
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Referral link */}
            <div style={{ border: "1px solid #1a1a1a", padding: 20 }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                Your Referral Link
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div
                  style={{
                    flex: 1,
                    background: "#111",
                    border: "1px solid #222",
                    padding: "10px 14px",
                    fontSize: 12,
                    color: "#00ff41",
                    wordBreak: "break-all",
                  }}
                >
                  pokeliquid.xyz/ref/{referral.username}
                </div>
                <button
                  onClick={handleCopyLink}
                  style={{
                    background: copied ? "#00ff41" : "#222",
                    color: copied ? "#000" : "#ccc",
                    border: "1px solid #333",
                    padding: "10px 16px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: "0.04em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {copied ? "COPIED" : "COPY"}
                </button>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <StatBox label="PENDING" value={`$${pendingUsdc}`} color="#00ff41" />
              <StatBox label="TOTAL EARNED" value={`$${totalUsdc}`} color="#ccc" />
              <StatBox label="REFERRALS" value={referral.totalReferrals.toString()} color="#ccc" />
            </div>

            {/* Claim button */}
            <button
              onClick={handleClaim}
              disabled={claiming || referral.pendingFees === 0}
              style={{
                background: referral.pendingFees > 0 ? "#00ff41" : "#222",
                color: referral.pendingFees > 0 ? "#000" : "#555",
                border: "none",
                padding: "14px 0",
                fontSize: 13,
                fontWeight: 700,
                cursor: referral.pendingFees > 0 ? "pointer" : "not-allowed",
                letterSpacing: "0.06em",
                fontFamily: "inherit",
                width: "100%",
              }}
            >
              {claiming ? "CLAIMING..." : referral.pendingFees > 0 ? `CLAIM $${pendingUsdc} USDC` : "NO FEES TO CLAIM"}
            </button>

            {/* How it works */}
            <div style={{ border: "1px solid #1a1a1a", padding: 20 }}>
              <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>
                How It Works
              </div>
              <div style={{ fontSize: 11, color: "#888", lineHeight: 1.8 }}>
                1. Share your referral link with friends<br />
                2. When they trade, you earn 10% of their trading fees<br />
                3. Fees accumulate on-chain — claim anytime
              </div>
            </div>
          </div>
        )}

        {/* Tx status */}
        {txMsg && (
          <div
            style={{
              marginTop: 16,
              padding: "10px 14px",
              border: `1px solid ${txMsg.type === "success" ? "#00ff41" : "#ff3333"}`,
              color: txMsg.type === "success" ? "#00ff41" : "#ff3333",
              background: txMsg.type === "success" ? "rgba(0,255,65,0.06)" : "rgba(255,51,51,0.06)",
              fontSize: 12,
            }}
          >
            {txMsg.msg}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ border: "1px solid #1a1a1a", padding: "16px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
    </div>
  );
}
