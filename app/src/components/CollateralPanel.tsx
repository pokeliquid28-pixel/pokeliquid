"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import BN from "bn.js";

import { getProgram } from "@/lib/program";
import {
  PROTOCOL_STATE,
  FEE_VAULT,
  LIQUIDITY_POOL,
  USDC_MINT,
  getMarginAccountPDA,
} from "@/lib/addresses";
import { rawToUsdc, usdcToRaw } from "@/lib/utils";
import { MarginAccountData } from "@/hooks/useMarginAccount";

type Props = {
  margin: MarginAccountData;
  onRefresh: () => void;
};

type Mode = "idle" | "deposit" | "withdraw";

export function CollateralPanel({ margin, onRefresh }: Props) {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [mode, setMode] = useState<Mode>("idle");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletBalanceRaw, setWalletBalanceRaw] = useState<number>(0);

  // Fetch wallet USDC balance
  useEffect(() => {
    if (!publicKey) { setWalletBalance(null); setWalletBalanceRaw(0); return; }

    let cancelled = false;
    const fetchBalance = async () => {
      try {
        const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const acc = await getAccount(connection, ata);
        if (!cancelled) {
          const raw = Number(acc.amount);
          setWalletBalanceRaw(raw);
          setWalletBalance(raw / 1e6);
        }
      } catch {
        // Don't overwrite a known balance on transient RPC errors
        if (!cancelled) setWalletBalance((prev) => prev ?? 0);
      }
    };
    fetchBalance();
    const id = setInterval(fetchBalance, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connection, publicKey]);

  if (!connected) return null;

  const freeCollateral = rawToUsdc(margin.collateral);
  const lockedCollateral = margin.positions.reduce((sum, p) => sum + rawToUsdc(p.collateral), 0);
  const totalCollateral = freeCollateral + lockedCollateral;

  const inputUsdc = parseFloat(amount) || 0;

  async function handleDeposit() {
    if (!publicKey || !anchorWallet || inputUsdc <= 0) return;
    setLoading(true);
    setTxStatus(null);
    let actualRaw = 0;
    let finalAmount = 0;
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);

      // Re-fetch actual balance right before deposit
      try {
        const acc = await getAccount(connection, ata, "confirmed");
        actualRaw = Number(acc.amount);
      } catch {
        setTxStatus({ type: "error", msg: "No USDC token account found. Swap SOL → USDC first." });
        setLoading(false);
        return;
      }

      const depositRaw = usdcToRaw(inputUsdc);
      // Always cap to actual on-chain balance
      finalAmount = Math.min(depositRaw, actualRaw);
      if (finalAmount <= 0) {
        setTxStatus({ type: "error", msg: `Insufficient USDC. Have ${(actualRaw / 1e6).toFixed(6)} on-chain.` });
        setLoading(false);
        return;
      }

      await (program.methods as any)
        .depositCollateral(new BN(finalAmount))
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          marginAccount: marginPda,
          userTokenAccount: ata,
          feeVault: FEE_VAULT,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setTxStatus({ type: "success", msg: `Deposited $${(finalAmount / 1e6).toFixed(2)} USDC` });
      setAmount("");
      setMode("idle");
      // Immediately refresh wallet balance
      setWalletBalanceRaw((prev) => prev - finalAmount);
      setWalletBalance((prev) => prev !== null ? (prev - finalAmount / 1e6) : null);
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      const msg = e?.message ?? "Deposit failed";
      setTxStatus({ type: "error", msg: `[v2] Tried ${finalAmount} raw of ${actualRaw} available: ${msg}` });
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    if (!publicKey || !anchorWallet || inputUsdc <= 0) return;
    setLoading(true);
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const marginPda = getMarginAccountPDA(publicKey);
      const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);

      let needsCreate = false;
      try { await getAccount(connection, ata); } catch { needsCreate = true; }

      const txBuilder = (program.methods as any)
        .withdrawCollateral(new BN(usdcToRaw(inputUsdc)))
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          marginAccount: marginPda,
          userTokenAccount: ata,
          feeVault: FEE_VAULT,
          liquidityPool: LIQUIDITY_POOL,
          tokenProgram: TOKEN_PROGRAM_ID,
        });

      if (needsCreate) {
        const createIx = createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, USDC_MINT);
        await txBuilder.preInstructions([createIx]).rpc();
      } else {
        await txBuilder.rpc();
      }

      const withdrawnRaw = usdcToRaw(inputUsdc);
      setTxStatus({ type: "success", msg: `Withdrew $${inputUsdc.toFixed(2)} USDC` });
      setAmount("");
      setMode("idle");
      // Immediately update wallet balance
      setWalletBalanceRaw((prev) => prev + withdrawnRaw);
      setWalletBalance((prev) => prev !== null ? (prev + inputUsdc) : null);
      setTimeout(onRefresh, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Withdrawal failed" });
    } finally {
      setLoading(false);
    }
  }

  const withdrawWarning = mode === "withdraw" && inputUsdc > 0 && (freeCollateral - inputUsdc) < 5 && (freeCollateral - inputUsdc) >= 0;
  const withdrawBlocked = mode === "withdraw" && inputUsdc > freeCollateral;
  const depositBlocked = mode === "deposit" && walletBalance !== null && usdcToRaw(inputUsdc) > walletBalanceRaw;

  return (
    <div className="border border-border bg-panel p-4 md:p-5 space-y-3 md:space-y-4">
      <h2 className="text-[10px] md:text-xs font-semibold text-secondary uppercase tracking-wider">
        Collateral
      </h2>

      {/* Balances */}
      <div className="grid grid-cols-3 gap-2 md:gap-3 text-xs">
        <div className="bg-bg p-2 md:p-3 border border-border/50">
          <div className="text-secondary mb-1">Total</div>
          <div className="font-mono font-bold text-primary">${totalCollateral.toFixed(2)}</div>
        </div>
        <div className="bg-bg p-2 md:p-3 border border-border/50">
          <div className="text-secondary mb-1 flex items-center gap-1">
            Free
            <span className="text-[10px] text-secondary/60" title="Free collateral can be withdrawn or used to open new positions">?</span>
          </div>
          <div className="font-mono font-bold text-long text-[11px] md:text-xs">${freeCollateral.toFixed(2)}</div>
        </div>
        <div className="bg-bg p-2 md:p-3 border border-border/50">
          <div className="text-secondary mb-1 flex items-center gap-1">
            Locked
            <span className="text-[10px] text-secondary/60" title="Locked collateral is allocated to open positions and cannot be withdrawn directly">?</span>
          </div>
          <div className="font-mono font-bold text-secondary text-[11px] md:text-xs">${lockedCollateral.toFixed(2)}</div>
        </div>
      </div>

      {walletBalance !== null && (
        <div className="text-xs text-secondary font-mono">
          Wallet: ${walletBalance < 0.01 ? walletBalance.toFixed(6) : walletBalance.toFixed(2)} USDC
        </div>
      )}

      {/* Deposit / Withdraw buttons */}
      {mode === "idle" ? (
        <div className="flex gap-3">
          <button
            onClick={() => { setMode("deposit"); setAmount(""); setTxStatus(null); }}
            disabled={loading}
            className="flex-1 py-2.5 text-xs font-bold border border-long text-long hover:bg-long/10 transition-colors disabled:opacity-50"
          >
            Deposit
          </button>
          <button
            onClick={() => { setMode("withdraw"); setAmount(""); setTxStatus(null); }}
            disabled={loading || freeCollateral <= 0}
            className="flex-1 py-2.5 text-xs font-bold border border-short text-short hover:bg-short/10 transition-colors disabled:opacity-50"
          >
            Withdraw
          </button>
        </div>
      ) : (
        <div className="space-y-3 border border-border p-4 bg-bg">
          <div className="flex justify-between text-xs text-secondary">
            <span>{mode === "deposit" ? "Deposit USDC" : "Withdraw USDC"}</span>
            <span
              className="cursor-pointer hover:text-primary"
              onClick={() => {
                if (mode === "deposit" && walletBalance !== null) setAmount((walletBalanceRaw / 1e6).toFixed(6));
                if (mode === "withdraw") setAmount(freeCollateral.toFixed(2));
              }}
            >
              Max: ${mode === "deposit" ? (walletBalance?.toFixed(2) ?? "—") : freeCollateral.toFixed(2)}
            </span>
          </div>

          <div className="flex border border-border focus-within:border-secondary">
            <input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent px-3 py-2 text-sm font-mono text-primary outline-none placeholder:text-secondary/40"
            />
            <span className="px-3 py-2 text-xs text-secondary bg-panel border-l border-border flex items-center">
              USDC
            </span>
          </div>

          {withdrawWarning && (
            <div className="text-xs text-accent border border-accent/30 bg-accent/10 px-3 py-2">
              Warning: This will leave less than $5 free collateral
            </div>
          )}

          {withdrawBlocked && (
            <div className="text-xs text-short border border-short/30 bg-short/10 px-3 py-2">
              Insufficient free collateral (max ${freeCollateral.toFixed(2)})
            </div>
          )}

          {depositBlocked && (
            <div className="text-xs text-short border border-short/30 bg-short/10 px-3 py-2">
              Insufficient wallet balance (have ${walletBalance?.toFixed(2)})
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={mode === "deposit" ? handleDeposit : handleWithdraw}
              disabled={loading || inputUsdc <= 0 || (mode === "withdraw" && withdrawBlocked) || (mode === "deposit" && !!depositBlocked)}
              className={`flex-1 py-2.5 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                mode === "deposit"
                  ? "border border-long text-long hover:bg-long/10"
                  : "border border-short text-short hover:bg-short/10"
              }`}
            >
              {loading ? "Confirming..." : mode === "deposit" ? "Deposit" : "Withdraw"}
            </button>
            <button
              onClick={() => { setMode("idle"); setAmount(""); }}
              disabled={loading}
              className="px-4 py-2.5 text-xs border border-border text-secondary hover:text-primary transition-colors disabled:opacity-50"
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
    </div>
  );
}
