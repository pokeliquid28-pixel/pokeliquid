use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    events::SlTpSet,
    state::{Direction, MarginAccount, OracleAccount, ProtocolState, MAX_POSITIONS},
};

#[derive(Accounts)]
pub struct SetSlTp<'info> {
    pub user: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [MARGIN_SEED, user.key().as_ref()],
        bump = margin_account.bump,
        constraint = margin_account.owner == user.key() @ ErrorCode::Unauthorized,
    )]
    pub margin_account: Box<Account<'info, MarginAccount>>,

    pub oracle: Account<'info, OracleAccount>,
}

pub fn handler(
    ctx: Context<SetSlTp>,
    position_index: u8,
    sl_price: Option<u64>,
    tp_price: Option<u64>,
) -> Result<()> {
    let idx = position_index as usize;
    require!(idx < MAX_POSITIONS, ErrorCode::InvalidPositionIndex);

    let margin = &mut ctx.accounts.margin_account;
    require!(margin.positions[idx].is_some(), ErrorCode::NoOpenPosition);

    let position = margin.positions[idx].as_ref().unwrap();
    let current_price = ctx.accounts.oracle.price;
    let direction = position.direction.clone();

    // Validate SL price — allow between entry and current price (enables trailing stops)
    if let Some(sl) = sl_price {
        match direction {
            Direction::Long => {
                // SL must be below current price for long
                require!(sl < current_price, ErrorCode::InvalidStopLoss);
            }
            Direction::Short => {
                // SL must be above current price for short
                require!(sl > current_price, ErrorCode::InvalidStopLoss);
            }
        }
    }

    // Validate TP price
    if let Some(tp) = tp_price {
        match direction {
            Direction::Long => {
                // TP must be above current price for long
                require!(tp > current_price, ErrorCode::InvalidTakeProfit);
            }
            Direction::Short => {
                // TP must be below current price for short
                require!(tp < current_price, ErrorCode::InvalidTakeProfit);
            }
        }
    }

    // Apply
    let position = margin.positions[idx].as_mut().unwrap();
    position.sl_price = sl_price;
    position.tp_price = tp_price;

    emit!(SlTpSet {
        user: ctx.accounts.user.key(),
        position_index,
        sl_price,
        tp_price,
    });

    msg!(
        "SL/TP set for position [{}]: sl={:?} tp={:?}",
        idx,
        sl_price,
        tp_price
    );
    Ok(())
}
