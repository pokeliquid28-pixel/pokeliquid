use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::LpWithdrawn,
    state::{LiquidityPool, LpPosition, ProtocolState},
};

#[derive(Accounts)]
pub struct LpWithdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [LP_POOL_SEED],
        bump = liquidity_pool.bump,
    )]
    pub liquidity_pool: Account<'info, LiquidityPool>,

    #[account(
        mut,
        seeds = [LP_SEED, user.key().as_ref()],
        bump = lp_position.bump,
        constraint = lp_position.owner == user.key() @ ErrorCode::Unauthorized,
    )]
    pub lp_position: Account<'info, LpPosition>,

    #[account(
        mut,
        token::mint = protocol_state.usdc_mint,
        token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [LP_VAULT_SEED],
        bump = liquidity_pool.vault_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub lp_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<LpWithdraw>, shares: u64) -> Result<()> {
    let lp = &ctx.accounts.lp_position;
    let pool = &ctx.accounts.liquidity_pool;

    require!(shares > 0, ErrorCode::InsufficientShares);
    require!(lp.shares >= shares, ErrorCode::InsufficientShares);
    require!(pool.total_shares > 0, ErrorCode::MathOverflow);

    // Calculate USDC to return: shares * total_usdc / total_shares
    let usdc_out = (shares as u128)
        .checked_mul(pool.total_usdc as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(pool.total_shares as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    require!(
        ctx.accounts.lp_vault.amount >= usdc_out,
        ErrorCode::InsufficientPoolBalance
    );

    // Transfer USDC from lp_vault to user
    let protocol_bump = ctx.accounts.protocol_state.bump;
    let seeds = &[PROTOCOL_SEED, &[protocol_bump]];
    let signer = &[&seeds[..]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.lp_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.protocol_state.to_account_info(),
        },
        signer,
    );
    token::transfer(cpi_ctx, usdc_out)?;

    // Update LP position
    let lp = &mut ctx.accounts.lp_position;
    lp.shares = lp.shares.checked_sub(shares).ok_or(ErrorCode::MathOverflow)?;

    // Update pool
    let pool = &mut ctx.accounts.liquidity_pool;
    pool.total_usdc = pool.total_usdc.saturating_sub(usdc_out);
    pool.total_shares = pool.total_shares.checked_sub(shares).ok_or(ErrorCode::MathOverflow)?;

    emit!(LpWithdrawn {
        user: ctx.accounts.user.key(),
        shares,
        usdc_out,
        total_usdc: pool.total_usdc,
    });

    msg!("LP withdraw: {} shares → {} USDC. Pool TVL: {}", shares, usdc_out, pool.total_usdc);
    Ok(())
}
