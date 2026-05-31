use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{OracleAccount, ProtocolState, ProtocolParams},
};

#[derive(Accounts)]
pub struct UpdateProtocolParams<'info> {
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.admin == admin.key() @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [ORACLE_SEED],
        bump = oracle.bump,
    )]
    pub oracle: Account<'info, OracleAccount>,
}

pub fn handler(ctx: Context<UpdateProtocolParams>, params: ProtocolParams) -> Result<()> {
    let state = &mut ctx.accounts.protocol_state;

    if let Some(v) = params.fee_bps {
        state.fee_bps = v;
    }
    if let Some(v) = params.base_funding_rate_per_hour {
        state.base_funding_rate_per_hour = v;
    }
    if let Some(v) = params.skew_factor {
        state.skew_factor = v;
    }
    if let Some(v) = params.profit_cap_bps {
        state.profit_cap_bps = v;
    }
    if let Some(v) = params.max_long_exposure {
        state.max_long_exposure = v;
    }
    if let Some(v) = params.max_short_exposure {
        state.max_short_exposure = v;
    }
    if let Some(v) = params.min_position_size {
        state.min_position_size = v;
    }
    if let Some(v) = params.is_paused {
        state.is_paused = v;
    }
    if let Some(v) = params.staleness_threshold {
        ctx.accounts.oracle.staleness_threshold = v;
    }
    if let Some(v) = params.secondary_authority {
        state.secondary_authority = v;
    }
    if let Some(v) = params.auto_pause_threshold {
        state.auto_pause_threshold = v;
    }

    msg!("Protocol params updated");
    Ok(())
}
