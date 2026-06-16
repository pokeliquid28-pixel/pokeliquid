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

    // MasterChef-style: claimable = shares * acc_fee_per_share / PRECISION - reward_debt
    // Migration: if acc_fee_per_share == 0 but accumulated_fees > 0, this is a pre-upgrade
    // account. Fall back to legacy calculation but cap at (accumulated_fees - total_fees_claimed)
    // proportional share to avoid over-claiming.
    let claimable = if pool.acc_fee_per_share > 0 {
        let entitled = (lp.shares as u128)
            .checked_mul(pool.acc_fee_per_share)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(crate::state::FEE_PER_SHARE_PRECISION)
            .ok_or(ErrorCode::MathOverflow)?;
        entitled.saturating_sub(lp.reward_debt) as u64
    } else {
        // Legacy path: proportional share of unclaimed fees only
        let total_unclaimed = pool.accumulated_fees.saturating_sub(pool.total_fees_claimed);
        if total_unclaimed == 0 {
            0u64
        } else {
            (lp.shares as u128)
                .checked_mul(total_unclaimed as u128)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(pool.total_shares as u128)
                .ok_or(ErrorCode::MathOverflow)? as u64
        }
    };

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

    // Update LP position: set reward_debt to current entitlement
    let lp = &mut ctx.accounts.lp_position;
    lp.fees_claimed = lp.fees_claimed.checked_add(actual_claim).ok_or(ErrorCode::MathOverflow)?;
    if pool.acc_fee_per_share > 0 {
        lp.reward_debt = (lp.shares as u128)
            .checked_mul(pool.acc_fee_per_share)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(crate::state::FEE_PER_SHARE_PRECISION)
            .ok_or(ErrorCode::MathOverflow)?;
    }

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
