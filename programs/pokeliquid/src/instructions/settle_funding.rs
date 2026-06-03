use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::{FundingSettled, PositionLiquidated},
    state::{Direction, MarginAccount, MarketState, OracleAccount, ProtocolState, MAX_POSITIONS},
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
        constraint = market_state.oracle == oracle.key() @ ErrorCode::MarketOracleMismatch,
    )]
    pub market_state: Box<Account<'info, MarketState>>,

    #[account(mut)]
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

    pub token_program: Program<'info, Token>,
}

/// What to do for each position after computing funding.
enum FundingAction {
    Skip,
    Settle {
        slot: usize,
        funding_owed: u64,
        hours: u64,
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
    let now = Clock::get()?.unix_timestamp;
    let oracle_price = ctx.accounts.oracle.price;
    let oracle_key = ctx.accounts.oracle.key();

    // Snapshot values we need (avoids holding immutable borrow)
    let market_long = ctx.accounts.market_state.long_open_interest;
    let market_short = ctx.accounts.market_state.short_open_interest;
    let base_rate = ctx.accounts.protocol_state.base_funding_rate_per_hour;
    let skew_factor = ctx.accounts.protocol_state.skew_factor;
    let insurance_fund_bps = ctx.accounts.protocol_state.insurance_fund_bps;
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

        let hours_since = ((now.saturating_sub(position.last_funding_timestamp)) / 3600).max(0) as u64;
        if hours_since < 1 {
            actions.push(FundingAction::Skip);
            continue;
        }

        let on_majority_side = match position.direction {
            Direction::Long => market_long >= market_short,
            Direction::Short => market_short >= market_long,
        };

        let hourly_rate = if on_majority_side {
            base_rate.checked_add(skew_rate).ok_or(ErrorCode::MathOverflow)?
        } else {
            base_rate.saturating_sub(skew_rate)
        };

        let funding_owed = position
            .notional
            .checked_mul(hourly_rate)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(hours_since)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(FUNDING_RATE_SCALE)
            .unwrap_or(0);

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
                hours: hours_since,
                new_timestamp: position.last_funding_timestamp + (hours_since as i64 * 3600),
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
                hours,
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

                // Split funding: insurance portion from fee_vault → insurance_fund
                let insurance_portion = funding_owed
                    .checked_mul(insurance_fund_bps)
                    .ok_or(ErrorCode::MathOverflow)?
                    .checked_div(10_000)
                    .ok_or(ErrorCode::MathOverflow)?;

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
                    hours_settled: hours,
                    new_collateral,
                    timestamp: now,
                });

                msg!(
                    "Funding settled: slot={} hours={} funding={} new_collateral={}",
                    slot,
                    hours,
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
                    "Position [{}] liquidated via funding drain. collateral_lost={}",
                    slot,
                    collateral_lost
                );
            }
        }
    }

    Ok(())
}
