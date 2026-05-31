use anchor_lang::prelude::*;

use crate::constants::*;

/// Closes any margin account PDA (regardless of size/schema) and returns rent to the user.
/// This is needed to migrate from old single-position accounts (125 bytes) to new
/// multi-position accounts (296 bytes).
#[derive(Accounts)]
pub struct CloseMarginAccount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: We manually verify the PDA seeds. This avoids deserialization so it works
    /// with both old (125-byte) and new (296-byte) margin account layouts.
    #[account(
        mut,
        seeds = [MARGIN_SEED, user.key().as_ref()],
        bump,
    )]
    pub margin_account: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CloseMarginAccount>) -> Result<()> {
    let margin_info = ctx.accounts.margin_account.to_account_info();
    let user_info = ctx.accounts.user.to_account_info();

    // Transfer all lamports from margin account to user
    let lamports = margin_info.lamports();
    **margin_info.try_borrow_mut_lamports()? = 0;
    **user_info.try_borrow_mut_lamports()? = user_info
        .lamports()
        .checked_add(lamports)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Zero out the account data so the runtime garbage-collects it
    margin_info.assign(&anchor_lang::solana_program::system_program::ID);
    let mut data = margin_info.try_borrow_mut_data()?;
    for byte in data.iter_mut() {
        *byte = 0;
    }

    msg!("Margin account closed, {} lamports returned", lamports);
    Ok(())
}
