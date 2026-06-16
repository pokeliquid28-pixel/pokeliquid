use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};

use crate::{
    constants::*,
    error::ErrorCode,
    state::ReferralAccount,
};

#[derive(Accounts)]
pub struct MigrateReferral<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Only used to derive the PDA seed.
    pub referral_owner: UncheckedAccount<'info>,

    /// CHECK: Validated manually — old account may not deserialize with new struct.
    #[account(mut)]
    pub referral_account: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<MigrateReferral>) -> Result<()> {
    let referral_info = &ctx.accounts.referral_account;
    let referral_owner = &ctx.accounts.referral_owner;

    // Verify PDA
    let (expected_pda, bump) = Pubkey::find_program_address(
        &[REFERRAL_SEED, referral_owner.key().as_ref()],
        ctx.program_id,
    );
    require!(referral_info.key() == expected_pda, ErrorCode::Unauthorized);
    require!(referral_info.owner == ctx.program_id, ErrorCode::Unauthorized);

    let current_len = referral_info.data_len();
    let target_len = ReferralAccount::SPACE;

    if current_len >= target_len {
        msg!("Already migrated");
        return Ok(());
    }

    // Verify discriminator
    let disc = ReferralAccount::DISCRIMINATOR;
    {
        let data = referral_info.try_borrow_data()?;
        require!(data.len() >= 8 && data[..8] == *disc, ErrorCode::Unauthorized);
    }

    // Save old data
    let old_data = {
        let data = referral_info.try_borrow_data()?;
        data.to_vec()
    };

    // Transfer lamports out (close the account)
    let dest = ctx.accounts.payer.to_account_info();
    let current_lamports = referral_info.lamports();
    **referral_info.try_borrow_mut_lamports()? = 0;
    **dest.try_borrow_mut_lamports()? = dest.lamports()
        .checked_add(current_lamports)
        .ok_or(ErrorCode::MathOverflow)?;

    // Zero out data and set owner to system program to "close" it
    {
        let mut data = referral_info.try_borrow_mut_data()?;
        for byte in data.iter_mut() {
            *byte = 0;
        }
    }
    referral_info.assign(&anchor_lang::solana_program::system_program::ID);

    // Re-create at new size via CPI
    let rent = Rent::get()?;
    let lamports = rent.minimum_balance(target_len);
    let signer_seeds: &[&[u8]] = &[
        REFERRAL_SEED,
        referral_owner.key.as_ref(),
        &[bump],
    ];

    invoke_signed(
        &system_instruction::create_account(
            &ctx.accounts.payer.key(),
            &expected_pda,
            lamports,
            target_len as u64,
            ctx.program_id,
        ),
        &[
            ctx.accounts.payer.to_account_info(),
            referral_info.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[signer_seeds],
    )?;

    // Copy old data back + zero new fields
    {
        let mut data = referral_info.try_borrow_mut_data()?;
        data[..old_data.len()].copy_from_slice(&old_data);
        // New bytes are already 0 from create_account
    }

    msg!("Referral account migrated: {} -> {} bytes", current_len, target_len);
    Ok(())
}
