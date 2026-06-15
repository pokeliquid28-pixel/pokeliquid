"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { SystemProgram, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import BN from "bn.js";

import { getProgram } from "@/lib/program";
import {
  PROTOCOL_STATE,
  FEE_VAULT,
  INSURANCE_FUND,
  USDC_MINT,
  LIQUIDITY_POOL,
  LP_VAULT,
  getLpPositionPDA,
} from "@/lib/addresses";
import { rawToUsdc, usdcToRaw, bpsToPercent } from "@/lib/utils";
import { useProtocolState } from "@/hooks/useProtocolState";
import { useLiquidityPool } from "@/hooks/useLiquidityPool";
import { useLpPosition } from "@/hooks/useLpPosition";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { Skeleton } from "@/components/Skeleton";
import { AuthGuard } from "@/components/AuthGuard";

async function ensureAta(connection: any, payer: PublicKey, mint: PublicKey, owner: PublicKey) {
  const ata = await getAssociatedTokenAddress(mint, owner);
  try {
    await getAccount(connection, ata);
    return { ata, needsCreate: false };
  } catch {
    return { ata, needsCreate: true };
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-panel p-4 md:p-6">
      <h2 className="text-[10px] md:text-xs font-semibold text-secondary uppercase tracking-wider mb-4 md:mb-5">
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
      <span className="text-xs md:text-sm text-secondary">{label}</span>
      <span className={`text-xs md:text-sm ${mono ? "font-mono" : ""} text-primary`}>{value}</span>
    </div>
  );
}

export default function PoolPage() {
  return <AuthGuard><PoolContent /></AuthGuard>;
}

function PoolContent() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const anchorWallet = useAnchorWallet();
  const protocol = useProtocolState();
  const pool = useLiquidityPool();
  const lpPos = useLpPosition();
  const walletBalances = useWalletBalances();
  const refreshBalances = walletBalances.refresh;

  const [feeVaultBalance, setFeeVaultBalance] = useState<number | null>(null);
  const [insuranceBalance, setInsuranceBalance] = useState<number | null>(null);
  const [userCollateral, setUserCollateral] = useState<number | null>(null);
  const [blendedApr, setBlendedApr] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchVaultBalances = async () => {
      try {
        const [feeAcc, insAcc, protocolAcc] = await Promise.all([
          connection.getTokenAccountBalance(FEE_VAULT),
          connection.getTokenAccountBalance(INSURANCE_FUND),
          connection.getAccountInfo(PROTOCOL_STATE),
        ]);
        if (cancelled) return;
        setFeeVaultBalance(Number(feeAcc.value.amount));
        setInsuranceBalance(Number(insAcc.value.amount));
        if (protocolAcc?.data) {
          setUserCollateral(Number(protocolAcc.data.readBigUInt64LE(302)));
        }
      } catch {}
    };
    fetchVaultBalances();
    const id = setInterval(fetchVaultBalances, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connection]);

  // Fetch 7-day fee data for dynamic blended APR
  const poolTvl = rawToUsdc(pool.totalUsdc);
  useEffect(() => {
    if (pool.isLoading || poolTvl <= 0) return;
    let cancelled = false;
    const fetchApr = async () => {
      try {
        const dates: string[] = [];
        for (let i = 1; i <= 7; i++) {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - i);
          dates.push(d.toISOString().split("T")[0]);
        }
        const results = await Promise.all(
          dates.map((date) =>
            fetch(`/api/keeper/daily-volume?date=${date}`)
              .then((r) => r.json())
              .catch(() => null)
          )
        );
        if (cancelled) return;
        let totalFees7d = 0;
        let daysWithData = 0;
        for (const res of results) {
          if (!res) continue;
          // Support both formats: broken-down fees or single dailyFees
          const fees = (res.tradingFees ?? 0) + (res.fundingFees ?? 0) + (res.liquidationFees ?? 0) || (res.dailyFees ?? 0);
          if (fees > 0) daysWithData++;
          totalFees7d += fees;
        }
        // LP receives ~50% of trading fees (dominant component)
        const lpFees7d = totalFees7d * 0.50;
        const days = Math.max(daysWithData, 1);
        const dailyLpFees = lpFees7d / days;
        if (dailyLpFees > 0) {
          setBlendedApr((dailyLpFees / poolTvl) * 365 * 100);
        } else {
          setBlendedApr(0);
        }
      } catch {
        if (!cancelled) setBlendedApr(null);
      }
    };
    fetchApr();
    return () => { cancelled = true; };
  }, [pool.isLoading, poolTvl]);

  const [depositInput, setDepositInput] = useState("");
  const [withdrawSharesInput, setWithdrawSharesInput] = useState("");
  const [loading, setLoading] = useState<"deposit" | "withdraw" | "claim" | null>(null);
  const [txStatus, setTxStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Derived values
  const tvl = rawToUsdc(pool.totalUsdc);
  const sharePrice = pool.totalShares > 0 ? pool.totalUsdc / pool.totalShares : 1;
  const userShareValue = lpPos.shares * sharePrice;
  const userPoolPct = pool.totalShares > 0 ? (lpPos.shares / pool.totalShares) * 100 : 0;

  // Claimable fees: matches on-chain MasterChef logic
  // If acc_fee_per_share > 0 (post-upgrade), use: shares * accFeePerShare / 1e12 - rewardDebt
  // Otherwise legacy fallback: proportional share of unclaimed fees
  const claimable = pool.accFeePerShare > 0
    ? Math.max(0, Math.floor(lpPos.shares * pool.accFeePerShare / 1e12 - lpPos.rewardDebt))
    : pool.totalShares > 0
      ? Math.max(0, Math.floor((lpPos.shares / pool.totalShares) * (pool.accumulatedFees - pool.totalFeesClaimed)))
      : 0;

  // Dynamic blended APR from 7-day fee data (LP share only)
  const displayApr = blendedApr;

  // Preview calculations for deposit
  const depositAmount = parseFloat(depositInput) || 0;
  const depositRaw = usdcToRaw(depositAmount);
  const previewShares = pool.totalShares > 0 && pool.totalUsdc > 0
    ? Math.floor((depositRaw * pool.totalShares) / pool.totalUsdc)
    : depositRaw;
  const previewPoolPct = pool.totalShares > 0
    ? ((lpPos.shares + previewShares) / (pool.totalShares + previewShares)) * 100
    : depositRaw > 0 ? 100 : 0;

  // Preview for withdraw
  const withdrawShares = parseFloat(withdrawSharesInput) || 0;
  const withdrawUsdcValue = pool.totalShares > 0
    ? rawToUsdc(Math.floor((withdrawShares * pool.totalUsdc) / pool.totalShares))
    : 0;

  async function handleDeposit() {
    if (!publicKey || !anchorWallet) return;
    const amountRaw = usdcToRaw(parseFloat(depositInput) || 0);
    if (amountRaw <= 0) return;
    setLoading("deposit");
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const lpPositionPda = getLpPositionPDA(publicKey);
      const { ata, needsCreate } = await ensureAta(connection, publicKey, USDC_MINT, publicKey);

      // Cap to actual wallet balance
      let actualRaw = 0;
      try {
        const acc = await getAccount(connection, ata);
        actualRaw = Number(acc.amount);
      } catch {
        setTxStatus({ type: "error", msg: "No USDC token account found." });
        setLoading(null);
        return;
      }
      const finalAmount = Math.min(amountRaw, actualRaw);
      if (finalAmount <= 0) {
        setTxStatus({ type: "error", msg: `Insufficient USDC. Wallet has ${(actualRaw / 1e6).toFixed(6)}.` });
        setLoading(null);
        return;
      }

      const txBuilder = (program.methods as any)
        .lpDeposit(new BN(finalAmount))
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          liquidityPool: LIQUIDITY_POOL,
          lpPosition: lpPositionPda,
          userTokenAccount: ata,
          lpVault: LP_VAULT,
          feeVault: FEE_VAULT,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        });

      if (needsCreate) {
        const createIx = createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, USDC_MINT);
        await txBuilder.preInstructions([createIx]).rpc();
      } else {
        await txBuilder.rpc();
      }
      setTxStatus({ type: "success", msg: `Deposited $${depositInput} USDC into LP pool` });
      setDepositInput("");
      setTimeout(refreshBalances, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "LP deposit failed" });
    } finally {
      setLoading(null);
    }
  }

  async function handleWithdraw() {
    if (!publicKey || !anchorWallet) return;
    const shares = parseFloat(withdrawSharesInput) || 0;
    if (shares <= 0 || shares > lpPos.shares) return;
    setLoading("withdraw");
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const lpPositionPda = getLpPositionPDA(publicKey);
      const { ata, needsCreate } = await ensureAta(connection, publicKey, USDC_MINT, publicKey);

      const txBuilder = (program.methods as any)
        .lpWithdraw(new BN(shares))
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          liquidityPool: LIQUIDITY_POOL,
          lpPosition: lpPositionPda,
          userTokenAccount: ata,
          lpVault: LP_VAULT,
          feeVault: FEE_VAULT,
          tokenProgram: TOKEN_PROGRAM_ID,
        });

      if (needsCreate) {
        const createIx = createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, USDC_MINT);
        await txBuilder.preInstructions([createIx]).rpc();
      } else {
        await txBuilder.rpc();
      }
      setTxStatus({ type: "success", msg: `Withdrew ${shares} shares from LP pool` });
      setWithdrawSharesInput("");
      setTimeout(refreshBalances, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "LP withdraw failed" });
    } finally {
      setLoading(null);
    }
  }

  async function handleClaimFees() {
    if (!publicKey || !anchorWallet) return;
    if (claimable <= 0) return;
    setLoading("claim");
    setTxStatus(null);
    try {
      const program = getProgram(connection, anchorWallet);
      const lpPositionPda = getLpPositionPDA(publicKey);
      const { ata, needsCreate } = await ensureAta(connection, publicKey, USDC_MINT, publicKey);

      const txBuilder = (program.methods as any)
        .claimFees()
        .accounts({
          user: publicKey,
          protocolState: PROTOCOL_STATE,
          liquidityPool: LIQUIDITY_POOL,
          lpPosition: lpPositionPda,
          userTokenAccount: ata,
          feeVault: FEE_VAULT,
          tokenProgram: TOKEN_PROGRAM_ID,
        });

      if (needsCreate) {
        const createIx = createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, USDC_MINT);
        await txBuilder.preInstructions([createIx]).rpc();
      } else {
        await txBuilder.rpc();
      }
      setTxStatus({ type: "success", msg: `Claimed $${rawToUsdc(claimable).toFixed(2)} USDC in fees` });
      setTimeout(refreshBalances, 2000);
    } catch (e: any) {
      setTxStatus({ type: "error", msg: e?.message ?? "Claim fees failed" });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-primary">Liquidity Pool</h1>
        <p className="text-secondary text-xs md:text-sm mt-1">
          Provide liquidity and earn fees from trading, funding, and liquidations.
        </p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
        <StatCard
          label="Pool TVL"
          value={pool.isLoading ? "..." : `$${tvl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
        />
        <StatCard
          label="Accumulated Fees"
          value={pool.isLoading ? "..." : `$${rawToUsdc(pool.accumulatedFees).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
        />
        <StatCard
          label="APR (7d)"
          value={pool.isLoading || displayApr === null ? "..." : `${displayApr.toFixed(1)}%`}
          highlight={displayApr !== null && displayApr > 0}
        />
        <StatCard
          label="Your Share"
          value={!connected ? "—" : lpPos.isLoading ? "..." : `${userPoolPct.toFixed(2)}%`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left: Pool info + Your Position */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          {/* Your LP Position */}
          <Section title="Your LP Position">
            {!connected ? (
              <p className="text-secondary text-sm">Connect wallet to view</p>
            ) : lpPos.isLoading ? (
              <Skeleton height="h-20" />
            ) : !lpPos.exists ? (
              <p className="text-secondary text-sm">No LP position yet. Deposit USDC to start earning fees.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                <div>
                  <div className="text-[10px] md:text-xs text-secondary mb-1">Shares</div>
                  <div className="text-base md:text-lg font-mono font-bold text-primary">
                    {lpPos.shares.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] md:text-xs text-secondary mb-1">Value</div>
                  <div className="text-base md:text-lg font-mono font-bold text-primary">
                    ${rawToUsdc(userShareValue).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] md:text-xs text-secondary mb-1">Pool %</div>
                  <div className="text-base md:text-lg font-mono font-bold text-primary">
                    {userPoolPct.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-[10px] md:text-xs text-secondary mb-1">Fees Earned</div>
                  <div className="text-base md:text-lg font-mono font-bold text-long">
                    ${rawToUsdc(lpPos.feesClaimed + claimable).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            )}
          </Section>

          {/* Pool Stats */}
          <Section title="Pool Stats">
            {pool.isLoading ? (
              <Skeleton height="h-32" />
            ) : (
              <div className="space-y-0">
                <StatRow label="Total USDC" value={`$${tvl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} mono />
                <StatRow label="Total Shares" value={pool.totalShares.toLocaleString()} mono />
                <StatRow label="Share Price" value={`$${rawToUsdc(sharePrice).toFixed(6)}`} mono />
                <StatRow label="Accumulated Fees" value={`$${rawToUsdc(pool.accumulatedFees).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} mono />
                <StatRow label="APR (7d)" value={displayApr === null ? "..." : `${displayApr.toFixed(1)}%`} mono />
              </div>
            )}
          </Section>

          {/* LP Fee Breakdown */}
          <Section title="LP Fee Sources">
            <div className="space-y-0">
              <StatRow label="Trading Fees" value="50% of open & close fees" />
              <StatRow label="Funding Fees" value="70% of majority-side funding" />
              <StatRow label="Liquidations" value="44% of liquidated collateral" />
            </div>
            <div className="mt-3 text-[10px] text-secondary/60 leading-relaxed">
              All LP fees accumulate in the fee vault and are claimable proportional to your pool share.
            </div>
          </Section>

          {/* Protocol Open Interest */}
          <Section title="Open Interest">
            {protocol.isLoading ? (
              <Skeleton height="h-20" />
            ) : (
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                <div className="bg-bg border border-border p-3 md:p-4">
                  <div className="text-[10px] md:text-xs text-secondary mb-1">Total Long</div>
                  <div className="text-long font-mono font-semibold text-sm md:text-base">
                    ${rawToUsdc(protocol.totalLongExposure).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="bg-bg border border-border p-3 md:p-4">
                  <div className="text-[10px] md:text-xs text-secondary mb-1">Total Short</div>
                  <div className="text-short font-mono font-semibold text-sm md:text-base">
                    ${rawToUsdc(protocol.totalShortExposure).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
            )}
          </Section>

          {/* Protocol Vaults */}
          <Section title="Protocol Vaults">
            <div className="grid grid-cols-3 gap-3 md:gap-4 mb-4">
              <div className="bg-bg border border-border p-3 md:p-4">
                <div className="text-[10px] md:text-xs text-secondary mb-1">LP Vault</div>
                <div className="text-primary font-mono font-semibold text-sm md:text-base">
                  {pool.isLoading ? "..." : `$${tvl.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                </div>
              </div>
              <div className="bg-bg border border-border p-3 md:p-4">
                <div className="text-[10px] md:text-xs text-secondary mb-1">Fee Vault</div>
                <div className="text-primary font-mono font-semibold text-sm md:text-base">
                  {feeVaultBalance === null ? "..." : `$${rawToUsdc(feeVaultBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                </div>
              </div>
              <div className="bg-bg border border-border p-3 md:p-4">
                <div className="text-[10px] md:text-xs text-secondary mb-1">Insurance Fund</div>
                <div className="text-primary font-mono font-semibold text-sm md:text-base">
                  {insuranceBalance === null ? "..." : `$${rawToUsdc(insuranceBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                </div>
              </div>
            </div>
            {feeVaultBalance !== null && userCollateral !== null && !pool.isLoading && (
              <div className="space-y-0 mt-1">
                <div className="text-[10px] text-secondary/50 uppercase tracking-wider mb-1">Fee Vault Breakdown</div>
                <StatRow label="Deposited Collateral" value={`$${rawToUsdc(userCollateral).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} mono />
                <StatRow label="Unclaimed LP Fees" value={`$${rawToUsdc(Math.max(0, pool.accumulatedFees - pool.totalFeesClaimed)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} mono />
                <StatRow label="Protocol Revenue" value={`$${Math.max(0, rawToUsdc(feeVaultBalance) - rawToUsdc(userCollateral) - rawToUsdc(Math.max(0, pool.accumulatedFees - pool.totalFeesClaimed))).toLocaleString(undefined, { maximumFractionDigits: 2 })}`} mono />
              </div>
            )}
          </Section>
        </div>

        {/* Right: Deposit / Withdraw / Claim */}
        <div className="space-y-4 md:space-y-6">
          {/* Wallet info */}
          <Section title="Wallet">
            {!connected ? (
              <p className="text-secondary text-sm">Connect wallet</p>
            ) : (
              <div>
                <div className="text-xs text-secondary mb-1">USDC Balance</div>
                <div className="text-xl font-mono font-bold text-primary">
                  ${rawToUsdc(walletBalances.usdcRaw).toFixed(2)}
                </div>
              </div>
            )}
          </Section>

          {/* Deposit */}
          <Section title="Deposit">
            <div className="space-y-3">
              <div className="flex border border-border focus-within:border-secondary">
                <input
                  type="number"
                  min="0"
                  value={depositInput}
                  onChange={(e) => setDepositInput(e.target.value)}
                  placeholder="0.00"
                  disabled={!connected}
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 disabled:opacity-50"
                />
                <span className="px-3 py-2.5 text-xs text-secondary bg-bg border-l border-border flex items-center">
                  USDC
                </span>
              </div>

              {depositAmount > 0 && (
                <div className="text-xs text-secondary space-y-1 bg-bg border border-border p-3">
                  <div className="flex justify-between">
                    <span>Shares received</span>
                    <span className="font-mono text-primary">{previewShares.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Your pool share</span>
                    <span className="font-mono text-primary">{previewPoolPct.toFixed(2)}%</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleDeposit}
                disabled={!connected || loading === "deposit" || !depositInput || depositAmount <= 0}
                className="w-full py-2.5 text-sm btn-green disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading === "deposit" ? "Confirming..." : "Deposit to Pool"}
              </button>
            </div>
          </Section>

          {/* Withdraw */}
          <Section title="Withdraw">
            <div className="space-y-3">
              <div className="flex border border-border focus-within:border-secondary">
                <input
                  type="number"
                  min="0"
                  value={withdrawSharesInput}
                  onChange={(e) => setWithdrawSharesInput(e.target.value)}
                  placeholder="0"
                  disabled={!connected || lpPos.shares <= 0}
                  className="flex-1 bg-transparent px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 disabled:opacity-50"
                />
                <span className="px-3 py-2.5 text-xs text-secondary bg-bg border-l border-border flex items-center">
                  SHARES
                </span>
              </div>

              {lpPos.exists && (
                <div className="flex gap-2">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => setWithdrawSharesInput(String(Math.floor(lpPos.shares * pct / 100)))}
                      className="flex-1 text-xs py-1 border border-border text-secondary hover:text-primary hover:border-primary/50 transition-colors"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              )}

              {withdrawShares > 0 && (
                <div className="text-xs text-secondary bg-bg border border-border p-3">
                  <div className="flex justify-between">
                    <span>USDC received</span>
                    <span className="font-mono text-primary">${withdrawUsdcValue.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleWithdraw}
                disabled={!connected || loading === "withdraw" || withdrawShares <= 0 || withdrawShares > lpPos.shares}
                className="w-full py-2.5 text-sm font-bold border border-border text-primary hover:border-primary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading === "withdraw" ? "Confirming..." : "Withdraw from Pool"}
              </button>
            </div>
          </Section>

          {/* Claim Fees */}
          <Section title="Claim Fees">
            <div className="space-y-3">
              <div>
                <div className="text-xs text-secondary mb-1">Claimable</div>
                <div className={`text-xl font-mono font-bold ${claimable > 0 ? "text-long" : "text-secondary"}`}>
                  ${rawToUsdc(claimable).toFixed(2)}
                </div>
              </div>
              {lpPos.exists && (
                <div className="text-xs text-secondary">
                  Total earned: ${rawToUsdc(lpPos.feesClaimed + claimable).toFixed(2)} USDC
                </div>
              )}
              <button
                onClick={handleClaimFees}
                disabled={!connected || loading === "claim" || claimable <= 0}
                className="w-full py-2.5 text-sm font-bold border border-long text-long hover:bg-long/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading === "claim" ? "Confirming..." : "Claim Fees"}
              </button>
            </div>
          </Section>

          {/* Tx status */}
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
      </div>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="border border-border bg-panel p-3 md:p-4">
      <div className="text-[10px] md:text-xs text-secondary mb-1">{label}</div>
      <div className={`text-base md:text-lg font-mono font-bold ${highlight ? "text-long" : "text-primary"}`}>
        {value}
      </div>
    </div>
  );
}
