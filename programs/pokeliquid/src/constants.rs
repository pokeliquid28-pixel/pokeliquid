// Seeds
pub const PROTOCOL_SEED: &[u8] = b"protocol";
pub const ORACLE_SEED: &[u8] = b"oracle";
pub const MARGIN_SEED: &[u8] = b"margin";
pub const FEE_VAULT_SEED: &[u8] = b"fee_vault";
pub const INSURANCE_FUND_SEED: &[u8] = b"insurance_fund";
pub const USDC_MINT_SEED: &[u8] = b"usdc_mint";

// Defaults
pub const DEFAULT_FEE_BPS: u64 = 200;
pub const DEFAULT_BASE_FUNDING_RATE: u64 = 30;
pub const DEFAULT_SKEW_FACTOR: u64 = 1_000;
pub const DEFAULT_PROFIT_CAP_BPS: u64 = 30_000; // 300% max profit
pub const DEFAULT_INSURANCE_FUND_BPS: u64 = 2_500; // 25% of trading fees → insurance
pub const DEFAULT_MIN_POSITION_SIZE: u64 = 1_000_000;
pub const DEFAULT_STALENESS_THRESHOLD: i64 = 1_800;
pub const DEFAULT_AUTO_PAUSE_THRESHOLD: i64 = 3_600; // 1 hour

pub const LP_SEED: &[u8] = b"lp";
pub const LP_POOL_SEED: &[u8] = b"liquidity_pool";
pub const LP_VAULT_SEED: &[u8] = b"lp_vault";

pub const DEFAULT_LP_FEE_BPS: u64 = 5_000; // 50% of trading fees go to LPs
// 25% insurance (DEFAULT_INSURANCE_FUND_BPS), 25% platform (stays in fee_vault)

pub const USDC_DECIMALS: u8 = 6;
pub const DEVNET_MINT_AMOUNT: u64 = 1_000_000_000; // 1000 USDC (6 decimals)

pub const MARKET_SEED: &[u8] = b"market";
pub const REFERRAL_SEED: &[u8] = b"referral";

/// Referral fee: 5% of platform portion + 5% of insurance portion = 10% of total fee
pub const REFERRAL_FEE_BPS: u64 = 1_000; // 10% of the fee amount (= 1000 bps of fee)

pub const DEFAULT_MAX_MARKET_OI: u64 = 100_000_000_000; // 100k USDC (6 decimals)

pub const REFERRAL_TRACKER_SEED: &[u8] = b"ref_track";
/// Auto-upgrade referral to 20% after 10 unique users AND $100 in fees
pub const AUTO_UPGRADE_UNIQUE_REFS: u64 = 10;
pub const AUTO_UPGRADE_FEES_THRESHOLD: u64 = 100_000_000; // $100 USDC (6 decimals)
pub const AUTO_UPGRADE_FEE_SHARE_BPS: u64 = 2_000; // 20%

pub const FUNDING_RATE_SCALE: u64 = 100_000;
pub const LIQUIDATION_THRESHOLD_BPS: u64 = 500; // 5% = 500 bps
pub const LIQUIDATOR_REWARD_BPS: u64 = 200; // 2% to liquidator
pub const LIQUIDATION_LP_BPS: u64 = 4_400; // 44% to LP
pub const LIQUIDATION_INSURANCE_BPS: u64 = 4_400; // 44% to insurance
// Remaining 10% stays in fee_vault (platform)

// Oracle price bounds: max 20% deviation per update
pub const MAX_ORACLE_DEVIATION_BPS: u64 = 2_000; // 20% max deviation per oracle update
// Minimum seconds between oracle updates (prevents rapid multi-hop manipulation)
pub const MIN_ORACLE_UPDATE_INTERVAL: i64 = 5;

pub const RAFFLE_SEED: &[u8] = b"raffle";
pub const PAYOUT_QUEUE_SEED: &[u8] = b"payout_queue";
pub const TIMELOCK_SEED: &[u8] = b"timelock";
pub const TIMELOCK_DELAY: i64 = 86_400; // 24 hours

// Funding fee split (majority side pays, minority pays 0)
pub const FUNDING_LP_BPS: u64 = 7_000; // 70% of funding → LP
pub const FUNDING_INSURANCE_BPS: u64 = 2_000; // 20% of funding → insurance
// Remaining 10% stays in fee_vault (platform), minority side pays 0
