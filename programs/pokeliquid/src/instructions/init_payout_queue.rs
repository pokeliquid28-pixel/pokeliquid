use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{PayoutQueue, ProtocolState},
};

#[derive(Accounts)]
pub struct InitPayoutQueue<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = (protocol_state.admin == admin.key()
            || protocol_state.secondary_authority == admin.key())
            @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        init,
        payer = admin,
        space = PayoutQueue::SPACE,
        seeds = [PAYOUT_QUEUE_SEED],
        bump,
    )]
    pub payout_queue: Box<Account<'info, PayoutQueue>>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitPayoutQueue>) -> Result<()> {
    let q = &mut ctx.accounts.payout_queue;
    q.head = 0;
    q.tail = 0;
    q.count = 0;
    q.bump = ctx.bumps.payout_queue;
    msg!("PayoutQueue initialized");
    Ok(())
}
