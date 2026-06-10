"use client";

import { useState, useEffect, useRef } from "react";
import { useWallet, useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import BN from "bn.js";
import { AuthGuard } from "@/components/AuthGuard";
import { useMarginAccount, Position } from "@/hooks/useMarginAccount";
import { useProtocolState } from "@/hooks/useProtocolState";
import { useOracle } from "@/hooks/useOracle";
import { useNotifications } from "@/providers/NotificationProvider";
import { getProgram } from "@/lib/program";
import {
  PROTOCOL_STATE,
  ORACLE_ACCOUNT,
  FEE_VAULT,
  INSURANCE_FUND,
  USDC_MINT,
  MARKET_SEED,
  PROGRAM_ID,
  getMarginAccountPDA,
} from "@/lib/addresses";
import {
  rawToPrice,
  rawToUsdc,
  calcPnl,
  calcLiqPriceLong,
  calcLiqPriceShort,
} from "@/lib/utils";
import { MARKETS } from "@/lib/markets";
import { TradeHistory } from "@/components/TradeHistory";

// ── Helpers ──────────────────────────────────────────────────────────────────

const FUNDING_RATE_SCALE = 100_000;

function getMarketForOracle(oracleAddr: string) {
  return MARKETS.find((m) => m.oracleAddress === oracleAddr) ?? null;
}

function getMarketStatePDA(marketId: string): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [MARKET_SEED, Buffer.from(marketId)],
    PROGRAM_ID
  );
  return pda;
}

function getMarketIdForOracle(oracleAddr: string): string {
  return getMarketForOracle(oracleAddr)?.id ?? "PRISMATIC-ETB";
}

function useLiveTimer(openTimestamp: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - openTimestamp);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Position Card ────────────────────────────────────────────────────────────

function PositionCardStandalone({ pos, freeCollateral, onMarginRefresh }: { pos: Position; freeCollateral: number; onMarginRefresh: () => void }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { addNotification } = useNotifications();
  const protocol = useProtocolState();

  const market = getMarketForOracle(pos.oracle);
  const oracleAddr = pos.oracle || ORACLE_ACCOUNT.toBase58();
  const oracle = useOracle(oracleAddr, market?.priceApiMarket);

  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [slInput, setSlInput] = useState(pos.slPrice ? rawToPrice(pos.slPrice).toFixed(2) : "");
  const [tpInput, setTpInput] = useState(pos.tpPrice ? rawToPrice(pos.tpPrice).toFixed(2) : "");
  const [marginMode, setMarginMode] = useState<"idle" | "add" | "remove">("idle");
  const [marginInput, setMarginInput] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isLong = pos.direction === "Long";
  const timeStr = useLiveTimer(pos.openTimestamp);

  const currentPriceRaw = oracle.price;
  const entryPriceUsd = rawToPrice(pos.entryPrice);
  const currentPriceUsd = rawToPrice(currentPriceRaw);
  const collateralUsdc = rawToUsdc(pos.collateral);
  const notionalUsdc = rawToUsdc(pos.notional);

  const pnlRaw = calcPnl(pos.direction, currentPriceRaw, pos.entryPrice, pos.notional);
  const pnlUsdc = rawToUsdc(pnlRaw);
  const isProfit = pnlUsdc >= 0;
  const pnlPct = collateralUsdc > 0 ? (pnlUsdc / collateralUsdc) * 100 : 0;

  const liqPrice = isLong
    ? calcLiqPriceLong(pos.entryPrice, pos.leverage)
    : calcLiqPriceShort(pos.entryPrice, pos.leverage);

  const marginRatio = pos.notional > 0 ? (pos.collateral / pos.notional) * 100 : 100;

  // Funding
  const nowSec = Math.floor(Date.now() / 1000);
  const hoursOpen = Math.max(0, Math.floor((nowSec - pos.openTimestamp) / 3600));
  const totalOI = protocol.totalLongExposure + protocol.totalShortExposure;
  const skewRate = totalOI > 0
    ? Math.floor(Math.abs(protocol.totalLongExposure - protocol.totalShortExposure) * protocol.skewFactor / totalOI)
    : 0;
  const onMajority = isLong
    ? protocol.totalLongExposure >= protocol.totalShortExposure
    : protocol.totalShortExposure >= protocol.totalLongExposure;
  const hourlyRate = onMajority
    ? protocol.baseFundingRatePerHour + skewRate
    : Math.max(0, protocol.baseFundingRatePerHour - skewRate);
  const fundingAccrued = rawToUsdc(Math.floor(pos.notional * hourlyRate * hoursOpen / FUNDING_RATE_SCALE));
  const fundingRatePct = (hourlyRate / FUNDING_RATE_SCALE) * 100;

  // SL/TP validation
  const slVal = parseFloat(slInput) || 0;
  const tpVal = parseFloat(tpInput) || 0;
  const slValid = slVal === 0 || (isLong ? slVal < entryPriceUsd : slVal > entryPriceUsd);
  const tpValid = tpVal === 0 || (isLong ? tpVal > entryPriceUsd : tpVal < entryPriceUsd);

  // Margin add/remove
  const marginInputAmt = parseFloat(marginInput) || 0;
  const marginInputRaw = marginInputAmt * 1e6;
  const newCollateral = marginMode === "add" ? pos.collateral + marginInputRaw : pos.collateral - marginInputRaw;
  const newMarginRatio = pos.notional > 0 ? (newCollateral / pos.notional) * 100 : 100;
  const removeMarginBlocked = marginMode === "remove" && newMarginRatio < 15;

  const closeFeeUsdc = rawToUsdc(Math.floor((pos.collateral * protocol.feeBps) / 10_000));
  const slPriceUsd = pos.slPrice ? rawToPrice(pos.slPrice) : null;
  const tpPriceUsd = pos.tpPrice ? rawToPrice(pos.tpPrice) : null;

  // ── TX Handlers ───────────────────────────────────────────────────────────

  async function handleClose() {
    if (!publicKey || !anchorWallet) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      let needsCreate = false;
      try { await getAccount(connection, ata); } catch { needsCreate = true; }

      const marketIdForPos = getMarketIdForOracle(oracleAddr);
      const txBuilder = (program.methods as any).closePosition(pos.index).accounts({
        user: publicKey,
        protocolState: PROTOCOL_STATE,
        marginAccount: marginPda,
        oracle: new PublicKey(oracleAddr),
        marketState: getMarketStatePDA(marketIdForPos),
        feeVault: FEE_VAULT,
        insuranceFund: INSURANCE_FUND,
        userTokenAccount: ata,
        tokenProgram: TOKEN_PROGRAM_ID,
        liquidityPool: PublicKey.findProgramAddressSync([Buffer.from("liquidity_pool")], PROGRAM_ID)[0],
        lpVault: PublicKey.findProgramAddressSync([Buffer.from("lp_vault")], PROGRAM_ID)[0],
      });

      if (needsCreate) {
        const createIx = createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, USDC_MINT);
        await txBuilder.preInstructions([createIx]).rpc();
      } else {
        await txBuilder.rpc();
      }
      setTxStatus({ type: "success", msg: `Closed. PnL: ${isProfit ? "+" : ""}$${pnlUsdc.toFixed(2)}` });
      addNotification(isProfit ? "success" : "warning", "Position Closed", `PnL: ${isProfit ? "+" : ""}$${pnlUsdc.toFixed(2)}`);
      setConfirmClose(false);
      onMarginRefresh();
      setTimeout(onMarginRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Failed" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSetSlTp() {
    if (!publicKey || !anchorWallet) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      const slBn = slInput ? new BN(Math.round(parseFloat(slInput) * 1_000_000)) : null;
      const tpBn = tpInput ? new BN(Math.round(parseFloat(tpInput) * 1_000_000)) : null;
      await (program.methods as any).setSlTp(pos.index, slBn, tpBn).accounts({
        user: publicKey, protocolState: PROTOCOL_STATE, marginAccount: marginPda,
        oracle: new PublicKey(oracleAddr),
      }).rpc();
      setTxStatus({ type: "success", msg: "SL/TP updated" });
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Failed" });
    } finally {
      setLoading(false);
    }
  }

  async function handleMarginAction() {
    if (!publicKey || !anchorWallet) return;
    const amt = parseFloat(marginInput);
    if (!amt || amt <= 0) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      if (marginMode === "add") {
        await (program.methods as any).addMargin(pos.index, new BN(Math.round(amt * 1e6)))
          .accounts({ user: publicKey, protocolState: PROTOCOL_STATE, marginAccount: marginPda }).rpc();
      } else {
        await (program.methods as any).removeMargin(pos.index, new BN(Math.round(amt * 1e6)))
          .accounts({ user: publicKey, protocolState: PROTOCOL_STATE, marginAccount: marginPda, oracle: new PublicKey(oracleAddr) }).rpc();
      }
      setTxStatus({ type: "success", msg: `${marginMode === "add" ? "+" : "-"}$${amt.toFixed(2)} margin` });
      setMarginMode("idle");
      setMarginInput("");
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Failed" });
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const marketName = market?.name ?? "Unknown Market";
  const dirColor = isLong ? "#00ff41" : "#ff3333";
  const pnlColor = isProfit ? "#00ff41" : "#ff3333";
  const marginColor = marginRatio < 15 ? "#ff3333" : marginRatio < 30 ? "#ffaa00" : "#00ff41";

  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #1a1a1a",
        borderLeft: `3px solid ${dirColor}`,
        marginBottom: 16,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
            padding: "2px 8px", color: dirColor,
            background: isLong ? "rgba(0,255,65,0.1)" : "rgba(255,51,51,0.1)",
            border: `1px solid ${isLong ? "rgba(0,255,65,0.3)" : "rgba(255,51,51,0.3)"}`,
          }}>
            {pos.direction.toUpperCase()} {pos.leverage}x
          </span>
          <span style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>{marketName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: pnlColor }}>
              {isProfit ? "+" : ""}${pnlUsdc.toFixed(2)}
            </div>
            <div style={{ fontSize: 10, color: pnlColor }}>
              {isProfit ? "+" : ""}{pnlPct.toFixed(1)}%
            </div>
          </div>
          <span style={{ fontSize: 14, color: "#444" }}>{expanded ? "\u25B2" : "\u25BC"}</span>
        </div>
      </button>

      {/* Summary row — always visible */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
          gap: 1,
          borderTop: "1px solid #1a1a1a",
          background: "#0d0d0d",
        }}
      >
        {[
          ["Size", `$${notionalUsdc.toFixed(2)}`],
          ["Collateral", `$${collateralUsdc.toFixed(2)}`],
          ["Entry", `$${entryPriceUsd.toFixed(2)}`],
          ["Current", `$${currentPriceUsd.toFixed(2)}`],
          ["Liq Price", `$${liqPrice.toFixed(2)}`],
          ["Time", timeStr],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: "8px 16px", background: "#111" }}>
            <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
            <div style={{ fontSize: 12, color: "#ccc", marginTop: 2 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{ borderTop: "1px solid #1a1a1a", padding: "16px" }}>
          {/* Margin ratio bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: "#666" }}>Margin Ratio</span>
              <span style={{ color: marginColor, fontWeight: 600 }}>{marginRatio.toFixed(1)}%</span>
            </div>
            <div style={{ height: 6, background: "#1a1a1a", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(marginRatio, 100)}%`, background: marginColor, transition: "width 0.5s" }} />
            </div>
          </div>

          {/* Funding info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            {[
              ["Funding Accrued", hoursOpen > 0 ? `-$${fundingAccrued.toFixed(4)}` : "< 1h", hoursOpen > 0 ? "#ff3333" : "#666"],
              ["Rate", `${fundingRatePct.toFixed(4)}%/hr`, "#ccc"],
              ["Close Fee", `-$${closeFeeUsdc.toFixed(4)}`, "#ccc"],
            ].map(([label, value, color]) => (
              <div key={label as string}>
                <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
                <div style={{ fontSize: 11, color: color as string, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* SL/TP */}
          <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Stop Loss / Take Profit
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>
                  SL {slPriceUsd ? `($${slPriceUsd.toFixed(2)})` : "(not set)"}
                </div>
                <input
                  type="number" step="0.01" value={slInput}
                  onChange={(e) => setSlInput(e.target.value)}
                  placeholder={isLong ? `< ${entryPriceUsd.toFixed(2)}` : `> ${entryPriceUsd.toFixed(2)}`}
                  style={{
                    width: "100%", background: "transparent", fontSize: 12, color: "#ccc",
                    border: `1px solid ${slVal > 0 && !slValid ? "#ff3333" : "#333"}`,
                    padding: "6px 8px", outline: "none", fontFamily: "'JetBrains Mono', monospace",
                  }}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>
                  TP {tpPriceUsd ? `($${tpPriceUsd.toFixed(2)})` : "(not set)"}
                </div>
                <input
                  type="number" step="0.01" value={tpInput}
                  onChange={(e) => setTpInput(e.target.value)}
                  placeholder={isLong ? `> ${entryPriceUsd.toFixed(2)}` : `< ${entryPriceUsd.toFixed(2)}`}
                  style={{
                    width: "100%", background: "transparent", fontSize: 12, color: "#ccc",
                    border: `1px solid ${tpVal > 0 && !tpValid ? "#ff3333" : "#333"}`,
                    padding: "6px 8px", outline: "none", fontFamily: "'JetBrains Mono', monospace",
                  }}
                />
              </div>
            </div>
            {(slInput || tpInput) && slValid && tpValid && (
              <button
                onClick={handleSetSlTp} disabled={loading}
                style={{
                  width: "100%", marginTop: 8, padding: "8px", fontSize: 11, fontWeight: 700,
                  background: "none", border: "1px solid rgba(0,255,65,0.4)", color: "#00ff41",
                  cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
                  fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em",
                }}
              >
                {loading ? "CONFIRMING..." : "SET SL/TP"}
              </button>
            )}
          </div>

          {/* Margin management */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={() => { setMarginMode(marginMode === "add" ? "idle" : "add"); setMarginInput(""); }}
              style={{
                flex: 1, padding: "8px", fontSize: 11, fontWeight: 600,
                background: marginMode === "add" ? "rgba(0,255,65,0.1)" : "none",
                border: `1px solid ${marginMode === "add" ? "#00ff41" : "#333"}`,
                color: marginMode === "add" ? "#00ff41" : "#888",
                cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              ADD MARGIN
            </button>
            <button
              onClick={() => { setMarginMode(marginMode === "remove" ? "idle" : "remove"); setMarginInput(""); }}
              style={{
                flex: 1, padding: "8px", fontSize: 11, fontWeight: 600,
                background: marginMode === "remove" ? "rgba(255,51,51,0.1)" : "none",
                border: `1px solid ${marginMode === "remove" ? "#ff3333" : "#333"}`,
                color: marginMode === "remove" ? "#ff3333" : "#888",
                cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              REMOVE MARGIN
            </button>
          </div>

          {marginMode !== "idle" && (
            <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", padding: 12, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888", marginBottom: 6 }}>
                <span>{marginMode === "add" ? "Add" : "Remove"}</span>
                <span
                  style={{ cursor: "pointer", color: "#666" }}
                  onClick={() => setMarginInput(marginMode === "add" ? rawToUsdc(freeCollateral).toFixed(2) : rawToUsdc(pos.collateral).toFixed(2))}
                >
                  Max: ${marginMode === "add" ? rawToUsdc(freeCollateral).toFixed(2) : rawToUsdc(pos.collateral).toFixed(2)}
                </span>
              </div>
              <input
                type="number" step="0.01" value={marginInput}
                onChange={(e) => setMarginInput(e.target.value)}
                placeholder="0.00"
                style={{
                  width: "100%", background: "transparent", fontSize: 12, color: "#ccc",
                  border: "1px solid #333", padding: "8px", outline: "none",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
              {marginInputAmt > 0 && (
                <div style={{ fontSize: 11, color: "#888", marginTop: 6, display: "flex", justifyContent: "space-between" }}>
                  <span>Margin ratio</span>
                  <span>
                    <span style={{ color: "#ccc" }}>{marginRatio.toFixed(1)}%</span>
                    <span style={{ color: "#555", margin: "0 4px" }}>&rarr;</span>
                    <span style={{ color: newMarginRatio < 15 ? "#ff3333" : newMarginRatio < 20 ? "#ffaa00" : "#00ff41" }}>
                      {newMarginRatio.toFixed(1)}%
                    </span>
                  </span>
                </div>
              )}
              {removeMarginBlocked && (
                <div style={{ fontSize: 10, color: "#ff3333", marginTop: 6, border: "1px solid rgba(255,51,51,0.3)", padding: "6px 8px", background: "rgba(255,51,51,0.05)" }}>
                  Cannot remove — margin ratio would drop below 15%
                </div>
              )}
              <button
                onClick={handleMarginAction}
                disabled={loading || marginInputAmt <= 0 || removeMarginBlocked}
                style={{
                  width: "100%", marginTop: 8, padding: "8px", fontSize: 11, fontWeight: 700,
                  background: "none",
                  border: `1px solid ${marginMode === "add" ? "rgba(0,255,65,0.4)" : "rgba(255,51,51,0.4)"}`,
                  color: marginMode === "add" ? "#00ff41" : "#ff3333",
                  cursor: loading || marginInputAmt <= 0 || removeMarginBlocked ? "not-allowed" : "pointer",
                  opacity: loading || marginInputAmt <= 0 || removeMarginBlocked ? 0.5 : 1,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {loading ? "CONFIRMING..." : marginMode === "add" ? "ADD" : "REMOVE"}
              </button>
            </div>
          )}

          {/* Close */}
          {!confirmClose ? (
            <button
              onClick={() => setConfirmClose(true)} disabled={loading || oracle.isStale}
              style={{
                width: "100%", padding: "10px", fontSize: 12, fontWeight: 700,
                background: "none", border: "1px solid rgba(255,51,51,0.5)", color: "#ff3333",
                cursor: loading || oracle.isStale ? "not-allowed" : "pointer",
                opacity: loading || oracle.isStale ? 0.5 : 1,
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em",
              }}
            >
              {oracle.isStale ? "ORACLE STALE" : "CLOSE POSITION"}
            </button>
          ) : (
            <div style={{ background: "#0d0d0d", border: "1px solid #1a1a1a", padding: 12 }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>Close at ${currentPriceUsd.toFixed(2)}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, marginBottom: 12 }}>
                <div>
                  <span style={{ color: "#666" }}>PnL: </span>
                  <span style={{ color: pnlColor }}>{isProfit ? "+" : ""}${pnlUsdc.toFixed(2)}</span>
                </div>
                <div>
                  <span style={{ color: "#666" }}>Fee: </span>
                  <span style={{ color: "#ccc" }}>-${closeFeeUsdc.toFixed(4)}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleClose} disabled={loading}
                  style={{
                    flex: 1, padding: "10px", fontSize: 11, fontWeight: 700,
                    background: "#ff3333", color: "#fff", border: "none",
                    cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {loading ? "CONFIRMING..." : "CONFIRM CLOSE"}
                </button>
                <button
                  onClick={() => setConfirmClose(false)} disabled={loading}
                  style={{
                    padding: "10px 16px", fontSize: 11, background: "none",
                    border: "1px solid #333", color: "#888", cursor: "pointer",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}

          {/* TX status */}
          {txStatus && (
            <div style={{
              marginTop: 8, fontSize: 11, padding: "8px 12px",
              border: `1px solid ${txStatus.type === "success" ? "#00ff41" : "#ff3333"}`,
              color: txStatus.type === "success" ? "#00ff41" : "#ff3333",
              background: txStatus.type === "success" ? "rgba(0,255,65,0.05)" : "rgba(255,51,51,0.05)",
            }}>
              {txStatus.msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PositionsPage() {
  return <AuthGuard><PositionsContent /></AuthGuard>;
}

function PositionsContent() {
  const margin = useMarginAccount();
  const { connected } = useWallet();
  const [tab, setTab] = useState<"positions" | "history">("positions");

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0a0a",
        fontFamily: "'JetBrains Mono', 'Fira Mono', 'Consolas', monospace",
        padding: "32px 16px 100px",
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Tab toggle */}
        <div style={{ display: "flex", marginBottom: 24 }}>
          {(["positions", "history"] as const).map((t) => {
            const active = tab === t;
            const label = t === "positions" ? "POSITIONS" : "TRADE HISTORY";
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  background: "none",
                  border: "none",
                  borderBottom: active ? "2px solid #00ff41" : "2px solid #1a1a1a",
                  color: active ? "#00ff41" : "#555",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {tab === "positions" ? (
          <>
            {/* Account summary */}
            {margin.exists && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 1,
                  background: "#1a1a1a",
                  border: "1px solid #1a1a1a",
                  marginBottom: 24,
                }}
              >
                <div style={{ background: "#111", padding: "12px 16px" }}>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>Free Collateral</div>
                  <div style={{ fontSize: 14, color: "#00ff41", fontWeight: 700, marginTop: 4 }}>
                    ${rawToUsdc(margin.collateral).toFixed(2)}
                  </div>
                </div>
                <div style={{ background: "#111", padding: "12px 16px" }}>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>Open Positions</div>
                  <div style={{ fontSize: 14, color: "#ccc", fontWeight: 700, marginTop: 4 }}>
                    {margin.positions.length} / 5
                  </div>
                </div>
                <div style={{ background: "#111", padding: "12px 16px" }}>
                  <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Notional</div>
                  <div style={{ fontSize: 14, color: "#ccc", fontWeight: 700, marginTop: 4 }}>
                    ${rawToUsdc(margin.positions.reduce((s, p) => s + p.notional, 0)).toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {/* Positions */}
            {margin.isLoading ? (
              <div style={{ textAlign: "center", padding: "48px 16px", fontSize: 12, color: "#666" }}>
                Loading positions...
              </div>
            ) : !connected ? (
              <div style={{ textAlign: "center", padding: "48px 16px", fontSize: 12, color: "#666" }}>
                Connect your wallet to view positions
              </div>
            ) : margin.positions.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "48px 16px", fontSize: 12, color: "#666",
                background: "#111", border: "1px solid #1a1a1a",
              }}>
                <div style={{ marginBottom: 8 }}>No open positions</div>
                <a href="/" style={{ color: "#00ff41", textDecoration: "none", fontSize: 11 }}>
                  Open your first position &rarr;
                </a>
              </div>
            ) : (
              margin.positions.map((pos) => (
                <PositionCardStandalone
                  key={pos.index}
                  pos={pos}
                  freeCollateral={margin.collateral}
                  onMarginRefresh={margin.refresh}
                />
              ))
            )}
          </>
        ) : (
          /* Trade History tab */
          connected ? (
            <TradeHistory expanded />
          ) : (
            <div style={{ textAlign: "center", padding: "48px 16px", fontSize: 12, color: "#666" }}>
              Connect your wallet to view trade history
            </div>
          )
        )}
      </div>
    </div>
  );
}
