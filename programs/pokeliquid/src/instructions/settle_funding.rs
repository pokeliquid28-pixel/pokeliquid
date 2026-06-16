use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::{FundingSettled, PositionLiquidated},
    state::{Direction, LiquidityPool, MarginAccount, MarketState, OracleAccount, ProtocolState, MAX_POSITIONS},
};

#[derive(Accounts)]
pub struct SettleFunding<'info> {
    /// Anyone can crank this (keeper, user, etc.)
    pub cranker: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Box<Account<'info, ProtocolState>>,

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
        seeds = [MARGIN_SEED, margin_account.owner.as_ref()],
        bump = margin_account.bump,
    )]
    pub margin_account: Box<Account<'info, MarginAccount>>,

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

    pub token_program: Program<'info, Token>,
}

/// What to do for each position after computing funding.
enum FundingAction {
    Skip,
    Settle {
        slot: usize,
        funding_owed: u64,
        new_timestamp: i64,
    },
    LiquidateViaFunding {
        slot: usize,
        collateral_lost: u64,
        notional: u64,
        direction: Direction,
        entry_price: u64,
    },
}

pub fn handler(ctx: Context<SettleFunding>) -> Result<()> {
    require!(!ctx.accounts.protocol_state.is_paused, ErrorCode::ProtocolPaused);

    let now = Clock::get()?.unix_timestamp;

    // Oracle freshness check — prevent funding drain on stale prices
    let oracle = &ctx.accounts.oracle;
    require!(
        oracle.last_updated > 0
            && now.saturating_sub(oracle.last_updated) <= oracle.staleness_threshold,
        ErrorCode::PriceStale
    );

    let oracle_price = oracle.price;
    let oracle_key = oracle.key();

    // Snapshot values we need (avoids holding immutable borrow)
    let market_long = ctx.accounts.market_state.long_open_interest;
    let market_short = ctx.accounts.market_state.short_open_interest;
    let base_rate = ctx.accounts.protocol_state.base_funding_rate_per_hour;
    let skew_factor = ctx.accounts.protocol_state.skew_factor;
    let protocol_bump = ctx.accounts.protocol_state.bump;

    // Precompute skew rate from per-market OI
    let total_exposure = market_long
        .checked_add(market_short)
        .ok_or(ErrorCode::MathOverflow)?;

    let skew_rate = if total_exposure > 0 {
        let diff = if market_long > market_short {
            market_long - market_short
        } else {
            market_short - market_long
        };
        diff.checked_mul(skew_factor)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(total_exposure)
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        0u64
    };

    let margin = &ctx.accounts.margin_account;
    let user = margin.owner;

    // Phase 1: compute actions for each slot (read-only scan)
    let mut actions = Vec::with_capacity(MAX_POSITIONS);

    for i in 0..MAX_POSITIONS {
        let position = match &margin.positions[i] {
            Some(p) => p,
            None => {
                actions.push(FundingAction::Skip);
                continue;
            }
        };

        // Only settle positions belonging to this market
        if position.oracle != oracle_key {
            actions.push(FundingAction::Skip);
            continue;
        }

        let seconds_since = now.saturating_sub(position.last_funding_timestamp).max(0) as u64;
        if seconds_since < 60 {
            // Minimum 60 seconds between settlements to avoid spam
            actions.push(FundingAction::Skip);
            continue;
        }

        let on_majority_side = match position.direction {
            Direction::Long => market_long >= market_short,
            Direction::Short => market_short >= market_long,
        };

        // Minority side pays 0 funding
        if !on_majority_side {
            actions.push(FundingAction::Skip);
            continue;
        }

        let hourly_rate = base_rate.checked_add(skew_rate).ok_or(ErrorCode::MathOverflow)?;

        // Proportional seconds-based funding
        let funding_owed = (position.notional as u128)
            .checked_mul(hourly_rate as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(seconds_since as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(3600u128 * FUNDING_RATE_SCALE as u128)
            .unwrap_or(0) as u64;

        if funding_owed == 0 {
            actions.push(FundingAction::Skip);
            continue;
        }

        if funding_owed >= position.collateral {
            actions.push(FundingAction::LiquidateViaFunding {
                slot: i,
                collateral_lost: position.collateral,
                notional: position.notional,
                direction: position.direction.clone(),
                entry_price: position.entry_price,
            });
        } else {
            actions.push(FundingAction::Settle {
                slot: i,
                funding_owed,
                new_timestamp: now,
            });
        }
    }

    // Phase 2: apply actions (mutable access)
    let seeds = &[PROTOCOL_SEED, &[protocol_bump]];
    let signer_seeds = &[&seeds[..]];

    for action in actions {
        match action {
            FundingAction::Skip => {}

            FundingAction::Settle {
                slot,
                funding_owed,
                new_timestamp,
            } => {
                let pos = ctx.accounts.margin_account.positions[slot]
                    .as_mut()
                    .unwrap();
                pos.collateral = pos
                    .collateral
                    .checked_sub(funding_owed)
                    .ok_or(ErrorCode::MathOverflow)?;
                pos.last_funding_timestamp = new_timestamp;

                let new_collateral = pos.collateral;

                // Funding reduces user claim
                ctx.accounts.protocol_state.total_user_collateral = ctx
                    .accounts
                    .protocol_state
                    .total_user_collateral
                    .saturating_sub(funding_owed);

                // Funding fee split: 30% LP, 20% insurance, rest platform
                let funding_lp_portion = funding_owed
                    .checked_mul(FUNDING_LP_BPS)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(10_000)
                    .ok_or(ErrorCode::MathOverflow)?;

                let insurance_portion = funding_owed
                    .checked_mul(FUNDING_INSURANCE_BPS)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(10_000)
                    .ok_or(ErrorCode::MathOverflow)?;

                // Record LP portion in accumulated_fees
                if funding_lp_portion > 0 {
                    ctx.accounts.liquidity_pool.accumulated_fees = ctx
                        .accounts
                        .liquidity_pool
                        .accumulated_fees
                        .checked_add(funding_lp_portion)
                        .ok_or(ErrorCode::MathOverflow)?;
                    if ctx.accounts.liquidity_pool.total_shares > 0 {
                        ctx.accounts.liquidity_pool.acc_fee_per_share = ctx
                            .accounts
                            .liquidity_pool
                            .acc_fee_per_share
                            .checked_add(
                                (funding_lp_portion as u128)
                                    .checked_mul(crate::state::FEE_PER_SHARE_PRECISION)
                                    .ok_or(ErrorCode::MathOverflow)?
                                    .checked_div(ctx.accounts.liquidity_pool.total_shares as u128)
                                    .ok_or(ErrorCode::MathOverflow)?,
                            )
                            .ok_or(ErrorCode::MathOverflow)?;
                    }
                }

                // Transfer insurance portion from fee_vault → insurance_fund
                if insurance_portion > 0 {
                    let cpi_ctx = CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        Transfer {
                            from: ctx.accounts.fee_vault.to_account_info(),
                            to: ctx.accounts.insurance_fund.to_account_info(),
                            authority: ctx.accounts.protocol_state.to_account_info(),
                        },
                        signer_seeds,
                    );
                    token::transfer(cpi_ctx, insurance_portion)?;
                }

                emit!(FundingSettled {
                    user,
                    position_index: slot as u8,
                    funding_owed,
                    hours_settled: 0, // deprecated field, now seconds-based
                    new_collateral,
                    timestamp: now,
                });

                msg!(
                    "Funding settled: slot={} funding={} new_collateral={}",
                    slot,
                    funding_owed,
                    new_collateral
                );
            }

            FundingAction::LiquidateViaFunding {
                slot,
                collateral_lost,
                notional,
                direction,
                entry_price,
            } => {
                // Clear position
                ctx.accounts.margin_account.positions[slot] = None;

                // Liquidated collateral is no longer user funds
                ctx.accounts.protocol_state.total_user_collateral = ctx
                    .accounts
                    .protocol_state
                    .total_user_collateral
                    .saturating_sub(collateral_lost);

                // Distribute collateral: 44% LP, 44% insurance, 12% platform (no liquidator reward)
                let lp_portion = collateral_lost
                    .checked_mul(LIQUIDATION_LP_BPS)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(10_000)
                    .ok_or(ErrorCode::MathOverflow)?;

                let insurance_portion = collateral_lost
                    .checked_mul(LIQUIDATION_INSURANCE_BPS)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(10_000)
                    .ok_or(ErrorCode::MathOverflow)?;

                if lp_portion > 0 {
                    ctx.accounts.liquidity_pool.accumulated_fees = ctx
                        .accounts
                        .liquidity_pool
                        .accumulated_fees
                        .checked_add(lp_portion)
                        .ok_or(ErrorCode::MathOverflow)?;
                    if ctx.accounts.liquidity_pool.total_shares > 0 {
                        ctx.accounts.liquidity_pool.acc_fee_per_share = ctx
                            .accounts
                            .liquidity_pool
                            .acc_fee_per_share
                            .checked_add(
                                (lp_portion as u128)
                                    .checked_mul(crate::state::FEE_PER_SHARE_PRECISION)
                                    .ok_or(ErrorCode::MathOverflow)?
                                    .checked_div(ctx.accounts.liquidity_pool.total_shares as u128)
                                    .ok_or(ErrorCode::MathOverflow)?,
                            )
                            .ok_or(ErrorCode::MathOverflow)?;
                    }
                }

                if insurance_portion > 0 {
                    let cpi_ctx = CpiContext::new_with_signer(
                        ctx.accounts.token_program.key(),
                        Transfer {
                            from: ctx.accounts.fee_vault.to_account_info(),
                            to: ctx.accounts.insurance_fund.to_account_info(),
                            authority: ctx.accounts.protocol_state.to_account_info(),
                        },
                        signer_seeds,
                    );
                    token::transfer(cpi_ctx, insurance_portion)?;
                }

                // Update global exposure
                match direction {
                    Direction::Long => {
                        ctx.accounts.protocol_state.total_long_exposure = ctx
                            .accounts
                            .protocol_state
                            .total_long_exposure
                            .saturating_sub(notional);
                    }
                    Direction::Short => {
                        ctx.accounts.protocol_state.total_short_exposure = ctx
                            .accounts
                            .protocol_state
                            .total_short_exposure
                            .saturating_sub(notional);
                    }
                }

                // Decrement per-market OI
                match direction {
                    Direction::Long => {
                        ctx.accounts.market_state.long_open_interest = ctx
                            .accounts
                            .market_state
                            .long_open_interest
                            .saturating_sub(notional);
                    }
                    Direction::Short => {
                        ctx.accounts.market_state.short_open_interest = ctx
                            .accounts
                            .market_state
                            .short_open_interest
                            .saturating_sub(notional);
                    }
                }

                emit!(PositionLiquidated {
                    user,
                    oracle: oracle_key,
                    liquidator: ctx.accounts.cranker.key(),
                    entry_price,
                    exit_price: oracle_price,
                    collateral_lost,
                    timestamp: now,
                });

                msg!(
                    "Position [{}] liquidated via funding drain. collateral_lost={} lp={} ins={}",
                    slot,
                    collateral_lost,
                    lp_portion,
                    insurance_portion
                );
            }
        }
    }

    Ok(())
}
