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

pub fn handler(ctx: Context<InitMarketOracle>, market_id: String) -> Result<()> {
    let oracle = &mut ctx.accounts.oracle;
    oracle.price = 0;
    oracle.last_updated = 0;
    oracle.staleness_threshold = DEFAULT_STALENESS_THRESHOLD;
    oracle.bump = ctx.bumps.oracle;

    msg!("Market oracle initialized: {}", market_id);
    msg!("Oracle PDA: {}", oracle.key());
    Ok(())
}
