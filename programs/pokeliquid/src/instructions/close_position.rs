use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::PositionClosed,
    state::{CloseReason, Direction, LiquidityPool, MarginAccount, OracleAccount, ProtocolState, MAX_POSITIONS},
};

#[derive(Accounts)]
pub struct ClosePosition<'info> {
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
        token::authority = user,
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,

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

pub fn handler(ctx: Context<ClosePosition>, position_index: u8) -> Result<()> {
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

    let protocol = &ctx.accounts.protocol_state;
    let current_price = oracle.price;

    // ── Funding ──────────────────────────────────────────────────────────────
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
        protocol
            .base_funding_rate_per_hour
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

    // ── Raw PnL ───────────────────────────────────────────────────────────────
    let raw_pnl: i128 = compute_pnl(&position.direction, current_price, position.entry_price, position.notional)?;

    // ── Profit cap ────────────────────────────────────────────────────────────
    let max_profit = position
        .collateral
        .checked_mul(protocol.profit_cap_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)? as i128;

    let capped_pnl = raw_pnl.min(max_profit);

    // ── Close fee ─────────────────────────────────────────────────────────────
    let close_fee = position
        .collateral
        .checked_mul(protocol.fee_bps)
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

    // ── Settlement ────────────────────────────────────────────────────────────
    let settlement_i128 = position.collateral as i128
        + capped_pnl
        - funding_owed as i128
        - close_fee as i128;

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

    // Transfer settlement to user: fee_vault → lp_vault → insurance_fund
    if settlement > 0 {
        let mut remaining = settlement;

        // 1. Draw from fee_vault
        let from_vault = remaining.min(ctx.accounts.fee_vault.amount);
        if from_vault > 0 {
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.fee_vault.to_account_info(),
                    to: ctx.accounts.user_token_account.to_account_info(),
                    authority: ctx.accounts.protocol_state.to_account_info(),
                },
                signer,
            );
            token::transfer(cpi_ctx, from_vault)?;
            remaining -= from_vault;
        }

        // 2. Draw from lp_vault if fee_vault insufficient
        if remaining > 0 {
            let from_lp = remaining.min(ctx.accounts.lp_vault.amount);
            if from_lp > 0 {
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.lp_vault.to_account_info(),
                        to: ctx.accounts.user_token_account.to_account_info(),
                        authority: ctx.accounts.protocol_state.to_account_info(),
                    },
                    signer,
                );
                token::transfer(cpi_ctx, from_lp)?;
                // Reduce pool TVL tracking
                ctx.accounts.liquidity_pool.total_usdc =
                    ctx.accounts.liquidity_pool.total_usdc.saturating_sub(from_lp);
                remaining -= from_lp;
            }
        }

        // 3. Draw from insurance_fund as last resort
        if remaining > 0 {
            let from_ins = remaining.min(ctx.accounts.insurance_fund.amount);
            if from_ins > 0 {
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.insurance_fund.to_account_info(),
                        to: ctx.accounts.user_token_account.to_account_info(),
                        authority: ctx.accounts.protocol_state.to_account_info(),
                    },
                    signer,
                );
                token::transfer(cpi_ctx, from_ins)?;
                remaining -= from_ins;
            }
            if remaining > 0 {
                msg!("Warning: all funds depleted, settlement capped");
            }
        }
    }

    // ── Clear position ────────────────────────────────────────────────────────
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
        reason: CloseReason::Manual,
        timestamp: now,
    });

    msg!("Position [{}] closed. settlement={} pnl={} funding={}", idx, settlement, pnl_signed, funding_owed);
    Ok(())
}

pub fn compute_pnl(
    direction: &Direction,
    current_price: u64,
    entry_price: u64,
    notional: u64,
) -> Result<i128> {
    if entry_price == 0 {
        return Ok(0);
    }
    let pnl = match direction {
        Direction::Long => {
            let price_delta = current_price as i128 - entry_price as i128;
            price_delta
                .checked_mul(notional as i128)
                .ok_or(ErrorCode::MathOverflow)?
                / entry_price as i128
        }
        Direction::Short => {
            let price_delta = entry_price as i128 - current_price as i128;
            price_delta
                .checked_mul(notional as i128)
                .ok_or(ErrorCode::MathOverflow)?
                / entry_price as i128
        }
    };
    Ok(pnl)
}
