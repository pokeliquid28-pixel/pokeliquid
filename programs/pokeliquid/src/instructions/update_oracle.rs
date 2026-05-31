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
    let old_price = ctx.accounts.oracle.price;
    let now = Clock::get()?.unix_timestamp;

    let oracle = &mut ctx.accounts.oracle;
    oracle.price = price;
    oracle.last_updated = now;

    let protocol = &mut ctx.accounts.protocol_state;
    protocol.last_oracle_update = now;

    // Auto-unpause if protocol was paused due to stale oracle
    if protocol.is_paused {
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
