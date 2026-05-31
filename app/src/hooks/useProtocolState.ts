"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { getReadonlyProgram } from "@/lib/program";
import { PROTOCOL_STATE } from "@/lib/addresses";

export type ProtocolStateData = {
  admin: string;
  totalLongExposure: number;
  totalShortExposure: number;
  maxLongExposure: number;
  maxShortExposure: number;
  feeBps: number;
  baseFundingRatePerHour: number;
  skewFactor: number;
  profitCapBps: number;
  insuranceFundBps: number;
  minPositionSize: number;
  isPaused: boolean;
  isLoading: boolean;
  error: string | null;
};

const DEFAULT: ProtocolStateData = {
  admin: "",
  totalLongExposure: 0,
  totalShortExposure: 0,
  maxLongExposure: 0,
  maxShortExposure: 0,
  feeBps: 200,
  baseFundingRatePerHour: 30,
  skewFactor: 1000,
  profitCapBps: 50000,
  insuranceFundBps: 1000,
  minPositionSize: 1_000_000,
  isPaused: false,
  isLoading: true,
  error: null,
};

const U64_MAX = "18446744073709551615";

// bn.js throws if value exceeds 53-bit safe integer (e.g. u64::MAX).
// Return 0 for those sentinel "no cap" values.
function safeBn(bn: any): number {
  try {
    return bn.toNumber();
  } catch {
    return 0; // u64::MAX → treat as uncapped (0 = no cap)
  }
}

function parseProtocolState(ps: any): Omit<ProtocolStateData, "isLoading" | "error"> {
  return {
    admin: ps.admin.toBase58(),
    totalLongExposure: ps.totalLongExposure.toNumber(),
    totalShortExposure: ps.totalShortExposure.toNumber(),
    maxLongExposure: safeBn(ps.maxLongExposure),
    maxShortExposure: safeBn(ps.maxShortExposure),
    feeBps: ps.feeBps.toNumber(),
    baseFundingRatePerHour: ps.baseFundingRatePerHour.toNumber(),
    skewFactor: ps.skewFactor.toNumber(),
    profitCapBps: ps.profitCapBps.toNumber(),
    insuranceFundBps: ps.insuranceFundBps.toNumber(),
    minPositionSize: ps.minPositionSize.toNumber(),
    isPaused: ps.isPaused,
  };
}

export function useProtocolState(): ProtocolStateData {
  const { connection } = useConnection();
  const [state, setState] = useState<ProtocolStateData>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    const program = getReadonlyProgram(connection);

    const load = async () => {
      try {
        const ps = await (program.account as any).protocolState.fetch(PROTOCOL_STATE);
        if (cancelled) return;
        setState({ ...parseProtocolState(ps), isLoading: false, error: null });
      } catch (e: any) {
        if (!cancelled)
          setState((prev) => ({ ...prev, isLoading: false, error: e?.message ?? "Failed to fetch protocol state" }));
      }
    };

    load();

    // Poll every 5s as reliable fallback (devnet WS is unreliable)
    const pollId = setInterval(load, 5_000);

    const subId = connection.onAccountChange(PROTOCOL_STATE, async () => {
      try {
        const ps = await (program.account as any).protocolState.fetch(PROTOCOL_STATE);
        if (!cancelled)
          setState({ ...parseProtocolState(ps), isLoading: false, error: null });
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
