use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    events::ReferralRegistered,
    state::{ReferralAccount, MAX_USERNAME_LEN},
};

#[derive(Accounts)]
#[instruction(username: String)]
pub struct RegisterReferral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = ReferralAccount::SPACE,
        seeds = [REFERRAL_SEED, user.key().as_ref()],
        bump,
    )]
    pub referral_account: Account<'info, ReferralAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<RegisterReferral>, username: String) -> Result<()> {
    require!(!username.is_empty(), ErrorCode::UsernameEmpty);
    require!(username.len() <= MAX_USERNAME_LEN, ErrorCode::UsernameTooLong);

    let referral = &mut ctx.accounts.referral_account;
    referral.owner = ctx.accounts.user.key();
    referral.pending_fees = 0;
    referral.total_earned = 0;
    referral.total_referrals = 0;
    referral.bump = ctx.bumps.referral_account;

    // Copy username bytes
    let username_bytes = username.as_bytes();
    referral.username_len = username_bytes.len() as u8;
    referral.username[..username_bytes.len()].copy_from_slice(username_bytes);

    emit!(ReferralRegistered {
        user: ctx.accounts.user.key(),
        username,
    });

    Ok(())
}
