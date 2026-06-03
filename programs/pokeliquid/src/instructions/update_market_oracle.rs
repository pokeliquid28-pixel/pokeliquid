use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    events::OracleUpdated,
    state::{OracleAccount, ProtocolState},
};

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct UpdateMarketOracle<'info> {
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
        seeds = [ORACLE_SEED, market_id.as_bytes()],
        bump = oracle.bump,
    )]
    pub oracle: Account<'info, OracleAccount>,
}

pub fn handler(ctx: Context<UpdateMarketOracle>, _market_id: String, price: u64) -> Result<()> {
    let old_price = ctx.accounts.oracle.price;
    let now = Clock::get()?.unix_timestamp;

    let oracle = &mut ctx.accounts.oracle;
    oracle.price = price;
    oracle.last_updated = now;

    emit!(OracleUpdated {
        old_price,
        new_price: price,
        timestamp: now,
    });

    msg!("Market oracle updated: {} -> {} at {}", old_price, price, now);
    Ok(())
}
