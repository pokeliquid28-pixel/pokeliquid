import BN from "bn.js";

// ─── Direction enum ─────────────────────────────────────────────────────────

export type Direction = { long: {} } | { short: {} };

export const Long: Direction = { long: {} };
export const Short: Direction = { short: {} };

// ─── On-chain account types ─────────────────────────────────────────────────

export type Position = {
  oracle: string; // pubkey as base58
  direction: Direction;
  collateral: BN;
  notional: BN;
  leverage: number;
  entryPrice: BN;
  openTimestamp: BN;
  lastFundingTimestamp: BN;
  slPrice: BN | null;
  tpPrice: BN | null;
  marketId: string;
};

export type MarginAccount = {
  collateral: BN;
  positions: Position[];
};

export type LpPosition = {
  shares: BN;
  depositedAmount: BN;
  lastClaimTimestamp: BN;
};

// ─── API response types ─────────────────────────────────────────────────────

export type PriceRecord = {
  id: number;
  timestamp: number;
  raw_price: number;
  ewma: number;
  deviation: number;
  alpha: number;
  tx_signature: string;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Trade = {
  id: number;
  timestamp: number;
  user_pubkey: string;
  position_index: number;
  action: string;
  direction: string;
  collateral: number;
  leverage: number;
  notional: number;
  entry_price: number;
  exit_price: number | null;
  pnl: number | null;
  fee: number;
  market_id: string;
  tx_signature: string;
};

export type ProtocolStats = {
  total_volume_24h: number;
  total_volume_7d: number;
  total_trades_24h: number;
  total_liquidations_24h: number;
  total_fees_24h: number;
  unique_traders_24h: number;
};

export type HealthStatus = {
  status: string;
  oracle: Record<string, unknown>;
  markets: Record<string, unknown>;
  liquidation: Record<string, unknown>;
  funding: Record<string, unknown>;
  solana: Record<string, unknown>;
  keeper: {
    uptime_minutes: number;
    total_updates: number;
    total_errors: number;
    errors_24h: number;
  };
};
