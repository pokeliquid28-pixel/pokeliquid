use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::ReferralClaimed,
    state::{ProtocolState, ReferralAccount},
};

#[derive(Accounts)]
pub struct ClaimReferral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [REFERRAL_SEED, user.key().as_ref()],
        bump = referral_account.bump,
        constraint = referral_account.owner == user.key() @ ErrorCode::Unauthorized,
    )]
    pub referral_account: Account<'info, ReferralAccount>,

    /// User's USDC token account to receive fees
    #[account(
        mut,
        token::mint = protocol_state.usdc_mint,
        token::authority = user,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Fee vault holds the USDC (referral fees stay in fee_vault until claimed)
    #[account(
        mut,
        seeds = [FEE_VAULT_SEED],
        bump = protocol_state.fee_vault_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimReferral>) -> Result<()> {
    let referral = &ctx.accounts.referral_account;
    let amount = referral.pending_fees;
    require!(amount > 0, ErrorCode::NoReferralFees);

    // Transfer from fee_vault to user
    let seeds = &[PROTOCOL_SEED, &[ctx.accounts.protocol_state.bump]];
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

    // Update referral account
    let referral = &mut ctx.accounts.referral_account;
    referral.pending_fees = 0;

    // Decrement protocol-level referral reserve
    ctx.accounts.protocol_state.total_referral_pending = ctx
        .accounts
        .protocol_state
        .total_referral_pending
        .saturating_sub(amount);

    emit!(ReferralClaimed {
        user: ctx.accounts.user.key(),
        amount,
    });

    msg!("Referral fees claimed: {}", amount);
    Ok(())
}
