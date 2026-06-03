use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::PositionOpened,
    state::{Direction, LiquidityPool, MarginAccount, OracleAccount, Position, ProtocolState},
};

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Box<Account<'info, ProtocolState>>,

    #[account(
        mut,
        seeds = [MARGIN_SEED, user.key().as_ref()],
        bump = margin_account.bump,
        constraint = margin_account.owner == user.key() @ ErrorCode::Unauthorized,
    )]
    pub margin_account: Box<Account<'info, MarginAccount>>,

    pub oracle: Account<'info, OracleAccount>,

    #[account(
        mut,
        seeds = [FEE_VAULT_SEED],
        bump = protocol_state.fee_vault_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [INSURANCE_FUND_SEED],
        bump = protocol_state.insurance_fund_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub insurance_fund: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [LP_POOL_SEED],
        bump = liquidity_pool.bump,
    )]
    pub liquidity_pool: Account<'info, LiquidityPool>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<OpenPosition>,
    direction: Direction,
    collateral: u64,
    leverage: u8,
    sl_price: Option<u64>,
    tp_price: Option<u64>,
) -> Result<()> {
    let protocol = &ctx.accounts.protocol_state;

    require!(!protocol.is_paused, ErrorCode::ProtocolPaused);
    require!(leverage >= 1, ErrorCode::BelowMinLeverage);
    require!(leverage <= 10, ErrorCode::AboveMaxLeverage);
    require!(collateral >= protocol.min_position_size, ErrorCode::BelowMinPositionSize);
    require!(
        ctx.accounts.margin_account.collateral >= collateral,
        ErrorCode::InsufficientCollateral
    );

    // Find first empty slot
    let slot = ctx.accounts.margin_account
        .first_open_slot()
        .ok_or(ErrorCode::PositionSlotsFull)?;

    // Check oracle freshness
    let now = Clock::get()?.unix_timestamp;
    let oracle = &ctx.accounts.oracle;
    require!(
        oracle.last_updated > 0
            && now.saturating_sub(oracle.last_updated) <= oracle.staleness_threshold,
        ErrorCode::PriceStale
    );

    let entry_price = oracle.price;

    // Validate SL/TP if provided
    if let Some(sl) = sl_price {
        match direction {
            Direction::Long => require!(sl < entry_price, ErrorCode::InvalidStopLoss),
            Direction::Short => require!(sl > entry_price, ErrorCode::InvalidStopLoss),
        }
    }
    if let Some(tp) = tp_price {
        match direction {
            Direction::Long => require!(tp > entry_price, ErrorCode::InvalidTakeProfit),
            Direction::Short => require!(tp < entry_price, ErrorCode::InvalidTakeProfit),
        }
    }

    // Notional = collateral * leverage
    let notional = collateral
        .checked_mul(leverage as u64)
        .ok_or(ErrorCode::MathOverflow)?;

    // Exposure check
    match direction {
        Direction::Long => {
            let new_exposure = protocol
                .total_long_exposure
                .checked_add(notional)
                .ok_or(ErrorCode::MathOverflow)?;
            require!(new_exposure <= protocol.max_long_exposure, ErrorCode::ExceedsMaxExposure);
        }
        Direction::Short => {
            let new_exposure = protocol
                .total_short_exposure
                .checked_add(notional)
                .ok_or(ErrorCode::MathOverflow)?;
            require!(new_exposure <= protocol.max_short_exposure, ErrorCode::ExceedsMaxExposure);
        }
    }

    // Open fee = fee_bps * collateral / 10000
    let fee_amount = collateral
        .checked_mul(protocol.fee_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    // Fee split: 30% LP pool, 60% fee_vault, 10% insurance
    let lp_portion = fee_amount
        .checked_mul(ctx.accounts.liquidity_pool.lp_fee_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    let insurance_portion = fee_amount
        .checked_mul(protocol.insurance_fund_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    let seeds = &[PROTOCOL_SEED, &[protocol.bump]];
    let signer = &[&seeds[..]];

    // Transfer insurance portion from fee_vault to insurance_fund
    if insurance_portion > 0 {
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.fee_vault.to_account_info(),
                to: ctx.accounts.insurance_fund.to_account_info(),
                authority: ctx.accounts.protocol_state.to_account_info(),
            },
            signer,
        );
        token::transfer(cpi_ctx, insurance_portion)?;
    }

    // Record LP fee portion (stays in fee_vault, tracked in accumulated_fees)
    if lp_portion > 0 {
        ctx.accounts.liquidity_pool.accumulated_fees = ctx
            .accounts
            .liquidity_pool
            .accumulated_fees
            .checked_add(lp_portion)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    // Deduct fee + record position collateral (net of fee) in margin account
    let margin = &mut ctx.accounts.margin_account;
    margin.collateral = margin
        .collateral
        .checked_sub(collateral)
        .ok_or(ErrorCode::MathOverflow)?;

    let position_collateral = collateral
        .checked_sub(fee_amount)
        .ok_or(ErrorCode::MathOverflow)?;

    margin.positions[slot] = Some(Position {
        direction: direction.clone(),
        collateral: position_collateral,
        notional,
        leverage,
        entry_price,
        open_timestamp: now,
        last_funding_timestamp: now,
        sl_price,
        tp_price,
    });

    // Update global exposure
    let protocol = &mut ctx.accounts.protocol_state;
    match direction {
        Direction::Long => {
            protocol.total_long_exposure = protocol
                .total_long_exposure
                .checked_add(notional)
                .ok_or(ErrorCode::MathOverflow)?;
        }
        Direction::Short => {
            protocol.total_short_exposure = protocol
                .total_short_exposure
                .checked_add(notional)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }

    emit!(PositionOpened {
        user: ctx.accounts.user.key(),
        direction,
        collateral: position_collateral,
        notional,
        leverage,
        entry_price,
        fee_paid: fee_amount,
        timestamp: now,
    });

    msg!(
        "Position opened in slot {}: {:?} {}x notional={} entry={}",
        slot,
        ctx.accounts.margin_account.positions[slot].as_ref().unwrap().direction,
        leverage,
        notional,
        entry_price
    );

    Ok(())
}
