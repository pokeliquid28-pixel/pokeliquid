"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { getReadonlyProgram } from "@/lib/program";
import { ORACLE_ACCOUNT } from "@/lib/addresses";

export type OracleReading = {
  price: number;
  timestamp: number;
};

export type OracleHealth = "fresh" | "degraded" | "stale";

export type OracleData = {
  price: number;        // raw u64 (divide by 1_000_000 for USD)
  lastUpdated: number;  // unix timestamp
  stalenessThreshold: number;
  readings: OracleReading[];
  isLoading: boolean;
  isStale: boolean;
  health: OracleHealth;
  secondsSinceUpdate: number;
  error: string | null;
};

const PRICE_API = process.env.NEXT_PUBLIC_PRICE_API || "/api/keeper";

export function useOracle(): OracleData {
  const { connection } = useConnection();
  const [price, setPrice] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(0);
  const [stalenessThreshold, setStalenessThreshold] = useState(1800);
  const [readings, setReadings] = useState<OracleReading[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Poll on-chain oracle for current price
  useEffect(() => {
    let cancelled = false;

    const fetchOracle = async () => {
      try {
        const program = getReadonlyProgram(connection);
        const oracle = await (program.account as any).oracleAccount.fetch(ORACLE_ACCOUNT);
        if (cancelled) return;

        setPrice(oracle.price.toNumber());
        setLastUpdated(oracle.lastUpdated.toNumber());
        setStalenessThreshold(oracle.stalenessThreshold.toNumber());
        setError(null);
        setIsLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to fetch oracle");
          setIsLoading(false);
        }
      }
    };

    fetchOracle();
    const id = setInterval(fetchOracle, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connection]);

  // Poll keeper API for historical price chart data
  useEffect(() => {
    let cancelled = false;

    const fetchHistory = async () => {
      try {
        const res = await fetch(`${PRICE_API}/prices?limit=50`);
        if (!res.ok) return;
        const rows: { ewma: number; timestamp: number }[] = await res.json();
        if (cancelled) return;
        setReadings(
          rows.map((r) => ({
            price: Math.round(r.ewma * 1_000_000), // convert USD back to raw
            timestamp: r.timestamp,
          }))
        );
      } catch {
        // API unavailable — keep existing readings
      }
    };

    fetchHistory();
    const id = setInterval(fetchHistory, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const secondsSinceUpdate = lastUpdated > 0 ? Math.floor(Date.now() / 1000 - lastUpdated) : -1;
  const isStale = secondsSinceUpdate > stalenessThreshold;

  let health: OracleHealth = "fresh";
  if (secondsSinceUpdate > 15 * 60) health = "stale";
  else if (secondsSinceUpdate > 5 * 60) health = "degraded";

  return { price, lastUpdated, stalenessThreshold, readings, isLoading, isStale, health, secondsSinceUpdate, error };
}
