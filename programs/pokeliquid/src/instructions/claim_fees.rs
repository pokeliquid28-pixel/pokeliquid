use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::FeesClaimed,
    state::{LiquidityPool, LpPosition, ProtocolState},
};

#[derive(Accounts)]
pub struct ClaimFees<'info> {
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
        seeds = [FEE_VAULT_SEED],
        bump = protocol_state.fee_vault_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimFees>) -> Result<()> {
    let pool = &ctx.accounts.liquidity_pool;
    let lp = &ctx.accounts.lp_position;

    require!(pool.total_shares > 0, ErrorCode::NoFeesToClaim);
    require!(lp.shares > 0, ErrorCode::NoFeesToClaim);

    // User's proportional share of accumulated fees
    let total_entitled = (lp.shares as u128)
        .checked_mul(pool.accumulated_fees as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(pool.total_shares as u128)
        .ok_or(ErrorCode::MathOverflow)? as u64;

    let claimable = total_entitled.saturating_sub(lp.fees_claimed);
    require!(claimable > 0, ErrorCode::NoFeesToClaim);

    // Cap at available vault balance
    let actual_claim = claimable.min(ctx.accounts.fee_vault.amount);

    // Transfer from fee_vault to user
    let protocol_bump = ctx.accounts.protocol_state.bump;
    let seeds = &[PROTOCOL_SEED, &[protocol_bump]];
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
    token::transfer(cpi_ctx, actual_claim)?;

    // Update LP position
    let lp = &mut ctx.accounts.lp_position;
    lp.fees_claimed = lp.fees_claimed.checked_add(actual_claim).ok_or(ErrorCode::MathOverflow)?;

    // Track total claimed across all LPs for fee reservation
    let pool = &mut ctx.accounts.liquidity_pool;
    pool.total_fees_claimed = pool
        .total_fees_claimed
        .checked_add(actual_claim)
        .ok_or(ErrorCode::MathOverflow)?;

    emit!(FeesClaimed {
        user: ctx.accounts.user.key(),
        amount: actual_claim,
    });

    msg!("LP fees claimed: {} USDC", actual_claim);
    Ok(())
}
