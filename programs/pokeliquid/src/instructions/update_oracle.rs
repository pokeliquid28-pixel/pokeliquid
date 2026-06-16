use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    events::OracleUpdated,
    state::{OracleAccount, ProtocolState},
};

#[derive(Accounts)]
pub struct UpdateOracle<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = (
            protocol_state.admin == authority.key()
            || protocol_state.secondary_authority == authority.key()
        ) @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [ORACLE_SEED],
        bump = oracle.bump,
    )]
    pub oracle: Account<'info, OracleAccount>,
}

pub fn handler(ctx: Context<UpdateOracle>, price: u64) -> Result<()> {
    require!(price > 0, ErrorCode::InvalidOraclePrice);

    let now = Clock::get()?.unix_timestamp;
    let old_price = ctx.accounts.oracle.price;

    // Minimum time between updates
    if ctx.accounts.oracle.last_updated > 0 {
        require!(
            now.saturating_sub(ctx.accounts.oracle.last_updated) >= MIN_ORACLE_UPDATE_INTERVAL,
            ErrorCode::OracleUpdateTooFrequent
        );
    }

    // Max deviation check (skip on first update when old_price is 0)
    if old_price > 0 {
        let diff = if price > old_price { price - old_price } else { old_price - price };
        let max_change = old_price
            .checked_mul(MAX_ORACLE_DEVIATION_BPS)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10_000)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(diff <= max_change, ErrorCode::OraclePriceDeviation);
    }

    let oracle = &mut ctx.accounts.oracle;
    oracle.price = price;
    oracle.last_updated = now;

    let protocol = &mut ctx.accounts.protocol_state;
    protocol.last_oracle_update = now;

    // Auto-unpause only if paused by staleness (not manual admin pause)
    if protocol.is_paused && !protocol.manual_pause {
        protocol.is_paused = false;
        msg!("Protocol auto-unpaused by oracle update");
    }

    emit!(OracleUpdated {
        old_price,
        new_price: price,
        timestamp: now,
    });

    msg!("Oracle updated: {} -> {} at {}", old_price, price, now);
    Ok(())
}
