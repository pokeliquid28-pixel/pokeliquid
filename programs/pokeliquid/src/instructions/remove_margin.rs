use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{MarginAccount, OracleAccount, ProtocolState, MAX_POSITIONS},
    instructions::close_position::compute_pnl,
};

#[derive(Accounts)]
pub struct RemoveMargin<'info> {
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

    pub oracle: Account<'info, OracleAccount>,
}

pub fn handler(ctx: Context<RemoveMargin>, position_index: u8, amount: u64) -> Result<()> {
    let idx = position_index as usize;
    require!(idx < MAX_POSITIONS, ErrorCode::InvalidPositionIndex);
    require!(amount > 0, ErrorCode::InsufficientCollateral);

    let oracle = &ctx.accounts.oracle;
    let now = Clock::get()?.unix_timestamp;
    require!(
        oracle.last_updated > 0
            && now.saturating_sub(oracle.last_updated) <= oracle.staleness_threshold,
        ErrorCode::PriceStale
    );

    let margin = &mut ctx.accounts.margin_account;
    let position = margin.positions[idx]
        .as_ref()
        .ok_or(ErrorCode::NoOpenPosition)?;

    // Ensure the oracle matches the one used when position was opened
    require!(oracle.key() == position.oracle, ErrorCode::MarketOracleMismatch);

    require!(position.collateral > amount, ErrorCode::InsufficientCollateral);

    // Check that remaining collateral keeps position above liquidation threshold
    let remaining_collateral = position.collateral - amount;
    let pnl = compute_pnl(&position.direction, oracle.price, position.entry_price, position.notional)?;

    let equity = remaining_collateral as i128 + pnl;
    let min_equity = (position.notional as i128)
        .checked_mul(LIQUIDATION_THRESHOLD_BPS as i128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    require!(equity > min_equity, ErrorCode::InsufficientCollateral);

    // Safe to remove — update position then margin
    let position = margin.positions[idx].as_mut().unwrap();
    position.collateral = remaining_collateral;
    let pos_collateral = position.collateral;

    margin.collateral = margin.collateral.checked_add(amount).ok_or(ErrorCode::MathOverflow)?;
    let free_collateral = margin.collateral;

    msg!(
        "Removed {} margin from position [{}]. Position collateral: {}, free collateral: {}",
        amount, idx, pos_collateral, free_collateral
    );
    Ok(())
}
