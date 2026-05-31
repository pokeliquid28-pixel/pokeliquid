use anchor_lang::prelude::*;

// ─── Protocol State ───────────────────────────────────────────────────────────

#[account]
pub struct ProtocolState {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub fee_vault: Pubkey,
    pub insurance_fund: Pubkey,
    pub usdc_mint: Pubkey,
    pub total_long_exposure: u64,
    pub total_short_exposure: u64,
    pub max_long_exposure: u64,
    pub max_short_exposure: u64,
    pub fee_bps: u64,
    pub base_funding_rate_per_hour: u64,
    pub skew_factor: u64,
    pub profit_cap_bps: u64,
    pub insurance_fund_bps: u64,
    pub min_position_size: u64,
    pub is_paused: bool,
    pub bump: u8,
    pub usdc_mint_bump: u8,
    pub fee_vault_bump: u8,
    pub insurance_fund_bump: u8,
    pub secondary_authority: Pubkey,
    pub last_oracle_update: i64,
    pub auto_pause_threshold: i64,
}

impl ProtocolState {
    // 8 disc + 6*32 pub + 10*8 u64 + 1 bool + 4*1 bumps + 2*8 i64 + 16 padding
    pub const SPACE: usize = 8 + 192 + 80 + 1 + 4 + 16 + 16;
}

// ─── Oracle Account ───────────────────────────────────────────────────────────

#[account]
pub struct OracleAccount {
    pub price: u64,
    pub last_updated: i64,
    pub staleness_threshold: i64,
    pub bump: u8,
}

impl OracleAccount {
    pub const SPACE: usize = 8 + 8 + 8 + 8 + 1 + 32;
}

// ─── Margin Account ───────────────────────────────────────────────────────────

pub const MAX_POSITIONS: usize = 5;

#[account]
pub struct MarginAccount {
    pub owner: Pubkey,
    pub collateral: u64,
    pub positions: [Option<Position>; MAX_POSITIONS],
    pub bump: u8,
}

impl MarginAccount {
    // 8 disc + 32 owner + 8 collateral + 5 * (1 option_tag + Position::SPACE) + 1 bump + 32 padding
    pub const SPACE: usize = 8 + 32 + 8 + MAX_POSITIONS * (1 + Position::SPACE) + 1 + 32;

    pub fn open_position_count(&self) -> u8 {
        self.positions.iter().filter(|p| p.is_some()).count() as u8
    }

    pub fn first_open_slot(&self) -> Option<usize> {
        self.positions.iter().position(|p| p.is_none())
    }
}

// ─── Position ─────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Position {
    pub direction: Direction,
    pub collateral: u64,
    pub notional: u64,
    pub leverage: u8,
    pub entry_price: u64,
    pub open_timestamp: i64,
    pub last_funding_timestamp: i64,
    pub sl_price: Option<u64>,
    pub tp_price: Option<u64>,
}

impl Position {
    // 1 + 8 + 8 + 1 + 8 + 8 + 8 + (1+8) + (1+8) = 60
    pub const SPACE: usize = 1 + 8 + 8 + 1 + 8 + 8 + 8 + 9 + 9;
}

// ─── Close Reason ────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum CloseReason {
    Manual,
    StopLoss,
    TakeProfit,
    Liquidation,
}

// ─── Direction ────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum Direction {
    Long,
    Short,
}

// ─── Liquidity Pool ──────────────────────────────────────────────────────

#[account]
pub struct LiquidityPool {
    pub total_usdc: u64,
    pub total_shares: u64,
    pub accumulated_fees: u64,
    pub lp_fee_bps: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

impl LiquidityPool {
    // 8 disc + 4*8 u64 + 2*1 bumps + 32 padding
    pub const SPACE: usize = 8 + 32 + 2 + 32;
}

// ─── LP Position ─────────────────────────────────────────────────────────

#[account]
pub struct LpPosition {
    pub owner: Pubkey,
    pub shares: u64,
    pub usdc_deposited: u64,
    pub fees_claimed: u64,
    pub bump: u8,
}

impl LpPosition {
    // 8 disc + 32 owner + 3*8 u64 + 1 bump + 32 padding
    pub const SPACE: usize = 8 + 32 + 24 + 1 + 32;
}

// ─── Update Params ────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProtocolParams {
    pub fee_bps: Option<u64>,
    pub base_funding_rate_per_hour: Option<u64>,
    pub skew_factor: Option<u64>,
    pub profit_cap_bps: Option<u64>,
    pub max_long_exposure: Option<u64>,
    pub max_short_exposure: Option<u64>,
    pub min_position_size: Option<u64>,
    pub is_paused: Option<bool>,
    pub staleness_threshold: Option<i64>,
    pub secondary_authority: Option<Pubkey>,
    pub auto_pause_threshold: Option<i64>,
}
