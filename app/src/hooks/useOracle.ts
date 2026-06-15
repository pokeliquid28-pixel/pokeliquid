"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, Connection } from "@solana/web3.js";
import { getReadonlyProgram } from "@/lib/program";
import { ORACLE_ACCOUNT } from "@/lib/addresses";
import { MARKETS } from "@/lib/markets";

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

// ── Build oracle→marketId lookup from MARKETS ────────────────────────────────
const oracleToMarketId = new Map<string, string>();
for (const m of MARKETS) {
  oracleToMarketId.set(m.oracleAddress, m.priceApiMarket);
}

// ── Shared oracle cache ─────────────────────────────────────────────────────
type CachedOracle = {
  price: number;
  lastUpdated: number;
  stalenessThreshold: number;
  error: string | null;
  fetchedAt: number;
};

const oracleCache = new Map<string, CachedOracle>();
const oracleSubscribers = new Map<string, Set<() => void>>();

function notifySubscribers(key: string) {
  oracleSubscribers.get(key)?.forEach((cb) => cb());
}

function notifyAllSubscribers() {
  oracleSubscribers.forEach((subs) => subs.forEach((cb) => cb()));
}

// ── Bulk price polling from keeper API (1 HTTP call for all markets) ────────
let bulkPollInterval: ReturnType<typeof setInterval> | null = null;
let bulkPollStarted = false;

async function fetchAllPrices() {
  try {
    const res = await fetch(`${PRICE_API}/prices/all`);
    if (!res.ok) return;
    const data: Record<string, { price: number; ewma: number; lastUpdateTime: number }> = await res.json();

    for (const [marketId, info] of Object.entries(data)) {
      // Find oracle address for this market ID
      const market = MARKETS.find((m) => m.priceApiMarket === marketId);
      if (!market) continue;
      const key = market.oracleAddress;
      oracleCache.set(key, {
        price: info.price,
        lastUpdated: info.lastUpdateTime,
        stalenessThreshold: 1800,
        error: null,
        fetchedAt: Date.now(),
      });
    }
    notifyAllSubscribers();
  } catch {
    // keep existing cache on error
  }
}

function startBulkPolling() {
  if (bulkPollStarted) return;
  bulkPollStarted = true;
  fetchAllPrices();
  bulkPollInterval = setInterval(fetchAllPrices, 30_000);
}

// ── On-chain RPC fetch for a single oracle (used when trading) ──────────────
// Only fetched on-demand, not on a timer. Call fetchOracleOnChain() explicitly.
const rpcFetchInFlight = new Set<string>();

async function fetchOracleOnChain(key: string, connection: Connection) {
  if (rpcFetchInFlight.has(key)) return;
  rpcFetchInFlight.add(key);
  try {
    const pubkey = new PublicKey(key);
    const program = getReadonlyProgram(connection);
    const oracle = await (program.account as any).oracleAccount.fetch(pubkey);
    oracleCache.set(key, {
      price: oracle.price.toNumber(),
      lastUpdated: oracle.lastUpdated.toNumber(),
      stalenessThreshold: oracle.stalenessThreshold.toNumber(),
      error: null,
      fetchedAt: Date.now(),
    });
    notifySubscribers(key);
  } catch (e: any) {
    const prev = oracleCache.get(key);
    if (prev && prev.price > 0) {
      oracleCache.set(key, { ...prev, error: e?.message ?? "Fetch failed", fetchedAt: Date.now() });
    }
  } finally {
    rpcFetchInFlight.delete(key);
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

  // Start bulk polling (one call for all markets via keeper API)
  useEffect(() => {
    startBulkPolling();
  }, []);

  // Subscribe to oracle cache updates
  useEffect(() => {
    if (!oracleSubscribers.has(key)) oracleSubscribers.set(key, new Set());
    oracleSubscribers.get(key)!.add(rerender);

    return () => {
      oracleSubscribers.get(key)?.delete(rerender);
    };
  }, [key]);

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

/** Get the 24h % change for a market from the cached history. */
export function getMarketChange(oracleAddress: string, priceApiMarket: string): number {
  const cached = oracleCache.get(oracleAddress);
  const readings = historyCache.get(priceApiMarket);
  if (!cached || !readings || readings.length < 2) return 0;
  const currentPrice = cached.price / 1_000_000;
  const oldest = readings[0].price / 1_000_000;
  if (oldest <= 0) return 0;
  return ((currentPrice - oldest) / oldest) * 100;
}

/** Fetch the latest on-chain oracle price via RPC (for trading accuracy). */
export function useOracleRefresh() {
  const { connection } = useConnection();
  return (oracleAddress: string) => fetchOracleOnChain(oracleAddress, connection);
}
