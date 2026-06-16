use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{LiquidityPool, MarginAccount, ProtocolState},
};

#[derive(Accounts)]
pub struct WithdrawCollateral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Box<Account<'info, ProtocolState>>,

    #[account(
        mut,
        seeds = [MARGIN_SEED, user.key().as_ref()],
        bump = margin_account.bump,
        constraint = margin_account.owner == user.key() @ ErrorCode::Unauthorized,
    )]
    pub margin_account: Box<Account<'info, MarginAccount>>,

    #[account(
        mut,
        token::mint = protocol_state.usdc_mint,
        token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [FEE_VAULT_SEED],
        bump = protocol_state.fee_vault_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    #[account(
        seeds = [LP_POOL_SEED],
        bump = liquidity_pool.bump,
    )]
    pub liquidity_pool: Account<'info, LiquidityPool>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
    let margin = &ctx.accounts.margin_account;

    require!(amount > 0, ErrorCode::InsufficientCollateral);
    require!(amount <= margin.collateral, ErrorCode::InsufficientCollateral);

    // Reserve unclaimed LP fees in fee_vault
    let lp_reserved = ctx.accounts.liquidity_pool.accumulated_fees
        .saturating_sub(ctx.accounts.liquidity_pool.total_fees_claimed);
    let vault_available = ctx.accounts.fee_vault.amount.saturating_sub(lp_reserved);
    require!(
        vault_available >= amount,
        ErrorCode::InsufficientVaultBalance
    );

    let protocol = &ctx.accounts.protocol_state;
    let seeds = &[PROTOCOL_SEED, &[protocol.bump]];
    let signer = &[&seeds[..]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.fee_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.protocol_state.to_account_info(),
        },
        signer,
    );
    token::transfer(cpi_ctx, amount)?;

    let margin = &mut ctx.accounts.margin_account;
    margin.collateral = margin
        .collateral
        .checked_sub(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    // Track user funds in fee_vault
    ctx.accounts.protocol_state.total_user_collateral = ctx
        .accounts
        .protocol_state
        .total_user_collateral
        .saturating_sub(amount);

    msg!("Withdrew {} USDC. Remaining collateral: {}", amount, margin.collateral);
    Ok(())
}
