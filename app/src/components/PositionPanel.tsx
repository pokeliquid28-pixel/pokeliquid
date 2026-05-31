"use client";

import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";

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
  timeOpen,
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
};

export function PositionPanel({ oracle, margin, protocol, onRefresh }: Props) {
  if (margin.positions.length === 0) return null;

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
        />
      ))}
    </div>
  );
}

function PositionCard({
  pos,
  oracle,
  protocol,
  freeCollateral,
  onRefresh,
}: {
  pos: Position;
  oracle: OracleData;
  protocol: ProtocolStateData;
  freeCollateral: number;
  onRefresh: () => void;
}) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [showSlTp, setShowSlTp] = useState(false);
  const [slInput, setSlInput] = useState(pos.slPrice ? rawToPrice(pos.slPrice).toFixed(2) : "");
  const [tpInput, setTpInput] = useState(pos.tpPrice ? rawToPrice(pos.tpPrice).toFixed(2) : "");
  const [marginMode, setMarginMode] = useState<"idle" | "add" | "remove">("idle");
  const [marginInput, setMarginInput] = useState("");

  const currentPriceRaw = oracle.price;
  const entryPriceUsd = rawToPrice(pos.entryPrice);
  const currentPriceUsd = rawToPrice(currentPriceRaw);

  const pnlRaw = calcPnl(pos.direction, currentPriceRaw, pos.entryPrice, pos.notional);
  const pnlUsdc = rawToUsdc(pnlRaw);
  const isProfit = pnlUsdc >= 0;

  const liqPrice =
    pos.direction === "Long"
      ? calcLiqPriceLong(pos.entryPrice, pos.leverage)
      : calcLiqPriceShort(pos.entryPrice, pos.leverage);

  // Accrued funding
  const nowSec = Math.floor(Date.now() / 1000);
  const hoursOpen = Math.max(0, Math.floor((nowSec - pos.openTimestamp) / 3600));
  const totalOI = protocol.totalLongExposure + protocol.totalShortExposure;
  const skewRate = totalOI > 0
    ? Math.floor(Math.abs(protocol.totalLongExposure - protocol.totalShortExposure) * protocol.skewFactor / totalOI)
    : 0;
  const onMajority = pos.direction === "Long"
    ? protocol.totalLongExposure >= protocol.totalShortExposure
    : protocol.totalShortExposure >= protocol.totalLongExposure;
  const hourlyRate = onMajority
    ? protocol.baseFundingRatePerHour + skewRate
    : Math.max(0, protocol.baseFundingRatePerHour - skewRate);
  const fundingOwedRaw = Math.floor(pos.notional * hourlyRate * hoursOpen / FUNDING_RATE_SCALE);
  const fundingOwedUsdc = rawToUsdc(fundingOwedRaw);

  // Distance to liquidation
  const distToLiq =
    pos.direction === "Long"
      ? ((currentPriceUsd - liqPrice) / currentPriceUsd) * 100
      : ((liqPrice - currentPriceUsd) / currentPriceUsd) * 100;
  const pastLiquidation = distToLiq <= 0;
  const nearLiquidation = distToLiq < 15;
  const healthBarPct = Math.max(0, Math.min(distToLiq, 100));

  async function handleClose() {
    if (!publicKey || !anchorWallet) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);

      let needsCreate = false;
      try {
        await getAccount(connection, ata);
      } catch {
        needsCreate = true;
      }

      const txBuilder = (program.methods as any).closePosition(pos.index).accounts({
        user: publicKey,
        protocolState: PROTOCOL_STATE,
        marginAccount: marginPda,
        oracle: ORACLE_ACCOUNT,
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

      const slVal = slInput ? new BN(Math.round(parseFloat(slInput) * 1_000_000)) : null;
      const tpVal = tpInput ? new BN(Math.round(parseFloat(tpInput) * 1_000_000)) : null;

      await (program.methods as any)
        .setSlTp(pos.index, slVal, tpVal)
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          marginAccount: marginPda,
          oracle: ORACLE_ACCOUNT,
        })
        .rpc();

      setTxStatus({ type: "success", msg: `SL/TP updated for position #${pos.index}` });
      addNotification("success", `SL/TP Updated — #${pos.index}`, `SL: ${slInput || "none"} / TP: ${tpInput || "none"}`);
      setShowSlTp(false);
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
      setTxStatus({ type: "success", msg: `Added $${amt.toFixed(2)} margin to position #${pos.index}` });
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
          oracle: ORACLE_ACCOUNT,
        })
        .rpc();
      setTxStatus({ type: "success", msg: `Removed $${amt.toFixed(2)} margin from position #${pos.index}` });
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

  // Margin ratio calculations
  const currentMarginRatio = pos.notional > 0 ? (pos.collateral / pos.notional) * 100 : 100;
  const marginInputAmt = parseFloat(marginInput) || 0;
  const marginInputRaw = marginInputAmt * 1e6;
  const newCollateral = marginMode === "add"
    ? pos.collateral + marginInputRaw
    : pos.collateral - marginInputRaw;
  const newMarginRatio = pos.notional > 0 ? (newCollateral / pos.notional) * 100 : 100;
  const removeMarginWarning = marginMode === "remove" && newMarginRatio < 20 && newMarginRatio >= 15;
  const removeMarginBlocked = marginMode === "remove" && newMarginRatio < 15;

  // SL/TP proximity warning
  const slPriceUsd = pos.slPrice ? rawToPrice(pos.slPrice) : null;
  const tpPriceUsd = pos.tpPrice ? rawToPrice(pos.tpPrice) : null;
  const nearSl = slPriceUsd !== null && Math.abs(currentPriceUsd - slPriceUsd) / currentPriceUsd < 0.05;

  return (
    <div className="border border-border bg-panel p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-secondary uppercase tracking-wider">
          Position #{pos.index}
        </h2>
        <div className="flex items-center gap-3">
          <span
            className={`px-2.5 py-0.5 text-xs font-bold tracking-wider ${
              pos.direction === "Long"
                ? "bg-long/20 text-long border border-long/30"
                : "bg-short/20 text-short border border-short/30"
            }`}
          >
            {pos.direction}
          </span>
          <span className="text-xs font-mono text-secondary">{pos.leverage}x</span>
        </div>
      </div>

      {pastLiquidation ? (
        <div className="border border-short bg-short/20 px-3 py-2 text-xs text-short font-bold">
          PAST LIQUIDATION — Close this position immediately
        </div>
      ) : nearLiquidation ? (
        <div className="border border-short bg-short/10 px-3 py-2 text-xs text-short font-medium">
          WARNING: Position within {distToLiq.toFixed(1)}% of liquidation price
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:gap-3 text-xs">
        <Stat label="Entry Price" value={`$${entryPriceUsd.toFixed(2)}`} />
        <Stat label="Current Price" value={`$${currentPriceUsd.toFixed(2)}`} />
        <Stat
          label="Unrealized PnL"
          value={`${isProfit ? "+" : ""}$${pnlUsdc.toFixed(4)}`}
          color={isProfit ? "text-long" : "text-short"}
        />
        <Stat label="Liq. Price" value={`$${liqPrice.toFixed(2)}`} color="text-short" />
        <Stat label="Collateral" value={`$${rawToUsdc(pos.collateral).toFixed(2)}`} />
        <Stat label="Notional" value={`$${rawToUsdc(pos.notional).toFixed(2)}`} />
        <Stat label="Time Open" value={timeOpen(pos.openTimestamp)} />
        <Stat label="Stop Loss" value={slPriceUsd ? `$${slPriceUsd.toFixed(2)}` : "Not set"} color={nearSl ? "text-short" : slPriceUsd ? "text-primary" : "text-secondary"} />
        <Stat label="Take Profit" value={tpPriceUsd ? `$${tpPriceUsd.toFixed(2)}` : "Not set"} color={tpPriceUsd ? "text-long" : "text-secondary"} />
        <Stat label="Oracle Status" value={oracle.isStale ? "STALE" : "LIVE"} color={oracle.isStale ? "text-short" : "text-long"} />
        <Stat
          label={`Funding Owed (${hoursOpen}h)`}
          value={hoursOpen > 0 ? `-$${fundingOwedUsdc.toFixed(4)}` : "< 1h"}
          color={hoursOpen > 0 ? "text-short" : "text-secondary"}
        />
        <Stat
          label="Funding Rate/hr"
          value={`${((hourlyRate / FUNDING_RATE_SCALE) * 100).toFixed(4)}%`}
          color="text-secondary"
        />
      </div>

      {/* Margin health bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-secondary">
          <span>Margin health</span>
          <span className={pastLiquidation || nearLiquidation ? "text-short" : "text-long"}>
            {pastLiquidation
              ? "Past liquidation"
              : `${distToLiq.toFixed(1)}% from liquidation`}
          </span>
        </div>
        <div className="h-1.5 bg-border overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              pastLiquidation || nearLiquidation ? "bg-short" : healthBarPct < 30 ? "bg-yellow-400" : "bg-long"
            }`}
            style={{ width: `${healthBarPct.toFixed(1)}%` }}
          />
        </div>
      </div>

      {nearSl && (
        <div className="border border-yellow-500 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400 font-medium">
          WARNING: Price within 5% of stop-loss trigger
        </div>
      )}

      {/* SL/TP edit section */}
      <button
        onClick={() => setShowSlTp(!showSlTp)}
        className="w-full py-2 text-xs border border-border text-secondary hover:text-primary hover:border-secondary transition-colors"
      >
        {showSlTp ? "Hide SL/TP" : "Set SL/TP"}
      </button>

      {showSlTp && (
        <div className="border border-border p-4 space-y-3 bg-bg">
          <div className="space-y-1.5">
            <label className="text-xs text-secondary">
              Stop Loss {pos.direction === "Long" ? "(below entry)" : "(above entry)"}
            </label>
            <input
              type="number"
              step="0.01"
              value={slInput}
              onChange={(e) => setSlInput(e.target.value)}
              placeholder={pos.direction === "Long" ? `< $${entryPriceUsd.toFixed(2)}` : `> $${entryPriceUsd.toFixed(2)}`}
              className="w-full bg-transparent border border-border px-3 py-2 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-secondary">
              Take Profit {pos.direction === "Long" ? "(above entry)" : "(below entry)"}
            </label>
            <input
              type="number"
              step="0.01"
              value={tpInput}
              onChange={(e) => setTpInput(e.target.value)}
              placeholder={pos.direction === "Long" ? `> $${entryPriceUsd.toFixed(2)}` : `< $${entryPriceUsd.toFixed(2)}`}
              className="w-full bg-transparent border border-border px-3 py-2 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
            />
          </div>
          <button
            onClick={handleSetSlTp}
            disabled={loading || (!slInput && !tpInput)}
            className="w-full py-2 text-xs font-bold border border-long text-long hover:bg-long/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Confirming..." : "Update SL/TP"}
          </button>
        </div>
      )}

      {/* Add/Remove margin */}
      {marginMode === "idle" ? (
        <div className="flex gap-3">
          <button
            onClick={() => { setMarginMode("add"); setMarginInput(""); }}
            disabled={loading || rawToUsdc(freeCollateral) <= 0}
            className="flex-1 py-2 text-xs border border-long/50 text-long hover:bg-long/10 transition-colors disabled:opacity-50"
          >
            Add Margin
          </button>
          <button
            onClick={() => { setMarginMode("remove"); setMarginInput(""); }}
            disabled={loading}
            className="flex-1 py-2 text-xs border border-short/50 text-short hover:bg-short/10 transition-colors disabled:opacity-50"
          >
            Remove Margin
          </button>
        </div>
      ) : (
        <div className="border border-border p-4 space-y-3 bg-bg">
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
            <div className="text-xs text-secondary space-y-1">
              <div className="flex justify-between">
                <span>Margin ratio</span>
                <span>
                  <span className="text-primary">{currentMarginRatio.toFixed(1)}%</span>
                  <span className="mx-1">→</span>
                  <span className={newMarginRatio < 15 ? "text-short" : newMarginRatio < 20 ? "text-yellow-400" : "text-long"}>
                    {newMarginRatio.toFixed(1)}%
                  </span>
                </span>
              </div>
            </div>
          )}
          {removeMarginWarning && (
            <div className="text-xs text-yellow-400 border border-yellow-500/30 bg-yellow-500/10 px-3 py-2">
              Warning: Margin ratio will drop below 20%
            </div>
          )}
          {removeMarginBlocked && (
            <div className="text-xs text-short border border-short/30 bg-short/10 px-3 py-2">
              Cannot remove — margin ratio would drop below 15%
            </div>
          )}
          <div className="flex gap-3">
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

      {txStatus && (
        <div
          className={`text-xs px-3 py-2 border font-mono ${
            txStatus.type === "success"
              ? "border-long text-long bg-long/10"
              : "border-short text-short bg-short/10"
          }`}
        >
          {txStatus.msg}
        </div>
      )}

      <button
        onClick={handleClose}
        disabled={loading || oracle.isStale}
        className="w-full py-3.5 md:py-3 text-sm font-bold border border-short text-short hover:bg-short/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Confirming..." : oracle.isStale ? "Oracle Stale — Cannot Close" : `Close Position #${pos.index}`}
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-bg p-2.5 border border-border/50">
      <div className="text-secondary text-xs mb-1">{label}</div>
      <div className={`font-mono font-medium text-sm ${color ?? "text-primary"}`}>
        {value}
      </div>
    </div>
  );
}
