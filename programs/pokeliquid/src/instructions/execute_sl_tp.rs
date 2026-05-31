use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::PositionClosed,
    instructions::close_position::compute_pnl,
    state::{CloseReason, Direction, LiquidityPool, MarginAccount, OracleAccount, ProtocolState, MAX_POSITIONS},
};

/// Keeper reward: 0.1% of position collateral (10 bps)
const KEEPER_REWARD_BPS: u64 = 10;

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct ExecuteSlTp<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// CHECK: used only to derive margin_account PDA
    pub user: UncheckedAccount<'info>,

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

    #[account(
        seeds = [ORACLE_SEED],
        bump = oracle.bump,
    )]
    pub oracle: Box<Account<'info, OracleAccount>>,

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
        token::mint = protocol_state.usdc_mint,
        token::authority = caller,
    )]
    pub caller_token_account: Box<Account<'info, TokenAccount>>,

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

pub fn handler(ctx: Context<ExecuteSlTp>, _user: Pubkey, position_index: u8) -> Result<()> {
    let idx = position_index as usize;
    require!(idx < MAX_POSITIONS, ErrorCode::InvalidPositionIndex);

    let oracle = &ctx.accounts.oracle;
    let now = Clock::get()?.unix_timestamp;

    require!(
        oracle.last_updated > 0
            && now.saturating_sub(oracle.last_updated) <= oracle.staleness_threshold,
        ErrorCode::PriceStale
    );

    let position = ctx
        .accounts
        .margin_account
        .positions[idx]
        .as_ref()
        .ok_or(ErrorCode::NoOpenPosition)?
        .clone();

    let current_price = oracle.price;

    // ── Check SL/TP trigger conditions ─────────────────────────────────────
    let close_reason = determine_trigger(&position.direction, current_price, position.sl_price, position.tp_price)?;

    // ── Funding ────────────────────────────────────────────────────────────
    let protocol = &ctx.accounts.protocol_state;
    let hours_open = ((now.saturating_sub(position.open_timestamp)) / 3600).max(0) as u64;

    let total_exposure = protocol
        .total_long_exposure
        .checked_add(protocol.total_short_exposure)
        .ok_or(ErrorCode::MathOverflow)?;

    let skew_rate = if total_exposure > 0 {
        let diff = if protocol.total_long_exposure > protocol.total_short_exposure {
            protocol.total_long_exposure - protocol.total_short_exposure
        } else {
            protocol.total_short_exposure - protocol.total_long_exposure
        };
        diff.checked_mul(protocol.skew_factor)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(total_exposure)
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        0u64
    };

    let on_majority_side = match position.direction {
        Direction::Long => protocol.total_long_exposure >= protocol.total_short_exposure,
        Direction::Short => protocol.total_short_exposure >= protocol.total_long_exposure,
    };

    let hourly_rate = if on_majority_side {
        protocol.base_funding_rate_per_hour
            .checked_add(skew_rate)
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        protocol.base_funding_rate_per_hour.saturating_sub(skew_rate)
    };

    let funding_owed = position
        .notional
        .checked_mul(hourly_rate)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(hours_open)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(FUNDING_RATE_SCALE)
        .unwrap_or(0);

    // ── Raw PnL ────────────────────────────────────────────────────────────
    let raw_pnl = compute_pnl(&position.direction, current_price, position.entry_price, position.notional)?;

    // ── Profit cap ─────────────────────────────────────────────────────────
    let max_profit = position
        .collateral
        .checked_mul(protocol.profit_cap_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)? as i128;

    let capped_pnl = raw_pnl.min(max_profit);

    // ── Fees ───────────────────────────────────────────────────────────────
    let close_fee = position
        .collateral
        .checked_mul(protocol.fee_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    // Keeper reward: 0.1% of collateral
    let keeper_reward = position
        .collateral
        .checked_mul(KEEPER_REWARD_BPS)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    // Fee split: 30% LP pool, 60% fee_vault, 10% insurance
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

    // Record LP fee portion
    if lp_portion > 0 {
        ctx.accounts.liquidity_pool.accumulated_fees = ctx
            .accounts
            .liquidity_pool
            .accumulated_fees
            .checked_add(lp_portion)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    // ── Settlement ─────────────────────────────────────────────────────────
    // Deduct keeper reward from user's settlement (user pays the keeper incentive)
    let settlement_i128 = position.collateral as i128
        + capped_pnl
        - funding_owed as i128
        - close_fee as i128
        - keeper_reward as i128;

    let settlement = if settlement_i128 <= 0 { 0u64 } else { settlement_i128 as u64 };

    let protocol_bump = protocol.bump;
    let seeds = &[PROTOCOL_SEED, &[protocol_bump]];
    let signer = &[&seeds[..]];

    // Route insurance fee portion from fee_vault to insurance_fund
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

    // Pay keeper reward from fee_vault
    if keeper_reward > 0 {
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.fee_vault.to_account_info(),
                to: ctx.accounts.caller_token_account.to_account_info(),
                authority: ctx.accounts.protocol_state.to_account_info(),
            },
            signer,
        );
        token::transfer(cpi_ctx, keeper_reward)?;
    }

    // Transfer settlement to margin account's free collateral
    // (user withdraws later — no user_token_account needed)
    let margin = &mut ctx.accounts.margin_account;
    margin.collateral = margin
        .collateral
        .checked_add(settlement)
        .ok_or(ErrorCode::MathOverflow)?;

    // ── Clear position ─────────────────────────────────────────────────────
    let direction = position.direction.clone();
    let notional = position.notional;

    let protocol = &mut ctx.accounts.protocol_state;
    match direction {
        Direction::Long => {
            protocol.total_long_exposure =
                protocol.total_long_exposure.saturating_sub(notional);
        }
        Direction::Short => {
            protocol.total_short_exposure =
                protocol.total_short_exposure.saturating_sub(notional);
        }
    }

    let margin = &mut ctx.accounts.margin_account;
    margin.positions[idx] = None;

    let pnl_signed = if capped_pnl >= 0 { capped_pnl as i64 } else { -((-capped_pnl) as i64) };

    emit!(PositionClosed {
        user: ctx.accounts.user.key(),
        direction,
        entry_price: position.entry_price,
        exit_price: current_price,
        pnl: pnl_signed,
        funding_paid: funding_owed,
        fee_paid: close_fee,
        settlement,
        reason: close_reason.clone(),
        timestamp: now,
    });

    msg!(
        "SL/TP executed: slot={} reason={:?} settlement={} pnl={} keeper_reward={}",
        idx, close_reason, settlement, pnl_signed, keeper_reward
    );
    Ok(())
}

fn determine_trigger(
    direction: &Direction,
    current_price: u64,
    sl_price: Option<u64>,
    tp_price: Option<u64>,
) -> Result<CloseReason> {
    // Check SL first
    if let Some(sl) = sl_price {
        match direction {
            Direction::Long if current_price <= sl => return Ok(CloseReason::StopLoss),
            Direction::Short if current_price >= sl => return Ok(CloseReason::StopLoss),
            _ => {}
        }
    }

    // Check TP
    if let Some(tp) = tp_price {
        match direction {
            Direction::Long if current_price >= tp => return Ok(CloseReason::TakeProfit),
            Direction::Short if current_price <= tp => return Ok(CloseReason::TakeProfit),
            _ => {}
        }
    }

    err!(ErrorCode::NotTriggered)
}
