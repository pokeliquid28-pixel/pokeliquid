import type {
  PriceRecord,
  Candle,
  Trade,
  ProtocolStats,
  HealthStatus,
} from "./types";

const DEFAULT_BASE = "https://pokeliquid.xyz/api/v1";

/**
 * Read-only REST API client for Pokeliquid market data.
 * No authentication required. All methods are safe/read-only.
 */
export class PokeliquidAPI {
  private base: string;

  constructor(baseUrl?: string) {
    this.base = (baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
  }

  private async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(this.base + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  /** Health check */
  async ping(): Promise<{ ok: boolean; timestamp: string }> {
    return this.get("/ping");
  }

  /** Full system health */
  async health(): Promise<HealthStatus> {
    return this.get("/health");
  }

  /**
   * Historical oracle price data.
   * @param market - Market ID: "ETB", "CHARIZARD-X", "CHARMANDER", "PIKACHU"
   * @param opts.limit - Number of records (max 500, default 50)
   * @param opts.from - Unix timestamp range start
   * @param opts.to - Unix timestamp range end
   */
  async prices(
    market = "ETB",
    opts?: { limit?: number; from?: number; to?: number }
  ): Promise<PriceRecord[]> {
    return this.get("/prices", {
      market,
      limit: opts?.limit,
      from: opts?.from,
      to: opts?.to,
    });
  }

  /**
   * Get the latest price for a market.
   * @returns Price in USD (human-readable, e.g. 161.50)
   */
  async latestPrice(market = "ETB"): Promise<number> {
    const data = await this.prices(market, { limit: 1 });
    if (!data.length) throw new Error(`No price data for ${market}`);
    return data[0].ewma;
  }

  /**
   * OHLC candlestick data.
   * @param market - Market ID
   * @param resolution - "1h" (hourly) or "1d" (daily)
   */
  async candles(market = "ETB", resolution: "1h" | "1d" = "1h"): Promise<Candle[]> {
    return this.get("/candles", { market, resolution });
  }

  /**
   * Recent trades across all users.
   * @param limit - Max 200, default 50
   */
  async recentTrades(limit = 50): Promise<Trade[]> {
    const data = await this.get<{ trades: Trade[] }>("/trades/recent", { limit });
    return data.trades ?? [];
  }

  /**
   * Trade history for a specific wallet.
   * @param user - Solana wallet public key (base58)
   * @param limit - Max 100, default 20
   */
  async userTrades(user: string, limit = 20): Promise<{ trades: Trade[]; total: number }> {
    return this.get("/trades", { user, limit });
  }

  /** Protocol stats (24h/7d volume, trades, fees, etc.) */
  async stats(): Promise<ProtocolStats> {
    return this.get("/stats");
  }

  /** Recent protocol events */
  async events(limit = 10): Promise<unknown[]> {
    return this.get("/events/recent", { limit });
  }
}
