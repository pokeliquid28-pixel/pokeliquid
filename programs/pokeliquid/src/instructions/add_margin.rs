use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{MarginAccount, ProtocolState, MAX_POSITIONS},
};

#[derive(Accounts)]
pub struct AddMargin<'info> {
    #[account(mut)]
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
}

pub fn handler(ctx: Context<AddMargin>, position_index: u8, amount: u64) -> Result<()> {
    let idx = position_index as usize;
    require!(idx < MAX_POSITIONS, ErrorCode::InvalidPositionIndex);
    require!(amount > 0, ErrorCode::InsufficientCollateral);

    let margin = &mut ctx.accounts.margin_account;
    require!(margin.collateral >= amount, ErrorCode::InsufficientCollateral);
    require!(margin.positions[idx].is_some(), ErrorCode::NoOpenPosition);

    // Update collateral first, then position
    margin.collateral = margin.collateral.checked_sub(amount).ok_or(ErrorCode::MathOverflow)?;

    let position = margin.positions[idx].as_mut().unwrap();
    position.collateral = position.collateral.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;

    let pos_collateral = position.collateral;
    let free_collateral = margin.collateral;

    msg!(
        "Added {} margin to position [{}]. Position collateral: {}, free collateral: {}",
        amount, idx, pos_collateral, free_collateral
    );
    Ok(())
}
