use anchor_lang::prelude::*;
use crate::{constants::*, error::ErrorCode, state::{ProtocolParams, ProtocolState, Timelock}};

#[derive(Accounts)]
pub struct ProposeParams<'info> {
    #[account(mut)]
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

pub fn handler(ctx: Context<ProposeParams>, params: ProtocolParams) -> Result<()> {
    // Validate bounds (same as update_params)
    if let Some(v) = params.fee_bps {
        require!(v <= 500, ErrorCode::InvalidParam);
    }
    if let Some(v) = params.base_funding_rate_per_hour {
        require!(v <= 10_000, ErrorCode::InvalidParam);
    }
    if let Some(v) = params.skew_factor {
        require!(v <= 100_000, ErrorCode::InvalidParam);
    }
    if let Some(v) = params.profit_cap_bps {
        require!(v >= 5_000 && v <= 100_000, ErrorCode::InvalidParam);
    }
    if let Some(v) = params.insurance_fund_bps {
        require!(v <= 5_000, ErrorCode::InvalidParam);
    }
    if let Some(v) = params.lp_fee_bps {
        require!(v <= 8_000, ErrorCode::InvalidParam);
    }

    let now = Clock::get()?.unix_timestamp;
    let tl = &mut ctx.accounts.timelock;
    tl.pending_params = Some(params);
    tl.params_execute_after = now + TIMELOCK_DELAY;

    msg!("Params proposed — executable after {}", tl.params_execute_after);
    Ok(())
}
