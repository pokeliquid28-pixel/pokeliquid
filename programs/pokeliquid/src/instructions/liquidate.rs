use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::PositionLiquidated,
    instructions::close_position::compute_pnl,
    state::{Direction, LiquidityPool, MarginAccount, MarketState, OracleAccount, ProtocolState, MAX_POSITIONS},
};

#[derive(Accounts)]
#[instruction(user: Pubkey)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

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
        token::authority = liquidator,
    )]
    pub liquidator_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [LP_POOL_SEED],
        bump = liquidity_pool.bump,
    )]
    pub liquidity_pool: Box<Account<'info, LiquidityPool>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Liquidate>, _user: Pubkey, position_index: u8) -> Result<()> {
    require!(!ctx.accounts.protocol_state.is_paused, ErrorCode::ProtocolPaused);

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

    // Ensure the oracle matches the one used when position was opened
    require!(oracle.key() == position.oracle, ErrorCode::MarketOracleMismatch);

    let current_price = oracle.price;

    // ── Check liquidation condition ───────────────────────────────────────────
    let unrealized_pnl =
        compute_pnl(&position.direction, current_price, position.entry_price, position.notional)?;

    let equity = position.collateral as i128 + unrealized_pnl;

    // margin_ratio < 2% => equity * 50 < notional
    let is_liquidatable = equity <= 0 || (equity * 50 < position.notional as i128);
    require!(is_liquidatable, ErrorCode::NotLiquidatable);

    // ── Distribute collateral: 2% liquidator, 44% LP, 44% insurance, 10% platform
    let collateral = position.collateral;

    let liquidator_reward = collateral
        .checked_mul(LIQUIDATOR_REWARD_BPS)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    let lp_portion = collateral
        .checked_mul(LIQUIDATION_LP_BPS)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    let insurance_portion = collateral
        .checked_mul(LIQUIDATION_INSURANCE_BPS)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    let protocol_bump = ctx.accounts.protocol_state.bump;
    let seeds = &[PROTOCOL_SEED, &[protocol_bump]];
    let signer = &[&seeds[..]];

    // Transfer liquidator reward
    if liquidator_reward > 0 {
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.fee_vault.to_account_info(),
                to: ctx.accounts.liquidator_token_account.to_account_info(),
                authority: ctx.accounts.protocol_state.to_account_info(),
            },
            signer,
        );
        token::transfer(cpi_ctx, liquidator_reward)?;
    }

    // Record LP portion in accumulated_fees (stays in fee_vault, claimable by LPs)
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

    // Transfer insurance portion
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

    // Liquidated collateral is no longer user funds
    ctx.accounts.protocol_state.total_user_collateral = ctx
        .accounts
        .protocol_state
        .total_user_collateral
        .saturating_sub(collateral);

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

    emit!(PositionLiquidated {
        user: ctx.accounts.user.key(),
        oracle: ctx.accounts.oracle.key(),
        liquidator: ctx.accounts.liquidator.key(),
        entry_price: position.entry_price,
        exit_price: current_price,
        collateral_lost: collateral,
        timestamp: now,
    });

    msg!(
        "Liquidated user={} slot={}. reward={} lp={} insurance={}",
        ctx.accounts.user.key(),
        idx,
        liquidator_reward,
        lp_portion,
        insurance_portion
    );
    Ok(())
}
