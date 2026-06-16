use anchor_lang::prelude::*;
use crate::{constants::*, error::ErrorCode, state::{ProtocolState, Timelock}};

#[derive(Accounts)]
pub struct InitTimelock<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        init,
        payer = admin,
        space = Timelock::SPACE,
        seeds = [TIMELOCK_SEED],
        bump,
    )]
    pub timelock: Box<Account<'info, Timelock>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitTimelock>) -> Result<()> {
    let tl = &mut ctx.accounts.timelock;
    tl.pending_params = None;
    tl.params_execute_after = 0;
    tl.pending_fee_withdrawal = 0;
    tl.fee_execute_after = 0;
    tl.pending_insurance_withdrawal = 0;
    tl.insurance_execute_after = 0;
    tl.bump = ctx.bumps.timelock;
    msg!("Timelock initialized (24h delay)");
    Ok(())
}
