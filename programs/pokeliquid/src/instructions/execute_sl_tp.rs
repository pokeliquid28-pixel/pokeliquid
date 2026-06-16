use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::PositionClosed,
    instructions::close_position::compute_pnl,
    state::{CloseReason, Direction, LiquidityPool, MarginAccount, MarketState, OracleAccount, ProtocolState, MAX_POSITIONS},
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

    require!(!ctx.accounts.protocol_state.is_paused, ErrorCode::ProtocolPaused);

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

    // Ensure the oracle matches the one used when position was opened
    require!(oracle.key() == position.oracle, ErrorCode::MarketOracleMismatch);

    let current_price = oracle.price;

    // ── Check SL/TP trigger conditions ─────────────────────────────────────
    let close_reason = determine_trigger(&position.direction, current_price, position.sl_price, position.tp_price)?;

    // ── Funding (per-market OI, seconds-based) ─────────────────────────────
    let protocol = &ctx.accounts.protocol_state;
    let market = &ctx.accounts.market_state;
    let seconds_elapsed = now.saturating_sub(position.last_funding_timestamp).max(0) as u64;

    let on_majority_side = match position.direction {
        Direction::Long => market.long_open_interest >= market.short_open_interest,
        Direction::Short => market.short_open_interest >= market.long_open_interest,
    };

    // Minority side pays 0 funding
    let funding_owed = if !on_majority_side || seconds_elapsed == 0 {
        0u64
    } else {
        let total_exposure = market
            .long_open_interest
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
        } else {
            0u64
        };

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

    // Trading fee split: 50% LP, 25% insurance, 25% platform (stays in fee_vault)
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

    // Funding fee split: 30% LP, 20% insurance (majority side only)
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

    // Record LP fee portions (trading + funding)
    let total_lp = lp_portion
        .checked_add(funding_lp_portion)
        .ok_or(ErrorCode::MathOverflow)?;
    if total_lp > 0 {
        ctx.accounts.liquidity_pool.accumulated_fees = ctx
            .accounts
            .liquidity_pool
            .accumulated_fees
            .checked_add(total_lp)
            .ok_or(ErrorCode::MathOverflow)?;
        if ctx.accounts.liquidity_pool.total_shares > 0 {
            ctx.accounts.liquidity_pool.acc_fee_per_share = ctx
                .accounts
                .liquidity_pool
                .acc_fee_per_share
                .checked_add(
                    (total_lp as u128)
                        .checked_mul(crate::state::FEE_PER_SHARE_PRECISION)
                        .ok_or(ErrorCode::MathOverflow)?
                        .checked_div(ctx.accounts.liquidity_pool.total_shares as u128)
                        .ok_or(ErrorCode::MathOverflow)?,
                )
                .ok_or(ErrorCode::MathOverflow)?;
        }
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

    // Route insurance portions (trading + funding) from fee_vault to insurance_fund
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

    // ── PnL USDC movement between LP vault and fee vault ───────────────────
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
            ctx.accounts.liquidity_pool.total_usdc = ctx
                .accounts
                .liquidity_pool
                .total_usdc
                .saturating_sub(transfer_amount);
        }
        if transfer_amount < pnl_amount {
            pnl_shortfall = pnl_amount - transfer_amount;
        }
    } else if capped_pnl < 0 {
        // Trader lost: LP captures the loss — transfer from fee_vault → lp_vault
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
        ctx.accounts.liquidity_pool.total_usdc = ctx
            .accounts
            .liquidity_pool
            .total_usdc
            .checked_add(loss_amount)
            .ok_or(ErrorCode::MathOverflow)?;
    }

    // Reduce settlement by any LP shortfall
    let actual_settlement = settlement.saturating_sub(pnl_shortfall);

    if pnl_shortfall > 0 {
        msg!("PAYOUT_SHORTFALL user={} amount={}", ctx.accounts.margin_account.owner, pnl_shortfall);
    }

    // Transfer settlement to margin account's free collateral
    let margin = &mut ctx.accounts.margin_account;
    margin.collateral = margin
        .collateral
        .checked_add(actual_settlement)
        .ok_or(ErrorCode::MathOverflow)?;

    // Update user collateral counter
    if actual_settlement >= position.collateral {
        ctx.accounts.protocol_state.total_user_collateral = ctx
            .accounts
            .protocol_state
            .total_user_collateral
            .checked_add(actual_settlement - position.collateral)
            .ok_or(ErrorCode::MathOverflow)?;
    } else {
        ctx.accounts.protocol_state.total_user_collateral = ctx
            .accounts
            .protocol_state
            .total_user_collateral
            .saturating_sub(position.collateral - actual_settlement);
    }

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

    // Decrement per-market OI
    let market = &mut ctx.accounts.market_state;
    match direction {
        Direction::Long => {
            market.long_open_interest = market.long_open_interest.saturating_sub(notional);
        }
        Direction::Short => {
            market.short_open_interest = market.short_open_interest.saturating_sub(notional);
        }
    }

    let margin = &mut ctx.accounts.margin_account;
    margin.positions[idx] = None;

    let pnl_signed = if capped_pnl >= 0 { capped_pnl as i64 } else { -((-capped_pnl) as i64) };

    emit!(PositionClosed {
        user: ctx.accounts.user.key(),
        oracle: ctx.accounts.oracle.key(),
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
