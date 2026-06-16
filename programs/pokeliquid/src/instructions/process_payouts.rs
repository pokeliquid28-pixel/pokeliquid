use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    state::{LiquidityPool, PayoutQueue, ProtocolState},
};

#[derive(Accounts)]
pub struct ProcessPayouts<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [PAYOUT_QUEUE_SEED],
        bump = payout_queue.bump,
    )]
    pub payout_queue: Box<Account<'info, PayoutQueue>>,

    #[account(
        mut,
        seeds = [LP_POOL_SEED],
        bump = liquidity_pool.bump,
    )]
    pub liquidity_pool: Account<'info, LiquidityPool>,

    #[account(
        mut,
        seeds = [LP_VAULT_SEED],
        bump = liquidity_pool.vault_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub lp_vault: Account<'info, TokenAccount>,

    /// The user's USDC token account — must match the head of the queue.
    #[account(
        mut,
        token::mint = protocol_state.usdc_mint,
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ProcessPayouts>) -> Result<()> {
    let queue = &mut ctx.accounts.payout_queue;

    if queue.count == 0 {
        msg!("Payout queue is empty");
        return Ok(());
    }

    let head = queue.head as usize;
    let entry_user_ata = queue.entries[head].user_ata;
    let entry_user = queue.entries[head].user;
    let entry_amount = queue.entries[head].amount;

    // Validate the user_token_account matches the queue entry
    require!(
        ctx.accounts.user_token_account.key() == entry_user_ata,
        crate::error::ErrorCode::Unauthorized
    );

    let available = ctx.accounts.lp_vault.amount;
    if available == 0 {
        msg!("LP vault empty, nothing to process");
        return Ok(());
    }

    let pay_amount = entry_amount.min(available);

    let protocol_bump = ctx.accounts.protocol_state.bump;
    let seeds = &[PROTOCOL_SEED, &[protocol_bump]];
    let signer = &[&seeds[..]];

    // Transfer from lp_vault directly to user's token account
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.key(),
        Transfer {
            from: ctx.accounts.lp_vault.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.protocol_state.to_account_info(),
        },
        signer,
    );
    token::transfer(cpi_ctx, pay_amount)?;

    ctx.accounts.liquidity_pool.total_usdc = ctx
        .accounts
        .liquidity_pool
        .total_usdc
        .saturating_sub(pay_amount);

    if pay_amount >= entry_amount {
        queue.pop();
        msg!("Payout fully processed: {} to {}", pay_amount, entry_user);
    } else {
        queue.entries[head].amount = entry_amount - pay_amount;
        msg!("Partial payout: {} of {} to {}", pay_amount, entry_amount, entry_user);
    }

    Ok(())
}
