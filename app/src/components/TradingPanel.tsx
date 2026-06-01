"use client";

import { useState, useMemo } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, getAccount } from "@solana/spl-token";
import BN from "bn.js";

import { getProgram } from "@/lib/program";
import { useNotifications } from "@/providers/NotificationProvider";
import { incrementTradeCount } from "@/components/SaveWalletSheet";
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
  formatPrice,
  usdcToRaw,
  rawToUsdc,
  calc24hFunding,
  calcSkewRate,
  calcLiqPriceLong,
  calcLiqPriceShort,
  bpsToPercent,
} from "@/lib/utils";
import { OracleData } from "@/hooks/useOracle";
import { ProtocolStateData } from "@/hooks/useProtocolState";
import { MarginAccountData } from "@/hooks/useMarginAccount";

type Props = {
  oracle: OracleData;
  protocol: ProtocolStateData;
  margin: MarginAccountData;
  onRefresh: () => void;
};

type Side = "Long" | "Short";

async function ensureAta(
  connection: any,
  payer: PublicKey,
  mint: PublicKey,
  owner: PublicKey
): Promise<{ ata: PublicKey; needsCreate: boolean }> {
  const ata = await getAssociatedTokenAddress(mint, owner);
  try {
    await getAccount(connection, ata);
    return { ata, needsCreate: false };
  } catch {
    return { ata, needsCreate: true };
  }
}

export function TradingPanel({ oracle, protocol, margin, onRefresh }: Props) {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const anchorWallet = useAnchorWallet();
  const { addNotification } = useNotifications();

  const [side, setSide] = useState<Side>("Long");
  const [collateralInput, setCollateralInput] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [slInput, setSlInput] = useState("");
  const [tpInput, setTpInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const collateralUsdc = parseFloat(collateralInput) || 0;
  const collateralRaw = usdcToRaw(collateralUsdc);
  const currentPriceUsd = rawToPrice(oracle.price);

  const positionSizeUsdc = collateralUsdc * leverage;
  const entryPriceUsd = currentPriceUsd;
  const openFeeUsdc = rawToUsdc(Math.floor((collateralRaw * protocol.feeBps) / 10_000));
  const liqPrice =
    side === "Long"
      ? calcLiqPriceLong(oracle.price, leverage)
      : calcLiqPriceShort(oracle.price, leverage);

  const skewRate = calcSkewRate(
    protocol.totalLongExposure,
    protocol.totalShortExposure,
    protocol.skewFactor
  );
  const funding24hRaw = calc24hFunding(
    collateralRaw * leverage,
    protocol.baseFundingRatePerHour,
    skewRate
  );
  const funding24hUsdc = rawToUsdc(funding24hRaw);

  const maxProfitUsdc = collateralUsdc * (protocol.profitCapBps / 10_000);
  const minPositionUsdc = rawToUsdc(protocol.minPositionSize);
  const marginCollateralUsdc = rawToUsdc(margin.collateral);

  const positionCount = margin.positions.length;
  const maxPositions = 5;
  const slotsAvailable = positionCount < maxPositions;

  const canOpen =
    connected &&
    slotsAvailable &&
    collateralUsdc >= minPositionUsdc &&
    collateralUsdc <= marginCollateralUsdc;

  const statusMsg = !connected
    ? "Connect wallet to trade"
    : !slotsAvailable
    ? `All ${maxPositions} position slots full`
    : collateralUsdc < minPositionUsdc && collateralUsdc > 0
    ? `Min position: $${minPositionUsdc.toFixed(2)} USDC`
    : collateralUsdc > marginCollateralUsdc && collateralUsdc > 0
    ? `Insufficient margin (have $${marginCollateralUsdc.toFixed(2)})`
    : positionCount > 0
    ? `${positionCount}/${maxPositions} positions open`
    : null;

  async function handleMintUsdc() {
    if (!publicKey || !anchorWallet) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const { ata, needsCreate } = await ensureAta(
        connection,
        publicKey,
        USDC_MINT,
        publicKey
      );

      const txBuilder = (program.methods as any).mintDevnetUsdc().accounts({
        user: publicKey,
        protocolState: PROTOCOL_STATE,
        usdcMint: USDC_MINT,
        userTokenAccount: ata,
        tokenProgram: TOKEN_PROGRAM_ID,
      });

      if (needsCreate) {
        const createIx = createAssociatedTokenAccountInstruction(
          publicKey,
          ata,
          publicKey,
          USDC_MINT
        );
        await txBuilder.preInstructions([createIx]).rpc();
      } else {
        await txBuilder.rpc();
      }
      setTxStatus({ type: "success", msg: "Minted 1,000 devnet USDC!" });
      addNotification("success", "USDC Minted", "1,000 devnet USDC added to your wallet");
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Transaction failed" });
      addNotification("error", "Mint Failed", e?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseMarginAccount() {
    if (!publicKey || !anchorWallet) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      await (program.methods as any).closeMarginAccount().accounts({
        user: publicKey,
        marginAccount: marginPda,
        systemProgram: SystemProgram.programId,
      }).rpc();
      setTxStatus({ type: "success", msg: "Old account closed! You can now deposit fresh collateral." });
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Failed to close account" });
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenPosition() {
    if (!publicKey || !anchorWallet || !canOpen) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      const { ata, needsCreate } = await ensureAta(
        connection,
        publicKey,
        USDC_MINT,
        publicKey
      );

      // Direction as Anchor enum
      const direction = side === "Long" ? { long: {} } : { short: {} };
      const slVal = slInput ? new BN(Math.round(parseFloat(slInput) * 1_000_000)) : null;
      const tpVal = tpInput ? new BN(Math.round(parseFloat(tpInput) * 1_000_000)) : null;

      const txBuilder = (program.methods as any)
        .openPosition(direction, new BN(collateralRaw), leverage, slVal, tpVal)
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          marginAccount: marginPda,
          oracle: ORACLE_ACCOUNT,
          feeVault: FEE_VAULT,
          insuranceFund: INSURANCE_FUND,
          tokenProgram: TOKEN_PROGRAM_ID,
        });

      await txBuilder.rpc();
      setTxStatus({
        type: "success",
        msg: `${side} position opened at $${entryPriceUsd.toFixed(2)}`,
      });
      incrementTradeCount();
      addNotification(
        "success",
        `${side} Position Opened`,
        `$${positionSizeUsdc.toFixed(2)} at $${entryPriceUsd.toFixed(2)} (${leverage}x)`
      );
      setCollateralInput("");
      setSlInput("");
      setTpInput("");
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Transaction failed" });
      addNotification("error", "Open Position Failed", e?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-border bg-panel p-4 md:p-6 space-y-4 md:space-y-5">
      {/* Migration notice for old accounts */}
      {margin.error && connected && (
        <div className="border border-short bg-short/10 p-4 space-y-3">
          <p className="text-xs text-short font-medium">
            Your margin account uses an old format and needs to be reset for multi-position support.
          </p>
          <button
            onClick={handleCloseMarginAccount}
            disabled={loading}
            className="w-full py-2 text-xs font-bold border border-short text-short hover:bg-short/20 transition-colors disabled:opacity-50"
          >
            {loading ? "Closing..." : "Reset Margin Account"}
          </button>
        </div>
      )}

      {/* Long / Short toggle */}
      <div className="flex">
        {(["Long", "Short"] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`flex-1 py-3 md:py-2.5 text-sm font-bold tracking-wide transition-all rounded-none ${
              side === s
                ? s === "Long"
                  ? "bg-long text-black"
                  : "bg-short text-white"
                : "border border-border text-secondary hover:text-primary"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Collateral input */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-secondary">
          <span>Collateral (USDC)</span>
          <span
            className="cursor-pointer hover:text-primary"
            onClick={() =>
              setCollateralInput(marginCollateralUsdc.toFixed(2))
            }
          >
            Max: ${marginCollateralUsdc.toFixed(2)}
          </span>
        </div>
        <div className="flex border border-border focus-within:border-secondary">
          <input
            type="number"
            min="0"
            step="1"
            value={collateralInput}
            onChange={(e) => setCollateralInput(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40"
          />
          <span className="px-3 py-2.5 text-xs text-secondary bg-bg border-l border-border flex items-center">
            USDC
          </span>
        </div>
      </div>

      {/* Leverage slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-secondary">
          <span>Leverage</span>
          <span className="font-mono text-primary font-bold">{leverage}x</span>
        </div>
        <input
          type="range"
          min="1"
          max="10"
          step="1"
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] md:text-xs text-secondary font-mono">
          {[1, 2, 3, 5, 10].map((v) => (
            <span
              key={v}
              onClick={() => setLeverage(v)}
              className={`cursor-pointer py-1 px-1 ${v === leverage ? "text-primary font-bold" : ""}`}
            >
              {v}x
            </span>
          ))}
        </div>
        <div className="hidden md:flex justify-between text-xs text-secondary font-mono">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
            <span
              key={v}
              onClick={() => setLeverage(v)}
              className={`cursor-pointer ${v === leverage ? "text-primary" : ""}`}
            >
              {v}x
            </span>
          ))}
        </div>
      </div>

      {/* Optional SL/TP */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-secondary">Stop Loss (optional)</label>
          <input
            type="number"
            step="0.01"
            value={slInput}
            onChange={(e) => setSlInput(e.target.value)}
            placeholder={side === "Long" ? "Below entry" : "Above entry"}
            className="w-full bg-transparent border border-border px-3 py-2 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-secondary">Take Profit (optional)</label>
          <input
            type="number"
            step="0.01"
            value={tpInput}
            onChange={(e) => setTpInput(e.target.value)}
            placeholder={side === "Long" ? "Above entry" : "Below entry"}
            className="w-full bg-transparent border border-border px-3 py-2 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
          />
        </div>
      </div>

      {/* Calculated fields */}
      <div className="border border-border p-3 md:p-4 space-y-2.5 bg-bg text-xs">
        <Row label="Position Size" value={`$${positionSizeUsdc.toFixed(2)}`} mono />
        <Row label="Entry Price" value={`$${entryPriceUsd.toFixed(2)}`} mono />
        <Row
          label="Liquidation Price"
          value={collateralUsdc > 0 ? `$${liqPrice.toFixed(2)}` : "—"}
          mono
          danger={collateralUsdc > 0}
        />
        <Row label="Open Fee (2%)" value={`$${openFeeUsdc.toFixed(4)}`} mono />
        <Row
          label="Est. Funding (24h)"
          value={
            collateralUsdc > 0
              ? `$${funding24hUsdc.toFixed(4)}`
              : "—"
          }
          mono
        />
        <Row
          label="Max Profit (500%)"
          value={
            collateralUsdc > 0 ? `$${maxProfitUsdc.toFixed(2)}` : "—"
          }
          mono
          positive
        />
      </div>

      {/* Status message */}
      {statusMsg && (
        <p className="text-xs text-secondary text-center">{statusMsg}</p>
      )}

      {/* Tx result */}
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

      {/* Open Position button */}
      <button
        onClick={handleOpenPosition}
        disabled={!canOpen || loading}
        className={`w-full py-3.5 md:py-3 text-sm font-bold tracking-wide transition-all ${
          canOpen && !loading
            ? side === "Long"
              ? "bg-long text-black hover:opacity-90"
              : "bg-short text-white hover:opacity-90"
            : "bg-border text-secondary cursor-not-allowed"
        }`}
      >
        {loading ? "Confirming..." : `Open ${side}`}
      </button>

    </div>
  );
}

function Row({
  label,
  value,
  mono,
  danger,
  positive,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-secondary">{label}</span>
      <span
        className={`${mono ? "font-mono" : ""} ${
          danger ? "text-short" : positive ? "text-long" : "text-primary"
        } font-medium`}
      >
        {value}
      </span>
    </div>
  );
}
