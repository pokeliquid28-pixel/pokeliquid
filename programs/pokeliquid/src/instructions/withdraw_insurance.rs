use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    state::ProtocolState,
};

#[derive(Accounts)]
pub struct WithdrawInsurance<'info> {
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
        seeds = [INSURANCE_FUND_SEED],
        bump = protocol_state.insurance_fund_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub insurance_fund: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = protocol_state.usdc_mint,
        token::authority = admin,
    )]
    pub admin_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<WithdrawInsurance>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.insurance_fund.amount >= amount,
        ErrorCode::InsufficientVaultBalance
    );

    // Reserve 10% of total OI as insurance buffer
    let total_oi = ctx.accounts.protocol_state.total_long_exposure
        .checked_add(ctx.accounts.protocol_state.total_short_exposure)
        .ok_or(ErrorCode::MathOverflow)?;
    let min_reserve = total_oi / 10; // 10% of OI
    let remaining = ctx.accounts.insurance_fund.amount.saturating_sub(amount);
    require!(remaining >= min_reserve, ErrorCode::InsuranceReserveViolation);

    msg!(
        "WARNING: Admin withdrawing {} USDC from insurance fund. Balance before: {}",
        amount,
        ctx.accounts.insurance_fund.amount
    );

    let protocol = &ctx.accounts.protocol_state;
    let seeds = &[PROTOCOL_SEED, &[protocol.bump]];
    let signer = &[&seeds[..]];

    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.insurance_fund.to_account_info(),
            to: ctx.accounts.admin_token_account.to_account_info(),
            authority: ctx.accounts.protocol_state.to_account_info(),
        },
        signer,
    );
    token::transfer(cpi_ctx, amount)?;

    Ok(())
}
