use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::LpDeposited,
    state::{LiquidityPool, LpPosition, ProtocolState},
};

#[derive(Accounts)]
pub struct LpDeposit<'info> {
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
        init_if_needed,
        payer = user,
        space = LpPosition::SPACE,
        seeds = [LP_SEED, user.key().as_ref()],
        bump,
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
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<LpDeposit>, amount: u64) -> Result<()> {
    require!(amount > 0, ErrorCode::InsufficientCollateral);

    let pool = &ctx.accounts.liquidity_pool;

    // Minimum first deposit to prevent share inflation attack
    if pool.total_shares == 0 {
        require!(amount >= 10_000_000, ErrorCode::MinFirstDeposit); // 10 USDC minimum
    }

    // Calculate shares
    let shares = if pool.total_shares == 0 {
        amount
    } else {
        (amount as u128)
            .checked_mul(pool.total_shares as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(pool.total_usdc as u128)
            .ok_or(ErrorCode::MathOverflow)? as u64
    };

    require!(shares > 0, ErrorCode::MathOverflow);

    // Snapshot existing unclaimed fees before share changes (MasterChef-style)
    let lp = &ctx.accounts.lp_position;
    let old_pending = if lp.shares > 0 && pool.acc_fee_per_share > 0 {
        (lp.shares as u128)
            .checked_mul(pool.acc_fee_per_share)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(crate::state::FEE_PER_SHARE_PRECISION)
            .ok_or(ErrorCode::MathOverflow)?
            .saturating_sub(lp.reward_debt)
    } else {
        0u128
    };

    // Transfer USDC from user to lp_vault
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.lp_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, amount)?;

    // Update LP position
    let lp = &mut ctx.accounts.lp_position;
    if lp.owner == Pubkey::default() {
        lp.owner = ctx.accounts.user.key();
        lp.shares = 0;
        lp.usdc_deposited = 0;
        lp.fees_claimed = 0;
        lp.bump = ctx.bumps.lp_position;
    }
    lp.shares = lp.shares.checked_add(shares).ok_or(ErrorCode::MathOverflow)?;
    lp.usdc_deposited = lp.usdc_deposited.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;

    // Update pool
    let pool = &mut ctx.accounts.liquidity_pool;
    pool.total_usdc = pool.total_usdc.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
    pool.total_shares = pool.total_shares.checked_add(shares).ok_or(ErrorCode::MathOverflow)?;

    // MasterChef: set reward_debt so new shares can't claim historical fees,
    // but preserve any pending (unclaimed) fees from before this deposit.
    let new_total_debt = (lp.shares as u128)
        .checked_mul(pool.acc_fee_per_share)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(crate::state::FEE_PER_SHARE_PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;
    lp.reward_debt = new_total_debt.saturating_sub(old_pending);

    emit!(LpDeposited {
        user: ctx.accounts.user.key(),
        amount,
        shares,
        total_usdc: pool.total_usdc,
    });

    msg!("LP deposit: {} USDC → {} shares. Pool TVL: {}", amount, shares, pool.total_usdc);
    Ok(())
}
