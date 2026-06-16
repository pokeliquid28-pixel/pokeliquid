use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{LiquidityPool, OracleAccount, ProtocolState, ProtocolParams},
};

#[derive(Accounts)]
pub struct UpdateProtocolParams<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        constraint = oracle.key() == protocol_state.oracle @ ErrorCode::MarketOracleMismatch,
    )]
    pub oracle: Account<'info, OracleAccount>,

    #[account(
        mut,
        seeds = [LP_POOL_SEED],
        bump = liquidity_pool.bump,
    )]
    pub liquidity_pool: Account<'info, LiquidityPool>,
}

pub fn handler(ctx: Context<UpdateProtocolParams>, params: ProtocolParams) -> Result<()> {
    let state = &mut ctx.accounts.protocol_state;

    if let Some(v) = params.fee_bps {
        require!(v <= 500, ErrorCode::InvalidParam); // max 5%
        state.fee_bps = v;
    }
    if let Some(v) = params.base_funding_rate_per_hour {
        require!(v <= 10_000, ErrorCode::InvalidParam); // max 10% per hour
        state.base_funding_rate_per_hour = v;
    }
    if let Some(v) = params.skew_factor {
        require!(v <= 100_000, ErrorCode::InvalidParam);
        state.skew_factor = v;
    }
    if let Some(v) = params.profit_cap_bps {
        require!(v >= 5_000 && v <= 100_000, ErrorCode::InvalidParam); // 50%-1000%
        state.profit_cap_bps = v;
    }
    if let Some(v) = params.max_long_exposure {
        state.max_long_exposure = v;
    }
    if let Some(v) = params.max_short_exposure {
        state.max_short_exposure = v;
    }
    if let Some(v) = params.min_position_size {
        state.min_position_size = v;
    }
    if let Some(v) = params.is_paused {
        state.is_paused = v;
        state.manual_pause = v; // admin pause/unpause sets manual flag
    }
    if let Some(v) = params.staleness_threshold {
        ctx.accounts.oracle.staleness_threshold = v;
    }
    if let Some(v) = params.secondary_authority {
        state.secondary_authority = v;
    }
    if let Some(v) = params.auto_pause_threshold {
        state.auto_pause_threshold = v;
    }
    if let Some(v) = params.insurance_fund_bps {
        require!(v <= 5_000, ErrorCode::InvalidParam); // max 50%
        state.insurance_fund_bps = v;
    }
    if let Some(v) = params.lp_fee_bps {
        require!(v <= 8_000, ErrorCode::InvalidParam); // max 80%
        ctx.accounts.liquidity_pool.lp_fee_bps = v;
    }
    if let Some(v) = params.admin {
        msg!("Pending admin transfer to {}", v);
        state.pending_admin = Some(v);
    }
    msg!("Protocol params updated");
    Ok(())
}
