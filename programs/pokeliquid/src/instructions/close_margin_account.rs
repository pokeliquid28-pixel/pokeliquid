use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::ErrorCode;
use crate::state::MarginAccount;

/// Closes a margin account PDA and returns rent to the user.
/// Refuses to close if collateral > 0 or any position slot is occupied.
#[derive(Accounts)]
pub struct CloseMarginAccount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [MARGIN_SEED, user.key().as_ref()],
        bump = margin_account.bump,
        constraint = margin_account.owner == user.key() @ ErrorCode::Unauthorized,
        close = user,
    )]
    pub margin_account: Account<'info, MarginAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CloseMarginAccount>) -> Result<()> {
    let margin = &ctx.accounts.margin_account;

    // Must have zero collateral
    require!(margin.collateral == 0, ErrorCode::InsufficientCollateral);

    // Must have no open positions
    for (i, pos) in margin.positions.iter().enumerate() {
        if pos.is_some() {
            msg!("Cannot close: position slot {} is occupied", i);
            return Err(ErrorCode::NoOpenPosition.into());
        }
    }

    // Anchor's `close = user` handles lamport transfer + zeroing
    msg!("Margin account closed");
    Ok(())
}
