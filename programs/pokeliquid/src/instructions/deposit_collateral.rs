use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    state::{MarginAccount, ProtocolState},
};

#[derive(Accounts)]
pub struct DepositCollateral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Box<Account<'info, ProtocolState>>,

    #[account(
        init_if_needed,
        payer = user,
        space = MarginAccount::SPACE,
        seeds = [MARGIN_SEED, user.key().as_ref()],
        bump,
    )]
    pub margin_account: Account<'info, MarginAccount>,

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
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.protocol_state.is_paused, ErrorCode::ProtocolPaused);
    require!(amount > 0, ErrorCode::InsufficientCollateral);

    // Transfer USDC from user to fee_vault
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.fee_vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, amount)?;

    // Update margin account
    let margin = &mut ctx.accounts.margin_account;
    if margin.owner == Pubkey::default() {
        margin.owner = ctx.accounts.user.key();
        margin.collateral = 0;
        margin.positions = [None, None, None, None, None];
        margin.bump = ctx.bumps.margin_account;
    }
    margin.collateral = margin
        .collateral
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    // Track user funds in fee_vault
    ctx.accounts.protocol_state.total_user_collateral = ctx
        .accounts
        .protocol_state
        .total_user_collateral
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    msg!("Deposited {} USDC. New collateral: {}", amount, margin.collateral);
    Ok(())
}
