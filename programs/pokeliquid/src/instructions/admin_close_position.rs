use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::PositionClosed,
    state::{CloseReason, Direction, LiquidityPool, MarginAccount, MarketState, OracleAccount, ProtocolState, MAX_POSITIONS},
    instructions::close_position::compute_pnl,
};

#[derive(Accounts)]
#[instruction(user: Pubkey, position_index: u8)]
pub struct AdminClosePosition<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.admin == authority.key()
            @ ErrorCode::Unauthorized,
    )]
    pub protocol_state: Box<Account<'info, ProtocolState>>,

    #[account(
        mut,
        seeds = [MARGIN_SEED, user.as_ref()],
        bump = margin_account.bump,
        constraint = margin_account.owner == user @ ErrorCode::Unauthorized,
    )]
    pub margin_account: Box<Account<'info, MarginAccount>>,

    pub oracle: Box<Account<'info, OracleAccount>>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market_state.market_id_trimmed()],
        bump = market_state.bump,
        constraint = market_state.oracle == oracle.key() @ ErrorCode::MarketOracleMismatch,
    )]
    pub market_state: Box<Account<'info, MarketState>>,

    #[account(
        mut,
        seeds = [FEE_VAULT_SEED],
        bump = protocol_state.fee_vault_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub fee_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [INSURANCE_FUND_SEED],
        bump = protocol_state.insurance_fund_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub insurance_fund: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [LP_POOL_SEED],
        bump = liquidity_pool.bump,
    )]
    pub liquidity_pool: Box<Account<'info, LiquidityPool>>,

    #[account(
        mut,
        seeds = [LP_VAULT_SEED],
        bump = liquidity_pool.vault_bump,
        token::mint = protocol_state.usdc_mint,
    )]
    pub lp_vault: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<AdminClosePosition>, user: Pubkey, position_index: u8) -> Result<()> {
    let idx = position_index as usize;
    require!(idx < MAX_POSITIONS, ErrorCode::InvalidPositionIndex);

    let oracle = &ctx.accounts.oracle;
    let now = Clock::get()?.unix_timestamp;

    let position = ctx
        .accounts
        .margin_account
        .positions[idx]
        .as_ref()
        .ok_or(ErrorCode::NoOpenPosition)?
        .clone();

    require!(oracle.key() == position.oracle, ErrorCode::MarketOracleMismatch);

    let protocol = &ctx.accounts.protocol_state;
    let market = &ctx.accounts.market_state;
    let current_price = oracle.price;

    // Funding
    let seconds_elapsed = now.saturating_sub(position.last_funding_timestamp).max(0) as u64;
    let on_majority_side = match position.direction {
        Direction::Long => market.long_open_interest >= market.short_open_interest,
        Direction::Short => market.short_open_interest >= market.long_open_interest,
    };

    let funding_owed = if !on_majority_side || seconds_elapsed == 0 {
        0u64
    } else {
        let total_exposure = market.long_open_interest
            .checked_add(market.short_open_interest)
            .ok_or(ErrorCode::MathOverflow)?;
        let skew_rate = if total_exposure > 0 {
            let diff = if market.long_open_interest > market.short_open_interest {
                market.long_open_interest - market.short_open_interest
            } else {
                market.short_open_interest - market.long_open_interest
            };
            diff.checked_mul(protocol.skew_factor)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(total_exposure)
                .ok_or(ErrorCode::MathOverflow)?
        } else { 0u64 };

        let hourly_rate = protocol.base_funding_rate_per_hour
            .checked_add(skew_rate)
            .ok_or(ErrorCode::MathOverflow)?;

        (position.notional as u128)
            .checked_mul(hourly_rate as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(seconds_elapsed as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(3600u128 * FUNDING_RATE_SCALE as u128)
            .unwrap_or(0) as u64
    };

    // PnL
    let raw_pnl: i128 = compute_pnl(&position.direction, current_price, position.entry_price, position.notional)?;
    let max_profit = position.collateral
        .checked_mul(protocol.profit_cap_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)? as i128;
    let capped_pnl = raw_pnl.min(max_profit);

    // Close fee
    let close_fee = position.collateral
        .checked_mul(protocol.fee_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    let lp_portion = close_fee
        .checked_mul(ctx.accounts.liquidity_pool.lp_fee_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;
    let insurance_portion = close_fee
        .checked_mul(protocol.insurance_fund_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    let funding_lp_portion = funding_owed
        .checked_mul(FUNDING_LP_BPS)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;
    let funding_insurance_portion = funding_owed
        .checked_mul(FUNDING_INSURANCE_BPS)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    // LP fee accrual
    let total_lp = lp_portion.checked_add(funding_lp_portion).ok_or(ErrorCode::MathOverflow)?;
    if total_lp > 0 {
        ctx.accounts.liquidity_pool.accumulated_fees = ctx.accounts.liquidity_pool.accumulated_fees
            .checked_add(total_lp).ok_or(ErrorCode::MathOverflow)?;
        if ctx.accounts.liquidity_pool.total_shares > 0 {
            ctx.accounts.liquidity_pool.acc_fee_per_share = ctx.accounts.liquidity_pool.acc_fee_per_share
                .checked_add(
                    (total_lp as u128)
                        .checked_mul(crate::state::FEE_PER_SHARE_PRECISION)
                        .ok_or(ErrorCode::MathOverflow)?
                        .checked_div(ctx.accounts.liquidity_pool.total_shares as u128)
                        .ok_or(ErrorCode::MathOverflow)?,
                ).ok_or(ErrorCode::MathOverflow)?;
        }
    }

    // Settlement — collateral returned to margin account (no user_token_account needed)
    let settlement_i128 = position.collateral as i128
        + capped_pnl
        - funding_owed as i128
        - close_fee as i128;
    let settlement = if settlement_i128 <= 0 { 0u64 } else { settlement_i128 as u64 };

    let protocol_bump = protocol.bump;
    let seeds = &[PROTOCOL_SEED, &[protocol_bump]];
    let signer = &[&seeds[..]];

    // Insurance transfer
    let total_insurance = insurance_portion
        .checked_add(funding_insurance_portion)
        .ok_or(ErrorCode::MathOverflow)?;
    if total_insurance > 0 {
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.fee_vault.to_account_info(),
                to: ctx.accounts.insurance_fund.to_account_info(),
                authority: ctx.accounts.protocol_state.to_account_info(),
            },
            signer,
        );
        token::transfer(cpi_ctx, total_insurance)?;
    }

    // PnL movement between LP vault and fee vault
    let mut pnl_shortfall: u64 = 0;
    if capped_pnl > 0 {
        let pnl_amount = capped_pnl as u64;
        let lp_available = ctx.accounts.lp_vault.amount;
        let transfer_amount = pnl_amount.min(lp_available);
        if transfer_amount > 0 {
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.lp_vault.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                    authority: ctx.accounts.protocol_state.to_account_info(),
                },
                signer,
            );
            token::transfer(cpi_ctx, transfer_amount)?;
            ctx.accounts.liquidity_pool.total_usdc = ctx.accounts.liquidity_pool.total_usdc.saturating_sub(transfer_amount);
        }
        if transfer_amount < pnl_amount {
            pnl_shortfall = pnl_amount - transfer_amount;
        }
    } else if capped_pnl < 0 {
        let loss_amount = (-capped_pnl) as u64;
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.fee_vault.to_account_info(),
                to: ctx.accounts.lp_vault.to_account_info(),
                authority: ctx.accounts.protocol_state.to_account_info(),
            },
            signer,
        );
        token::transfer(cpi_ctx, loss_amount)?;
        ctx.accounts.liquidity_pool.total_usdc = ctx.accounts.liquidity_pool.total_usdc
            .checked_add(loss_amount).ok_or(ErrorCode::MathOverflow)?;
    }

    // Reduce settlement by shortfall
    let actual_settlement = settlement.saturating_sub(pnl_shortfall);

    if pnl_shortfall > 0 {
        msg!("PAYOUT_SHORTFALL user={} amount={}", user, pnl_shortfall);
    }

    // Credit settlement to margin collateral
    if actual_settlement > 0 {
        ctx.accounts.margin_account.collateral = ctx.accounts.margin_account.collateral
            .checked_add(actual_settlement).ok_or(ErrorCode::MathOverflow)?;
    }

    // Update user collateral counter
    if actual_settlement >= position.collateral {
        ctx.accounts.protocol_state.total_user_collateral = ctx.accounts.protocol_state.total_user_collateral
            .checked_add(actual_settlement - position.collateral).ok_or(ErrorCode::MathOverflow)?;
    } else {
        ctx.accounts.protocol_state.total_user_collateral = ctx.accounts.protocol_state.total_user_collateral
            .saturating_sub(position.collateral - actual_settlement);
    }

    // Clear position & update OI
    let direction = position.direction.clone();
    let notional = position.notional;

    let protocol = &mut ctx.accounts.protocol_state;
    match direction {
        Direction::Long => { protocol.total_long_exposure = protocol.total_long_exposure.saturating_sub(notional); }
        Direction::Short => { protocol.total_short_exposure = protocol.total_short_exposure.saturating_sub(notional); }
    }

    let market = &mut ctx.accounts.market_state;
    match direction {
        Direction::Long => { market.long_open_interest = market.long_open_interest.saturating_sub(notional); }
        Direction::Short => { market.short_open_interest = market.short_open_interest.saturating_sub(notional); }
    }

    let margin = &mut ctx.accounts.margin_account;
    margin.positions[idx] = None;

    let pnl_signed = if capped_pnl >= 0 { capped_pnl as i64 } else { -((-capped_pnl) as i64) };

    emit!(PositionClosed {
        user,
        oracle: ctx.accounts.oracle.key(),
        direction,
        entry_price: position.entry_price,
        exit_price: current_price,
        pnl: pnl_signed,
        funding_paid: funding_owed,
        fee_paid: close_fee,
        settlement,
        reason: CloseReason::AdminForced,
        timestamp: now,
    });

    msg!("Admin force-closed position [{}] for user {}. settlement={} pnl={}", idx, user, settlement, pnl_signed);
    Ok(())
}
