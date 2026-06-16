use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{ProtocolState, ReferralAccount},
};

#[derive(Accounts)]
#[instruction(referral_owner: Pubkey)]
pub struct SetFeeShare<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [REFERRAL_SEED, referral_owner.as_ref()],
        bump = referral_account.bump,
    )]
    pub referral_account: Account<'info, ReferralAccount>,
}

pub fn handler(ctx: Context<SetFeeShare>, _referral_owner: Pubkey, fee_share_bps: u64) -> Result<()> {
    require!(fee_share_bps <= 3_000, ErrorCode::InvalidFeeShare);

    let old_bps = ctx.accounts.referral_account.fee_share_bps;
    ctx.accounts.referral_account.fee_share_bps = fee_share_bps;

    msg!(
        "Fee share updated for {}: {} -> {} bps",
        ctx.accounts.referral_account.owner,
        old_bps,
        fee_share_bps
    );
    Ok(())
}
