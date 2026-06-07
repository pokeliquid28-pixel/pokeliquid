use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{OracleAccount, ProtocolState},
};

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct InitMarketOracle<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        init,
        payer = admin,
        space = OracleAccount::SPACE,
        seeds = [ORACLE_SEED, market_id.as_bytes()],
        bump,
    )]
    pub oracle: Account<'info, OracleAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitMarketOracle>, market_id: String, seed_price: u64) -> Result<()> {
    require!(seed_price > 0, ErrorCode::InvalidOraclePrice);

    let now = Clock::get()?.unix_timestamp;
    let oracle = &mut ctx.accounts.oracle;
    oracle.price = seed_price;
    oracle.last_updated = now;
    oracle.staleness_threshold = DEFAULT_STALENESS_THRESHOLD;
    oracle.bump = ctx.bumps.oracle;

    msg!("Market oracle initialized: {} at price {}", market_id, seed_price);
    msg!("Oracle PDA: {}", oracle.key());
    Ok(())
}
