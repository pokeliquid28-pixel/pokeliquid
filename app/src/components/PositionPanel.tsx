"use client";

import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useState, useEffect, useRef } from "react";

import { getProgram } from "@/lib/program";
import { useNotifications } from "@/providers/NotificationProvider";
import BN from "bn.js";
import {
  PROTOCOL_STATE,
  ORACLE_ACCOUNT,
  FEE_VAULT,
  INSURANCE_FUND,
  USDC_MINT,
  getMarginAccountPDA,
} from "@/lib/addresses";
import {
  rawToPrice,
  rawToUsdc,
  calcPnl,
  calcLiqPriceLong,
  calcLiqPriceShort,
} from "@/lib/utils";
import { OracleData } from "@/hooks/useOracle";
import { MarginAccountData, Position } from "@/hooks/useMarginAccount";
import { ProtocolStateData } from "@/hooks/useProtocolState";

const FUNDING_RATE_SCALE = 100_000;

type Props = {
  oracle: OracleData;
  margin: MarginAccountData;
  protocol: ProtocolStateData;
  onRefresh: () => void;
  oracleAddress?: string;
};

export function PositionPanel({ oracle, margin, protocol, onRefresh, oracleAddress }: Props) {
  const { connected } = useWallet();

  if (margin.positions.length === 0) {
    if (!connected) return null;
    return (
      <div className="border border-border bg-panel p-6 md:p-8">
        <div className="text-center space-y-2">
          <div className="text-secondary text-sm">No open positions</div>
          <div className="text-secondary/60 text-xs">Open your first position above</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {margin.positions.map((pos) => (
        <PositionCard
          key={pos.index}
          pos={pos}
          oracle={oracle}
          protocol={protocol}
          freeCollateral={margin.collateral}
          onRefresh={onRefresh}
          oracleAddress={oracleAddress}
        />
      ))}
    </div>
  );
}

// ── Live timer hook ─────────────────────────────────────────────────────────

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

// ── Position Card ───────────────────────────────────────────────────────────

function PositionCard({
  pos,
  oracle,
  protocol,
  freeCollateral,
  onRefresh,
  oracleAddress,
}: {
  pos: Position;
  oracle: OracleData;
  protocol: ProtocolStateData;
  freeCollateral: number;
  onRefresh: () => void;
  oracleAddress?: string;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [slInput, setSlInput] = useState(pos.slPrice ? rawToPrice(pos.slPrice).toFixed(2) : "");
  const [tpInput, setTpInput] = useState(pos.tpPrice ? rawToPrice(pos.tpPrice).toFixed(2) : "");
  const [marginMode, setMarginMode] = useState<"idle" | "add" | "remove">("idle");
  const [marginInput, setMarginInput] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
  const [pnlFlash, setPnlFlash] = useState("");

  const isLong = pos.direction === "Long";
  const timeStr = useLiveTimer(pos.openTimestamp);

  // ── Price & PnL ─────────────────────────────────────────────────────────
  const currentPriceRaw = oracle.price;
  const entryPriceUsd = rawToPrice(pos.entryPrice);
  const currentPriceUsd = rawToPrice(currentPriceRaw);
  const collateralUsdc = rawToUsdc(pos.collateral);
  const notionalUsdc = rawToUsdc(pos.notional);

  const pnlRaw = calcPnl(pos.direction, currentPriceRaw, pos.entryPrice, pos.notional);
  const pnlUsdc = rawToUsdc(pnlRaw);
  const isProfit = pnlUsdc >= 0;
  const pnlPct = notionalUsdc > 0 ? (pnlUsdc / collateralUsdc) * 100 : 0;

  // PnL flash on price change
  const prevPnl = useRef(pnlUsdc);
  useEffect(() => {
    if (prevPnl.current !== pnlUsdc && prevPnl.current !== 0) {
      setPnlFlash(pnlUsdc > prevPnl.current ? "pnl-flash-up" : "pnl-flash-down");
      const t = setTimeout(() => setPnlFlash(""), 600);
      prevPnl.current = pnlUsdc;
      return () => clearTimeout(t);
    }
    prevPnl.current = pnlUsdc;
  }, [pnlUsdc]);

  const liqPrice = isLong
    ? calcLiqPriceLong(pos.entryPrice, pos.leverage)
    : calcLiqPriceShort(pos.entryPrice, pos.leverage);

  // ── Margin ratio ────────────────────────────────────────────────────────
  const marginRatio = pos.notional > 0 ? (pos.collateral / pos.notional) * 100 : 100;
  const marginBarPct = Math.max(0, Math.min(marginRatio, 100));
  const marginColor =
    marginRatio < 15 ? "bg-short" : marginRatio < 30 ? "bg-accent" : "bg-long";
  const marginLabel =
    marginRatio < 15 ? "text-short" : marginRatio < 30 ? "text-accent" : "text-long";
  const safetyLabel =
    marginRatio < 15 ? "Danger" : marginRatio < 30 ? "Warning" : "Safe";
  const safetyDot =
    marginRatio < 15 ? "bg-short" : marginRatio < 30 ? "bg-accent" : "bg-long";

  // ── Funding ─────────────────────────────────────────────────────────────
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
  const funding24hEst = rawToUsdc(Math.floor(pos.notional * hourlyRate * 24 / FUNDING_RATE_SCALE));

  // ── SL/TP ───────────────────────────────────────────────────────────────
  const slPriceUsd = pos.slPrice ? rawToPrice(pos.slPrice) : null;
  const tpPriceUsd = pos.tpPrice ? rawToPrice(pos.tpPrice) : null;

  // SL/TP input validation
  const slVal = parseFloat(slInput) || 0;
  const tpVal = parseFloat(tpInput) || 0;
  const slValid = slVal === 0 || (isLong ? slVal < entryPriceUsd : slVal > entryPriceUsd);
  const tpValid = tpVal === 0 || (isLong ? tpVal > entryPriceUsd : tpVal < entryPriceUsd);

  // Estimated PnL at SL/TP prices
  const estimatePnlAt = (price: number) => {
    if (price === 0 || entryPriceUsd === 0) return 0;
    const delta = isLong ? price - entryPriceUsd : entryPriceUsd - price;
    return (delta / entryPriceUsd) * notionalUsdc;
  };
  const slEstPnl = slVal > 0 ? estimatePnlAt(slVal) : null;
  const tpEstPnl = tpVal > 0 ? estimatePnlAt(tpVal) : null;

  // ── Margin add/remove ───────────────────────────────────────────────────
  const marginInputAmt = parseFloat(marginInput) || 0;
  const marginInputRaw = marginInputAmt * 1e6;
  const newCollateral = marginMode === "add"
    ? pos.collateral + marginInputRaw
    : pos.collateral - marginInputRaw;
  const newMarginRatio = pos.notional > 0 ? (newCollateral / pos.notional) * 100 : 100;
  const removeMarginWarning = marginMode === "remove" && newMarginRatio < 20 && newMarginRatio >= 15;
  const removeMarginBlocked = marginMode === "remove" && newMarginRatio < 15;

  // ── Close fee preview ───────────────────────────────────────────────────
  const closeFeeUsdc = rawToUsdc(Math.floor((pos.collateral * protocol.feeBps) / 10_000));

  // ── TX handlers ─────────────────────────────────────────────────────────

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

      const txBuilder = (program.methods as any).closePosition(pos.index).accounts({
        user: publicKey,
        protocolState: PROTOCOL_STATE,
        marginAccount: marginPda,
        oracle: oracleAddress ? new PublicKey(oracleAddress) : ORACLE_ACCOUNT,
        feeVault: FEE_VAULT,
        insuranceFund: INSURANCE_FUND,
        userTokenAccount: ata,
        tokenProgram: TOKEN_PROGRAM_ID,
      });

      if (needsCreate) {
        const createIx = createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, USDC_MINT);
        await txBuilder.preInstructions([createIx]).rpc();
      } else {
        await txBuilder.rpc();
      }

      setTxStatus({
        type: "success",
        msg: `Position #${pos.index} closed. PnL: ${isProfit ? "+" : ""}$${pnlUsdc.toFixed(2)}`,
      });
      addNotification(
        isProfit ? "success" : "warning",
        `Position #${pos.index} Closed`,
        `${pos.direction} closed at $${currentPriceUsd.toFixed(2)} — PnL: ${isProfit ? "+" : ""}$${pnlUsdc.toFixed(2)}`
      );
      setConfirmClose(false);
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Transaction failed" });
      addNotification("error", "Close Position Failed", e?.message ?? "Transaction failed");
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

      await (program.methods as any)
        .setSlTp(pos.index, slBn, tpBn)
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          marginAccount: marginPda,
          oracle: oracleAddress ? new PublicKey(oracleAddress) : ORACLE_ACCOUNT,
        })
        .rpc();

      setTxStatus({ type: "success", msg: `SL/TP updated` });
      addNotification("success", `SL/TP Updated — #${pos.index}`, `SL: ${slInput || "none"} / TP: ${tpInput || "none"}`);
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Failed to set SL/TP" });
      addNotification("error", "SL/TP Update Failed", e?.message ?? "Failed to set SL/TP");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMargin() {
    if (!publicKey || !anchorWallet) return;
    const amt = parseFloat(marginInput);
    if (!amt || amt <= 0) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      await (program.methods as any)
        .addMargin(pos.index, new BN(Math.round(amt * 1e6)))
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          marginAccount: marginPda,
        })
        .rpc();
      setTxStatus({ type: "success", msg: `+$${amt.toFixed(2)} margin added` });
      addNotification("success", `Margin Added — #${pos.index}`, `+$${amt.toFixed(2)} USDC`);
      setMarginMode("idle");
      setMarginInput("");
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Add margin failed" });
      addNotification("error", "Add Margin Failed", e?.message ?? "Add margin failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveMargin() {
    if (!publicKey || !anchorWallet) return;
    const amt = parseFloat(marginInput);
    if (!amt || amt <= 0) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      await (program.methods as any)
        .removeMargin(pos.index, new BN(Math.round(amt * 1e6)))
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          marginAccount: marginPda,
          oracle: oracleAddress ? new PublicKey(oracleAddress) : ORACLE_ACCOUNT,
        })
        .rpc();
      setTxStatus({ type: "success", msg: `-$${amt.toFixed(2)} margin removed` });
      addNotification("info", `Margin Removed — #${pos.index}`, `-$${amt.toFixed(2)} USDC`);
      setMarginMode("idle");
      setMarginInput("");
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Remove margin failed" });
      addNotification("error", "Remove Margin Failed", e?.message ?? "Remove margin failed");
    } finally {
      setLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  const borderColor = isLong ? "border-l-long" : "border-l-short";

  return (
    <div className={`border border-border border-l-2 ${borderColor} bg-panel`}>
      {/* ── Header row ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <span
            className={`px-2 py-0.5 text-[11px] font-bold tracking-wider ${
              isLong
                ? "bg-long/15 text-long border border-long/30"
                : "bg-short/15 text-short border border-short/30"
            }`}
          >
            {pos.direction.toUpperCase()}
          </span>
          <span className="text-xs font-mono text-secondary">{pos.leverage}x</span>
          <span className="text-xs font-mono text-primary">${collateralUsdc.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2">
          {marginMode === "idle" && (
            <>
              <button
                onClick={() => { setMarginMode("add"); setMarginInput(""); }}
                disabled={loading || rawToUsdc(freeCollateral) <= 0}
                className="px-2.5 py-1 text-[10px] font-medium border border-border text-secondary hover:text-long hover:border-long/50 transition-colors disabled:opacity-40"
              >
                Add
              </button>
              <button
                onClick={() => { setMarginMode("remove"); setMarginInput(""); }}
                disabled={loading}
                className="px-2.5 py-1 text-[10px] font-medium border border-border text-secondary hover:text-short hover:border-short/50 transition-colors disabled:opacity-40"
              >
                Remove
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Main data ───────────────────────────────────────────────────── */}
      <div className="px-4 py-3 space-y-3">
        {/* Price row */}
        <div className="grid grid-cols-2 gap-x-4 text-xs font-mono">
          <div>
            <span className="text-secondary">Entry </span>
            <span className="text-primary">${entryPriceUsd.toFixed(2)}</span>
          </div>
          <div className="text-right">
            <span className="text-secondary">Current </span>
            <span className="text-primary">${currentPriceUsd.toFixed(2)}</span>
          </div>
        </div>

        {/* Size + PnL row */}
        <div className="grid grid-cols-2 gap-x-4 text-xs font-mono">
          <div>
            <span className="text-secondary">Size </span>
            <span className="text-primary">${notionalUsdc.toFixed(2)}</span>
          </div>
          <div className={`text-right ${pnlFlash}`}>
            <span className="text-secondary">PnL </span>
            <span className={isProfit ? "text-long" : "text-short"}>
              {isProfit ? "+" : ""}${pnlUsdc.toFixed(2)}{" "}
              <span className="text-[10px]">
                {isProfit ? "+" : ""}{pnlPct.toFixed(2)}%
              </span>
            </span>
          </div>
        </div>

        {/* Margin ratio bar */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-secondary">Margin ratio</span>
            <div className="flex items-center gap-1.5">
              <span className={`font-mono font-medium ${marginLabel}`}>{marginRatio.toFixed(0)}%</span>
            </div>
          </div>
          <div className="h-1.5 bg-border overflow-hidden rounded-full">
            <div
              className={`h-full transition-all duration-500 rounded-full ${marginColor}`}
              style={{ width: `${marginBarPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-secondary">
              Liq: <span className="text-short font-mono">${liqPrice.toFixed(2)}</span>
            </span>
            <div className="flex items-center gap-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${safetyDot}`} />
              <span className={marginLabel}>{safetyLabel}</span>
            </div>
          </div>
        </div>

        {/* SL/TP inline */}
        <div className="border border-border/50 bg-bg p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-secondary mb-1 block">
                Stop Loss {slPriceUsd ? "" : "(not set)"}
              </label>
              <input
                type="number"
                step="0.01"
                value={slInput}
                onChange={(e) => setSlInput(e.target.value)}
                placeholder={isLong ? `< ${entryPriceUsd.toFixed(2)}` : `> ${entryPriceUsd.toFixed(2)}`}
                className={`w-full bg-transparent border px-2 py-1.5 text-xs font-mono text-primary outline-none placeholder:text-secondary/30 ${
                  slVal > 0 && !slValid ? "border-short" : "border-border focus:border-secondary"
                }`}
              />
              {slVal > 0 && !slValid && (
                <div className="text-[9px] text-short mt-0.5">
                  {isLong ? "Must be below entry" : "Must be above entry"}
                </div>
              )}
              {slEstPnl !== null && slValid && (
                <div className={`text-[9px] mt-0.5 font-mono ${slEstPnl >= 0 ? "text-long" : "text-short"}`}>
                  Est: {slEstPnl >= 0 ? "+" : ""}${slEstPnl.toFixed(2)}
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] text-secondary mb-1 block">
                Take Profit {tpPriceUsd ? "" : "(not set)"}
              </label>
              <input
                type="number"
                step="0.01"
                value={tpInput}
                onChange={(e) => setTpInput(e.target.value)}
                placeholder={isLong ? `> ${entryPriceUsd.toFixed(2)}` : `< ${entryPriceUsd.toFixed(2)}`}
                className={`w-full bg-transparent border px-2 py-1.5 text-xs font-mono text-primary outline-none placeholder:text-secondary/30 ${
                  tpVal > 0 && !tpValid ? "border-short" : "border-border focus:border-secondary"
                }`}
              />
              {tpVal > 0 && !tpValid && (
                <div className="text-[9px] text-short mt-0.5">
                  {isLong ? "Must be above entry" : "Must be below entry"}
                </div>
              )}
              {tpEstPnl !== null && tpValid && (
                <div className={`text-[9px] mt-0.5 font-mono ${tpEstPnl >= 0 ? "text-long" : "text-short"}`}>
                  Est: {tpEstPnl >= 0 ? "+" : ""}${tpEstPnl.toFixed(2)}
                </div>
              )}
            </div>
          </div>
          {(slInput || tpInput) && (slValid && tpValid) && (
            <button
              onClick={handleSetSlTp}
              disabled={loading || (!slInput && !tpInput)}
              className="w-full py-1.5 text-[11px] font-bold border border-long/50 text-long hover:bg-long/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Confirming..." : "Set SL/TP"}
            </button>
          )}
        </div>

        {/* Funding */}
        <div className="grid grid-cols-3 gap-2 text-[10px] md:text-[11px] font-mono">
          <div>
            <div className="text-secondary mb-0.5">Funding accrued</div>
            <div className={hoursOpen > 0 ? "text-short" : "text-secondary"}>
              {hoursOpen > 0 ? `-$${fundingAccrued.toFixed(4)}` : "< 1h"}
            </div>
          </div>
          <div>
            <div className="text-secondary mb-0.5">Rate</div>
            <div className="text-primary">{fundingRatePct.toFixed(4)}%/hr</div>
          </div>
          <div>
            <div className="text-secondary mb-0.5">Est 24h</div>
            <div className="text-short">-${funding24hEst.toFixed(4)}</div>
          </div>
        </div>

        {/* Time open */}
        <div className="flex justify-between text-[10px] md:text-[11px] text-secondary">
          <span>Time open: <span className="text-primary font-mono">{timeStr}</span></span>
          <span>Oracle: <span className={oracle.isStale ? "text-short" : "text-long"}>{oracle.isStale ? "STALE" : "LIVE"}</span></span>
        </div>
      </div>

      {/* ── Margin add/remove panel ─────────────────────────────────────── */}
      {marginMode !== "idle" && (
        <div className="border-t border-border px-4 py-3 bg-bg space-y-2.5">
          <div className="flex justify-between text-xs text-secondary">
            <span>{marginMode === "add" ? "Add Margin" : "Remove Margin"}</span>
            <span
              className="cursor-pointer hover:text-primary"
              onClick={() => {
                if (marginMode === "add") setMarginInput(rawToUsdc(freeCollateral).toFixed(2));
                else setMarginInput(rawToUsdc(pos.collateral).toFixed(2));
              }}
            >
              Max: ${marginMode === "add" ? rawToUsdc(freeCollateral).toFixed(2) : rawToUsdc(pos.collateral).toFixed(2)}
            </span>
          </div>
          <input
            type="number"
            step="0.01"
            value={marginInput}
            onChange={(e) => setMarginInput(e.target.value)}
            placeholder="0.00"
            className="w-full bg-transparent border border-border px-3 py-2 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
          />
          {marginInputAmt > 0 && (
            <div className="flex justify-between text-xs text-secondary">
              <span>Margin ratio</span>
              <span>
                <span className="text-primary">{marginRatio.toFixed(1)}%</span>
                <span className="mx-1">→</span>
                <span className={newMarginRatio < 15 ? "text-short" : newMarginRatio < 20 ? "text-accent" : "text-long"}>
                  {newMarginRatio.toFixed(1)}%
                </span>
              </span>
            </div>
          )}
          {removeMarginWarning && (
            <div className="text-[10px] text-accent border border-accent/30 bg-accent/10 px-2 py-1.5">
              Warning: Margin ratio will drop below 20%
            </div>
          )}
          {removeMarginBlocked && (
            <div className="text-[10px] text-short border border-short/30 bg-short/10 px-2 py-1.5">
              Cannot remove — margin ratio would drop below 15%
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={marginMode === "add" ? handleAddMargin : handleRemoveMargin}
              disabled={loading || marginInputAmt <= 0 || (marginMode === "remove" && removeMarginBlocked)}
              className={`flex-1 py-2 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                marginMode === "add"
                  ? "border border-long text-long hover:bg-long/10"
                  : "border border-short text-short hover:bg-short/10"
              }`}
            >
              {loading ? "Confirming..." : marginMode === "add" ? "Add" : "Remove"}
            </button>
            <button
              onClick={() => { setMarginMode("idle"); setMarginInput(""); }}
              disabled={loading}
              className="px-4 py-2 text-xs border border-border text-secondary hover:text-primary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── TX status ───────────────────────────────────────────────────── */}
      {txStatus && (
        <div
          className={`mx-4 mb-3 text-xs px-3 py-2 border font-mono ${
            txStatus.type === "success"
              ? "border-long text-long bg-long/10"
              : "border-short text-short bg-short/10"
          }`}
        >
          {txStatus.msg}
        </div>
      )}

      {/* ── Close section ───────────────────────────────────────────────── */}
      <div className="border-t border-border px-4 py-3">
        {!confirmClose ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmClose(true)}
              disabled={loading || oracle.isStale}
              className="flex-1 py-2.5 text-xs font-bold border border-short/60 text-short hover:bg-short/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {oracle.isStale ? "Oracle Stale" : "Close Position"}
            </button>
            <button
              disabled
              className="px-3 py-2.5 text-[10px] border border-border text-secondary/40 cursor-not-allowed"
              title="Partial close coming soon"
            >
              50%
            </button>
            <button
              disabled
              className="px-3 py-2.5 text-[10px] border border-border text-secondary/40 cursor-not-allowed"
              title="Partial close coming soon"
            >
              25%
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-secondary font-mono bg-bg border border-border p-2.5 space-y-1">
              <div className="flex justify-between">
                <span>Close at</span>
                <span className="text-primary">${currentPriceUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>PnL</span>
                <span className={isProfit ? "text-long" : "text-short"}>
                  {isProfit ? "+" : ""}${pnlUsdc.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Close fee</span>
                <span className="text-primary">-${closeFeeUsdc.toFixed(4)}</span>
              </div>
              {hoursOpen > 0 && (
                <div className="flex justify-between">
                  <span>Funding owed</span>
                  <span className="text-short">-${fundingAccrued.toFixed(4)}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleClose}
                disabled={loading}
                className="flex-1 py-2.5 text-xs font-bold bg-short text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? "Confirming..." : "Confirm Close"}
              </button>
              <button
                onClick={() => setConfirmClose(false)}
                disabled={loading}
                className="px-4 py-2.5 text-xs border border-border text-secondary hover:text-primary transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
