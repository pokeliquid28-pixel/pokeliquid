use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    events::OracleStale,
    state::{MarketState, OracleAccount, ProtocolState},
};

#[derive(Accounts)]
pub struct CheckAndPause<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    pub oracle: Account<'info, OracleAccount>,

    /// Proves the oracle belongs to a real market (Anchor owner+discriminator check)
    #[account(
        seeds = [MARKET_SEED, market_state.market_id_trimmed()],
        bump = market_state.bump,
        constraint = market_state.oracle == oracle.key() @ ErrorCode::MarketOracleMismatch,
    )]
    pub market_state: Account<'info, MarketState>,
}

pub fn handler(ctx: Context<CheckAndPause>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let oracle = &ctx.accounts.oracle;
    let protocol = &mut ctx.accounts.protocol_state;

    let seconds_stale = now.saturating_sub(oracle.last_updated);

    require!(
        oracle.last_updated == 0 || seconds_stale > protocol.auto_pause_threshold,
        ErrorCode::OracleNotStale
    );

    protocol.is_paused = true;

    emit!(OracleStale {
        last_updated: oracle.last_updated,
        seconds_stale,
    });

    msg!(
        "Protocol paused: oracle stale for {}s (threshold={}s)",
        seconds_stale,
        protocol.auto_pause_threshold
    );
    Ok(())
}
