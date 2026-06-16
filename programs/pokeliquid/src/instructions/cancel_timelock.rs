use anchor_lang::prelude::*;
use crate::{constants::*, error::ErrorCode, state::{ProtocolState, Timelock}};

#[derive(Accounts)]
pub struct CancelTimelock<'info> {
    pub admin: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [TIMELOCK_SEED],
        bump = timelock.bump,
    )]
    pub timelock: Box<Account<'info, Timelock>>,
}

pub fn handler(ctx: Context<CancelTimelock>) -> Result<()> {
    let tl = &mut ctx.accounts.timelock;
    tl.pending_params = None;
    tl.params_execute_after = 0;
    tl.pending_fee_withdrawal = 0;
    tl.fee_execute_after = 0;
    tl.pending_insurance_withdrawal = 0;
    tl.insurance_execute_after = 0;
    msg!("All pending timelocked actions cancelled");
    Ok(())
}
