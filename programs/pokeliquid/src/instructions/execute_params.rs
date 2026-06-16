use anchor_lang::prelude::*;
use crate::{constants::*, error::ErrorCode, state::{LiquidityPool, OracleAccount, ProtocolState, Timelock}};

#[derive(Accounts)]
pub struct ExecuteParams<'info> {
    /// Anyone can execute after timelock expires
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [TIMELOCK_SEED],
        bump = timelock.bump,
    )]
    pub timelock: Box<Account<'info, Timelock>>,

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

pub fn handler(ctx: Context<ExecuteParams>) -> Result<()> {
    let tl = &mut ctx.accounts.timelock;
    let params = tl.pending_params.take().ok_or(ErrorCode::NoOpenPosition)?; // reuse error: "nothing pending"
    let now = Clock::get()?.unix_timestamp;
    require!(now >= tl.params_execute_after, ErrorCode::ProtocolPaused); // reuse: "too early"

    let state = &mut ctx.accounts.protocol_state;

    // Apply params (same logic as update_params but from the pending struct)
    if let Some(v) = params.fee_bps { state.fee_bps = v; }
    if let Some(v) = params.base_funding_rate_per_hour { state.base_funding_rate_per_hour = v; }
    if let Some(v) = params.skew_factor { state.skew_factor = v; }
    if let Some(v) = params.profit_cap_bps { state.profit_cap_bps = v; }
    if let Some(v) = params.max_long_exposure { state.max_long_exposure = v; }
    if let Some(v) = params.max_short_exposure { state.max_short_exposure = v; }
    if let Some(v) = params.min_position_size { state.min_position_size = v; }
    if let Some(v) = params.is_paused {
        state.is_paused = v;
        state.manual_pause = v;
    }
    if let Some(v) = params.staleness_threshold {
        ctx.accounts.oracle.staleness_threshold = v;
    }
    if let Some(v) = params.secondary_authority { state.secondary_authority = v; }
    if let Some(v) = params.auto_pause_threshold { state.auto_pause_threshold = v; }
    if let Some(v) = params.insurance_fund_bps { state.insurance_fund_bps = v; }
    if let Some(v) = params.lp_fee_bps { ctx.accounts.liquidity_pool.lp_fee_bps = v; }
    if let Some(v) = params.admin {
        state.pending_admin = Some(v);
    }

    tl.params_execute_after = 0;
    msg!("Timelocked params executed");
    Ok(())
}
