"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Connection } from "@solana/web3.js";
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

// ── Shared oracle cache ─────────────────────────────────────────────────────
// Multiple components call useOracle with the same address. Without caching,
// each instance fires its own RPC poll, causing 429 rate limits on mainnet.
// This module-level cache ensures each oracle address is fetched only once.

type CachedOracle = {
  price: number;
  lastUpdated: number;
  stalenessThreshold: number;
  error: string | null;
  fetchedAt: number;
};

const oracleCache = new Map<string, CachedOracle>();
const oracleSubscribers = new Map<string, Set<() => void>>();
const oracleIntervals = new Map<string, ReturnType<typeof setInterval>>();

function notifySubscribers(key: string) {
  oracleSubscribers.get(key)?.forEach((cb) => cb());
}

function startOraclePolling(key: string, connection: Connection) {
  if (oracleIntervals.has(key)) return;

  const pubkey = new PublicKey(key);

  const fetchOnce = async () => {
    try {
      const program = getReadonlyProgram(connection);
      const oracle = await (program.account as any).oracleAccount.fetch(pubkey);
      oracleCache.set(key, {
        price: oracle.price.toNumber(),
        lastUpdated: oracle.lastUpdated.toNumber(),
        stalenessThreshold: oracle.stalenessThreshold.toNumber(),
        error: null,
        fetchedAt: Date.now(),
      });
    } catch (e: any) {
      const prev = oracleCache.get(key);
      // Keep previous price if we had one — only set error
      if (prev && prev.price > 0) {
        oracleCache.set(key, { ...prev, error: e?.message ?? "Fetch failed", fetchedAt: Date.now() });
      } else {
        oracleCache.set(key, {
          price: 0, lastUpdated: 0, stalenessThreshold: 1800,
          error: e?.message ?? "Fetch failed", fetchedAt: Date.now(),
        });
      }
    }
    notifySubscribers(key);
  };

  fetchOnce();
  oracleIntervals.set(key, setInterval(fetchOnce, 30_000));
}

function stopOraclePollingIfUnused(key: string) {
  const subs = oracleSubscribers.get(key);
  if (!subs || subs.size === 0) {
    const interval = oracleIntervals.get(key);
    if (interval) clearInterval(interval);
    oracleIntervals.delete(key);
  }
}

// ── Shared history cache ────────────────────────────────────────────────────

const historyCache = new Map<string, OracleReading[]>();
const historySubscribers = new Map<string, Set<() => void>>();
const historyIntervals = new Map<string, ReturnType<typeof setInterval>>();

function notifyHistorySubs(key: string) {
  historySubscribers.get(key)?.forEach((cb) => cb());
}

function startHistoryPolling(marketParam: string) {
  if (historyIntervals.has(marketParam)) return;

  const fetchOnce = async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const dayAgo = now - 86400;
      const res = await fetch(`${PRICE_API}/prices?market=${marketParam}&from=${dayAgo}&to=${now}`);
      if (!res.ok) return;
      const rows: { ewma: number; timestamp: number }[] = await res.json();
      historyCache.set(
        marketParam,
        rows.map((r) => ({ price: Math.round(r.ewma * 1_000_000), timestamp: r.timestamp }))
      );
    } catch {
      // keep existing
    }
    notifyHistorySubs(marketParam);
  };

  fetchOnce();
  historyIntervals.set(marketParam, setInterval(fetchOnce, 60_000));
}

function stopHistoryPollingIfUnused(key: string) {
  const subs = historySubscribers.get(key);
  if (!subs || subs.size === 0) {
    const interval = historyIntervals.get(key);
    if (interval) clearInterval(interval);
    historyIntervals.delete(key);
  }
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useOracle(
  oracleAddress?: string,
  priceApiMarket?: string
): OracleData {
  const { connection } = useConnection();
  const key = oracleAddress || ORACLE_ACCOUNT.toBase58();
  const marketParam = priceApiMarket || "ETB";

  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  // Subscribe to oracle cache updates
  useEffect(() => {
    if (!oracleSubscribers.has(key)) oracleSubscribers.set(key, new Set());
    oracleSubscribers.get(key)!.add(rerender);
    startOraclePolling(key, connection);

    return () => {
      oracleSubscribers.get(key)?.delete(rerender);
      stopOraclePollingIfUnused(key);
    };
  }, [connection, key]);

  // Subscribe to history cache updates
  useEffect(() => {
    if (!historySubscribers.has(marketParam)) historySubscribers.set(marketParam, new Set());
    historySubscribers.get(marketParam)!.add(rerender);
    startHistoryPolling(marketParam);

    return () => {
      historySubscribers.get(marketParam)?.delete(rerender);
      stopHistoryPollingIfUnused(marketParam);
    };
  }, [marketParam]);

  const cached = oracleCache.get(key);
  const price = cached?.price ?? 0;
  const lastUpdated = cached?.lastUpdated ?? 0;
  const stalenessThreshold = cached?.stalenessThreshold ?? 1800;
  const error = cached?.error ?? null;
  const isLoading = !cached;
  const readings = historyCache.get(marketParam) ?? [];

  const secondsSinceUpdate = lastUpdated > 0 ? Math.floor(Date.now() / 1000 - lastUpdated) : -1;
  const isStale = secondsSinceUpdate > stalenessThreshold;

  let health: OracleHealth = "fresh";
  if (secondsSinceUpdate > 15 * 60) health = "stale";
  else if (secondsSinceUpdate > 5 * 60) health = "degraded";

  return { price, lastUpdated, stalenessThreshold, readings, isLoading, isStale, health, secondsSinceUpdate, error };
}
