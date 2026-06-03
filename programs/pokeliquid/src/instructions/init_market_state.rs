use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{MarketState, OracleAccount, ProtocolState},
};

#[derive(Accounts)]
#[instruction(market_id: String)]
pub struct InitMarketState<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        seeds = [ORACLE_SEED, market_id.as_bytes()],
        bump = oracle.bump,
    )]
    pub oracle: Account<'info, OracleAccount>,

    #[account(
        init,
        payer = admin,
        space = MarketState::SPACE,
        seeds = [MARKET_SEED, market_id.as_bytes()],
        bump,
    )]
    pub market_state: Account<'info, MarketState>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitMarketState>, market_id: String, max_long_oi: u64, max_short_oi: u64) -> Result<()> {
    let market = &mut ctx.accounts.market_state;

    let mut id_bytes = [0u8; 32];
    let src = market_id.as_bytes();
    let len = src.len().min(32);
    id_bytes[..len].copy_from_slice(&src[..len]);

    market.market_id = id_bytes;
    market.oracle = ctx.accounts.oracle.key();
    market.long_open_interest = 0;
    market.short_open_interest = 0;
    market.max_long_oi = max_long_oi;
    market.max_short_oi = max_short_oi;
    market.bump = ctx.bumps.market_state;

    msg!("MarketState initialized: {} oracle={}", market_id, market.oracle);
    Ok(())
}
