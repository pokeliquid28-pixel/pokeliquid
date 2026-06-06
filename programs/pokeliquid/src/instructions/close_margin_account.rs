use anchor_lang::prelude::*;

use crate::constants::*;
use crate::state::Position;

/// Closes any margin account PDA (regardless of size/schema) and returns rent to the user.
/// Safety: refuses to close if collateral > 0 or any position slot is occupied.
#[derive(Accounts)]
pub struct CloseMarginAccount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: We manually verify the PDA seeds. This avoids deserialization so it works
    /// with any margin account layout size.
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
    let data = margin_info.try_borrow_data()?;

    // Layout: 8 disc + 32 owner + 8 collateral + positions... + bump + padding
    // Minimum size to read collateral and position tags
    if data.len() >= 48 {
        // Check collateral (u64 LE at offset 40)
        let collateral = u64::from_le_bytes(data[40..48].try_into().unwrap());
        require!(collateral == 0, ErrorCode::ConstraintRaw);

        // Check position option tags — stride depends on schema size
        let pos_start = 48usize;
        // New schema: Position has oracle (92 bytes), old: no oracle (60 bytes)
        let slot_size = if data.len() >= 546 {
            1 + Position::SPACE // 1 + 92 = 93
        } else {
            1 + 60 // old schema
        };

        for i in 0..5usize {
            let tag_offset = pos_start + i * slot_size;
            if tag_offset < data.len() && data[tag_offset] == 1 {
                // Position slot is Some — cannot close
                msg!("Cannot close: position slot {} is occupied", i);
                return Err(ErrorCode::ConstraintRaw.into());
            }
        }
    }

    drop(data);

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
