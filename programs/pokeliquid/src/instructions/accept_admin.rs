use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::ProtocolState,
};

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    pub new_admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.pending_admin == Some(new_admin.key()) @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn handler(ctx: Context<AcceptAdmin>) -> Result<()> {
    let state = &mut ctx.accounts.protocol_state;
    let old_admin = state.admin;
    state.admin = ctx.accounts.new_admin.key();
    state.pending_admin = None;
    msg!("Admin transferred from {} to {}", old_admin, state.admin);
    Ok(())
}
