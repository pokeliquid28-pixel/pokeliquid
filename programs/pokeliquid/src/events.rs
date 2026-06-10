use anchor_lang::prelude::*;

use crate::state::{Direction, CloseReason};

#[event]
pub struct PositionOpened {
    pub user: Pubkey,
    pub oracle: Pubkey,
    pub direction: Direction,
    pub collateral: u64,
    pub notional: u64,
    pub leverage: u8,
    pub entry_price: u64,
    pub fee_paid: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionClosed {
    pub user: Pubkey,
    pub oracle: Pubkey,
    pub direction: Direction,
    pub entry_price: u64,
    pub exit_price: u64,
    pub pnl: i64,
    pub funding_paid: u64,
    pub fee_paid: u64,
    pub settlement: u64,
    pub reason: CloseReason,
    pub timestamp: i64,
}

#[event]
pub struct PositionLiquidated {
    pub user: Pubkey,
    pub oracle: Pubkey,
    pub liquidator: Pubkey,
    pub entry_price: u64,
    pub exit_price: u64,
    pub collateral_lost: u64,
    pub timestamp: i64,
}

#[event]
pub struct FundingSettled {
    pub user: Pubkey,
    pub position_index: u8,
    pub funding_owed: u64,
    pub hours_settled: u64,
    pub new_collateral: u64,
    pub timestamp: i64,
}

#[event]
pub struct LpDeposited {
    pub user: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub total_usdc: u64,
}

#[event]
pub struct LpWithdrawn {
    pub user: Pubkey,
    pub shares: u64,
    pub usdc_out: u64,
    pub total_usdc: u64,
}

#[event]
pub struct FeesClaimed {
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct SlTpSet {
    pub user: Pubkey,
    pub position_index: u8,
    pub sl_price: Option<u64>,
    pub tp_price: Option<u64>,
}

#[event]
pub struct OracleUpdated {
    pub old_price: u64,
    pub new_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct OracleStale {
    pub last_updated: i64,
    pub seconds_stale: i64,
}

#[event]
pub struct ReferralRegistered {
    pub user: Pubkey,
    pub username: String,
}

#[event]
pub struct ReferralFeeCredited {
    pub referrer: Pubkey,
    pub trader: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ReferralClaimed {
    pub user: Pubkey,
    pub amount: u64,
}
