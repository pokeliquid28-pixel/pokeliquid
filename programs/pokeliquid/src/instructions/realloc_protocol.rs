use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
};

/// One-time migration: grow ProtocolState to accommodate new fields
/// (pending_admin, total_referral_pending).
/// Uses UncheckedAccount to avoid deserialization failure on undersized data.
#[derive(Accounts)]
pub struct ReallocProtocol<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: We manually verify seeds + owner. Cannot use Account<ProtocolState>
    /// because the on-chain data is too small for the new struct.
    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump,
    )]
    pub protocol_state: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ReallocProtocol>) -> Result<()> {
    let protocol_info = ctx.accounts.protocol_state.to_account_info();

    // Verify program ownership
    require!(
        protocol_info.owner == ctx.program_id,
        ErrorCode::Unauthorized
    );

    // Verify admin from raw bytes: admin pubkey is at offset 8 (after discriminator)
    let data = protocol_info.try_borrow_data()?;
    require!(data.len() >= 40, ErrorCode::Unauthorized);
    let stored_admin = Pubkey::try_from(&data[8..40]).map_err(|_| ErrorCode::Unauthorized)?;
    require!(stored_admin == ctx.accounts.admin.key(), ErrorCode::Unauthorized);
    let old_len = data.len();
    drop(data);

    let new_len: usize = 351;
    if old_len >= new_len {
        msg!("ProtocolState already at target size ({}), no realloc needed", old_len);
        return Ok(());
    }

    // Realloc: in SBF, account data is preceded by a u64 length.
    // We write the new length and zero-fill the extension.
    #[cfg(target_os = "solana")]
    {
        unsafe {
            let data_ptr = protocol_info.try_borrow_mut_data()?.as_mut_ptr();
            // The u64 length prefix is at (data_ptr - 8)
            let len_ptr = data_ptr.offset(-8) as *mut u64;
            *len_ptr = new_len as u64;
            // Zero-fill the new bytes
            std::ptr::write_bytes(data_ptr.add(old_len), 0, new_len - old_len);
        }
    }

    // Fund rent difference
    let rent = Rent::get()?;
    let new_min_balance = rent.minimum_balance(new_len);
    let current_lamports = protocol_info.lamports();
    if new_min_balance > current_lamports {
        let diff = new_min_balance - current_lamports;
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.admin.to_account_info(),
                    to: protocol_info.clone(),
                },
            ),
            diff,
        )?;
    }

    msg!("ProtocolState reallocated from {} to {} bytes", old_len, new_len);
    Ok(())
}
