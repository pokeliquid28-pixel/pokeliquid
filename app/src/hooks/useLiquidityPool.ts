"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { getReadonlyProgram } from "@/lib/program";
import { LIQUIDITY_POOL } from "@/lib/addresses";

export type LiquidityPoolData = {
  totalUsdc: number;
  totalShares: number;
  accumulatedFees: number;
  lpFeeBps: number;
  totalFeesClaimed: number;
  accFeePerShare: number;
  isLoading: boolean;
  error: string | null;
};

const DEFAULT: LiquidityPoolData = {
  totalUsdc: 0,
  totalShares: 0,
  accumulatedFees: 0,
  lpFeeBps: 3000,
  totalFeesClaimed: 0,
  accFeePerShare: 0,
  isLoading: true,
  error: null,
};

function safeBn(bn: any): number {
  try {
    return bn.toNumber();
  } catch {
    return 0;
  }
}

function safeBn128(bn: any): number {
  try {
    if (typeof bn === "number") return bn;
    if (bn && typeof bn.toString === "function") {
      return Number(bn.toString());
    }
    return 0;
  } catch {
    return 0;
  }
}

export function useLiquidityPool(): LiquidityPoolData {
  const { connection } = useConnection();
  const [state, setState] = useState<LiquidityPoolData>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    const program = getReadonlyProgram(connection);

    const load = async () => {
      try {
        const pool = await (program.account as any).liquidityPool.fetch(LIQUIDITY_POOL);
        if (cancelled) return;
        setState({
          totalUsdc: safeBn(pool.totalUsdc),
          totalShares: safeBn(pool.totalShares),
          accumulatedFees: safeBn(pool.accumulatedFees),
          lpFeeBps: safeBn(pool.lpFeeBps),
          totalFeesClaimed: safeBn(pool.totalFeesClaimed),
          accFeePerShare: safeBn128(pool.accFeePerShare),
          isLoading: false,
          error: null,
        });
      } catch (e: any) {
        if (!cancelled)
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: e?.message ?? "Failed to fetch liquidity pool",
          }));
      }
    };

    load();
    const pollId = setInterval(load, 5_000);

    const subId = connection.onAccountChange(LIQUIDITY_POOL, async () => {
      try {
        const pool = await (program.account as any).liquidityPool.fetch(LIQUIDITY_POOL);
        if (!cancelled)
          setState({
            totalUsdc: safeBn(pool.totalUsdc),
            totalShares: safeBn(pool.totalShares),
            accumulatedFees: safeBn(pool.accumulatedFees),
            lpFeeBps: safeBn(pool.lpFeeBps),
            totalFeesClaimed: safeBn(pool.totalFeesClaimed),
            accFeePerShare: safeBn128(pool.accFeePerShare),
            isLoading: false,
            error: null,
          });
      } catch { /* ignore */ }
    });

    return () => {
      cancelled = true;
      clearInterval(pollId);
      connection.removeAccountChangeListener(subId);
    };
  }, [connection]);

  return state;
}
