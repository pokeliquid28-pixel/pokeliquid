use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{LiquidityPool, ProtocolState},
};

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        address = protocol_state.usdc_mint,
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        space = LiquidityPool::SPACE,
        seeds = [LP_POOL_SEED],
        bump,
    )]
    pub liquidity_pool: Account<'info, LiquidityPool>,

    #[account(
        init,
        payer = admin,
        token::mint = usdc_mint,
        token::authority = protocol_state,
        seeds = [LP_VAULT_SEED],
        bump,
    )]
    pub lp_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializePool>) -> Result<()> {
    let pool = &mut ctx.accounts.liquidity_pool;
    pool.total_usdc = 0;
    pool.total_shares = 0;
    pool.accumulated_fees = 0;
    pool.lp_fee_bps = DEFAULT_LP_FEE_BPS;
    pool.bump = ctx.bumps.liquidity_pool;
    pool.vault_bump = ctx.bumps.lp_vault;
    pool.total_fees_claimed = 0;

    msg!("Liquidity pool initialized. lp_vault: {}", ctx.accounts.lp_vault.key());
    Ok(())
}
