use anchor_lang::prelude::*;
use crate::{constants::*, error::ErrorCode, state::{ProtocolState, Timelock}};

#[derive(Accounts)]
pub struct ProposeWithdrawal<'info> {
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

/// vault_type: 0 = fee vault, 1 = insurance fund
pub fn handler(ctx: Context<ProposeWithdrawal>, vault_type: u8, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let tl = &mut ctx.accounts.timelock;

    match vault_type {
        0 => {
            tl.pending_fee_withdrawal = amount;
            tl.fee_execute_after = now + TIMELOCK_DELAY;
            msg!("Fee withdrawal of {} proposed — executable after {}", amount, tl.fee_execute_after);
        }
        1 => {
            tl.pending_insurance_withdrawal = amount;
            tl.insurance_execute_after = now + TIMELOCK_DELAY;
            msg!("Insurance withdrawal of {} proposed — executable after {}", amount, tl.insurance_execute_after);
        }
        _ => return Err(ErrorCode::InvalidParam.into()),
    }

    Ok(())
}
