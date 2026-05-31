use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::PositionLiquidated,
    instructions::close_position::compute_pnl,
    state::{Direction, MarginAccount, OracleAccount, ProtocolState, MAX_POSITIONS},
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
        token::authority = liquidator,
    )]
    pub liquidator_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Liquidate>, _user: Pubkey, position_index: u8) -> Result<()> {
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

    // ── Check liquidation condition ───────────────────────────────────────────
    let unrealized_pnl =
        compute_pnl(&position.direction, current_price, position.entry_price, position.notional)?;

    let equity = position.collateral as i128 + unrealized_pnl;

    // margin_ratio < 5% => equity * 20 < notional
    let is_liquidatable = equity <= 0 || (equity * 20 < position.notional as i128);
    require!(is_liquidatable, ErrorCode::NotLiquidatable);

    // ── Distribute collateral ─────────────────────────────────────────────────
    let collateral = position.collateral;

    let liquidator_reward = collateral
        .checked_mul(LIQUIDATOR_REWARD_BPS)
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

    emit!(PositionLiquidated {
        user: ctx.accounts.user.key(),
        liquidator: ctx.accounts.liquidator.key(),
        entry_price: position.entry_price,
        exit_price: current_price,
        collateral_lost: collateral,
        timestamp: now,
    });

    msg!(
        "Liquidated user={} slot={}. reward={} insurance={}",
        ctx.accounts.user.key(),
        idx,
        liquidator_reward,
        insurance_portion
    );
    Ok(())
}
