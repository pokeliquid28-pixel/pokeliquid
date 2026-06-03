"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getReadonlyProgram } from "@/lib/program";
import { MARKET_SEED, PROGRAM_ID } from "@/lib/addresses";

export type MarketStateData = {
  longOi: number;
  shortOi: number;
  maxLongOi: number;
  maxShortOi: number;
  isLoading: boolean;
};

const DEFAULT: MarketStateData = {
  longOi: 0,
  shortOi: 0,
  maxLongOi: 0,
  maxShortOi: 0,
  isLoading: true,
};

function safeBn(bn: any): number {
  try {
    return bn.toNumber();
  } catch {
    return 0;
  }
}

export function useMarketState(marketId: string): MarketStateData {
  const { connection } = useConnection();
  const [state, setState] = useState<MarketStateData>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    const program = getReadonlyProgram(connection);
    const [pda] = PublicKey.findProgramAddressSync(
      [MARKET_SEED, Buffer.from(marketId)],
      PROGRAM_ID
    );

    const load = async () => {
      try {
        const ms = await (program.account as any).marketState.fetch(pda);
        if (cancelled) return;
        setState({
          longOi: safeBn(ms.longOpenInterest),
          shortOi: safeBn(ms.shortOpenInterest),
          maxLongOi: safeBn(ms.maxLongOi),
          maxShortOi: safeBn(ms.maxShortOi),
          isLoading: false,
        });
      } catch {
        if (!cancelled) setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    load();
    const pollId = setInterval(load, 5_000);

    const subId = connection.onAccountChange(pda, async () => {
      try {
        const ms = await (program.account as any).marketState.fetch(pda);
        if (!cancelled)
          setState({
            longOi: safeBn(ms.longOpenInterest),
            shortOi: safeBn(ms.shortOpenInterest),
            maxLongOi: safeBn(ms.maxLongOi),
            maxShortOi: safeBn(ms.maxShortOi),
            isLoading: false,
          });
      } catch { /* ignore */ }
    });

    return () => {
      cancelled = true;
      clearInterval(pollId);
      connection.removeAccountChangeListener(subId);
    };
  }, [connection, marketId]);

  return state;
}
