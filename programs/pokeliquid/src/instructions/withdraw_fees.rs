use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{LiquidityPool, ProtocolState},
};

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [FEE_VAULT_SEED],
        bump = protocol_state.fee_vault_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = protocol_state.usdc_mint,
        token::authority = admin,
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    #[account(
        seeds = [LP_POOL_SEED],
        bump = liquidity_pool.bump,
    )]
    pub liquidity_pool: Account<'info, LiquidityPool>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    // Reserve unclaimed LP fees + user collateral + referral pending fees in fee_vault
    let lp_reserved = ctx.accounts.liquidity_pool.accumulated_fees
        .saturating_sub(ctx.accounts.liquidity_pool.total_fees_claimed);
    let user_reserved = ctx.accounts.protocol_state.total_user_collateral;
    let referral_reserved = ctx.accounts.protocol_state.total_referral_pending;
    let total_reserved = lp_reserved
        .checked_add(user_reserved)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_add(referral_reserved)
        .ok_or(ErrorCode::MathOverflow)?;
    let vault_available = ctx.accounts.fee_vault.amount.saturating_sub(total_reserved);
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
            to: ctx.accounts.admin_token_account.to_account_info(),
            authority: ctx.accounts.protocol_state.to_account_info(),
        },
        signer,
    );
    token::transfer(cpi_ctx, amount)?;

    msg!("Admin withdrew {} USDC from fee vault", amount);
    Ok(())
}
