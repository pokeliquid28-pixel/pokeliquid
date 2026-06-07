"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getReadonlyProgram } from "@/lib/program";
import { getLpPositionPDA } from "@/lib/addresses";

export type LpPositionData = {
  shares: number;
  usdcDeposited: number;
  feesClaimed: number;
  rewardDebt: number;
  exists: boolean;
  isLoading: boolean;
};

const DEFAULT: LpPositionData = {
  shares: 0,
  usdcDeposited: 0,
  feesClaimed: 0,
  rewardDebt: 0,
  exists: false,
  isLoading: true,
};

function safeBn(bn: any): number {
  try {
    return bn.toNumber();
  } catch {
    return 0;
  }
}

export function useLpPosition(): LpPositionData {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [state, setState] = useState<LpPositionData>(DEFAULT);

  useEffect(() => {
    if (!publicKey) {
      setState({ ...DEFAULT, isLoading: false });
      return;
    }

    let cancelled = false;
    const program = getReadonlyProgram(connection);
    const pda = getLpPositionPDA(publicKey);

    const load = async () => {
      try {
        const lp = await (program.account as any).lpPosition.fetch(pda);
        if (cancelled) return;
        setState({
          shares: safeBn(lp.shares),
          usdcDeposited: safeBn(lp.usdcDeposited),
          feesClaimed: safeBn(lp.feesClaimed),
          rewardDebt: Number(lp.rewardDebt?.toString?.() ?? "0"),
          exists: true,
          isLoading: false,
        });
      } catch {
        if (!cancelled) setState({ ...DEFAULT, isLoading: false });
      }
    };

    load();
    const pollId = setInterval(load, 5_000);

    const subId = connection.onAccountChange(pda, async () => {
      try {
        const lp = await (program.account as any).lpPosition.fetch(pda);
        if (!cancelled)
          setState({
            shares: safeBn(lp.shares),
            usdcDeposited: safeBn(lp.usdcDeposited),
            feesClaimed: safeBn(lp.feesClaimed),
            rewardDebt: Number(lp.rewardDebt?.toString?.() ?? "0"),
            exists: true,
            isLoading: false,
          });
      } catch { /* ignore */ }
    });

    return () => {
      cancelled = true;
      clearInterval(pollId);
      connection.removeAccountChangeListener(subId);
    };
  }, [connection, publicKey]);

  return state;
}
