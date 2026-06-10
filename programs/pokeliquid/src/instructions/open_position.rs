use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{
    constants::*,
    error::ErrorCode,
    events::{PositionOpened, ReferralFeeCredited},
    state::{Direction, LiquidityPool, MarginAccount, MarketState, OracleAccount, Position, ProtocolState, ReferralAccount},
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
        constraint = market_state.oracle == oracle.key() @ ErrorCode::MarketOracleMismatch,
    )]
    pub market_state: Account<'info, MarketState>,

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

    // Optional: referrer's referral account via remaining_accounts.
    // If provided, 10% of the fee goes to referrer.
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
    require!(leverage <= 25, ErrorCode::AboveMaxLeverage);
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

    // Per-account per-market per-direction collateral cap ($350 USDC = 350_000_000)
    let market_collateral_cap: u64 = 350_000_000;
    let oracle_key = oracle.key();
    let existing_market_collateral: u64 = ctx.accounts.margin_account.positions.iter()
        .filter_map(|p| p.as_ref())
        .filter(|p| p.oracle == oracle_key && p.direction == direction)
        .map(|p| p.collateral)
        .sum();
    let post_fee_collateral = collateral
        .checked_sub(
            collateral.checked_mul(protocol.fee_bps).ok_or(ErrorCode::MathOverflow)?
                .checked_div(10_000).ok_or(ErrorCode::MathOverflow)?
        ).ok_or(ErrorCode::MathOverflow)?;
    require!(
        existing_market_collateral.checked_add(post_fee_collateral).ok_or(ErrorCode::MathOverflow)? <= market_collateral_cap,
        ErrorCode::ExceedsMaxExposure
    );

    // Notional = collateral * leverage
    let notional = collateral
        .checked_mul(leverage as u64)
        .ok_or(ErrorCode::MathOverflow)?;

    // Per-market exposure check
    let market = &ctx.accounts.market_state;
    match direction {
        Direction::Long => {
            let new_oi = market
                .long_open_interest
                .checked_add(notional)
                .ok_or(ErrorCode::MathOverflow)?;
            require!(new_oi <= market.max_long_oi, ErrorCode::ExceedsMaxExposure);
        }
        Direction::Short => {
            let new_oi = market
                .short_open_interest
                .checked_add(notional)
                .ok_or(ErrorCode::MathOverflow)?;
            require!(new_oi <= market.max_short_oi, ErrorCode::ExceedsMaxExposure);
        }
    }

    // Global exposure check (protocol-wide backstop)
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

    // Fee split: 50% LP pool, 25% insurance, 25% platform (stays in fee_vault)
    let lp_portion = fee_amount
        .checked_mul(ctx.accounts.liquidity_pool.lp_fee_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    let mut insurance_portion = fee_amount
        .checked_mul(protocol.insurance_fund_bps)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::MathOverflow)?;

    // ── Referral fee ──────────────────────────────────────────────────────
    // If a valid ReferralAccount is passed in remaining_accounts, credit
    // 10% of fee_amount to the referrer (5% from platform + 5% from insurance).
    // The USDC stays in fee_vault — referrer claims later via claim_referral.
    let mut referral_portion: u64 = 0;
    if let Some(referral_info) = ctx.remaining_accounts.first() {
        if referral_info.is_writable && referral_info.owner == ctx.program_id {
            let mut data = &referral_info.try_borrow_data()?[..];
            if let Ok(mut referral) = ReferralAccount::try_deserialize(&mut data) {
                // Verify PDA and that referrer is not the trader
                let (expected_pda, _) = Pubkey::find_program_address(
                    &[REFERRAL_SEED, referral.owner.as_ref()],
                    ctx.program_id,
                );
                if referral_info.key() == expected_pda && referral.owner != ctx.accounts.user.key() {
                    referral_portion = fee_amount
                        .checked_mul(REFERRAL_FEE_BPS)
                        .ok_or(ErrorCode::MathOverflow)?
                        .checked_div(10_000)
                        .ok_or(ErrorCode::MathOverflow)?;

                    if referral_portion > 0 {
                        referral.pending_fees = referral
                            .pending_fees
                            .checked_add(referral_portion)
                            .ok_or(ErrorCode::MathOverflow)?;
                        referral.total_earned = referral
                            .total_earned
                            .checked_add(referral_portion)
                            .ok_or(ErrorCode::MathOverflow)?;
                        referral.total_referrals = referral
                            .total_referrals
                            .checked_add(1)
                            .ok_or(ErrorCode::MathOverflow)?;

                        // Write back to account
                        let mut ref_data = referral_info.try_borrow_mut_data()?;
                        let mut writer = &mut ref_data[..];
                        referral.try_serialize(&mut writer)?;

                        emit!(ReferralFeeCredited {
                            referrer: referral.owner,
                            trader: ctx.accounts.user.key(),
                            amount: referral_portion,
                        });
                    }
                }
            }
        }
    }

    // Deduct referral portion: half from insurance, half from platform
    if referral_portion > 0 {
        let from_insurance = referral_portion / 2;
        insurance_portion = insurance_portion.saturating_sub(from_insurance);
        // The other half reduces platform's implicit share (stays in fee_vault anyway)
    }

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
        oracle: ctx.accounts.oracle.key(),
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

    // Update per-market OI
    let market = &mut ctx.accounts.market_state;
    match direction {
        Direction::Long => {
            market.long_open_interest = market
                .long_open_interest
                .checked_add(notional)
                .ok_or(ErrorCode::MathOverflow)?;
        }
        Direction::Short => {
            market.short_open_interest = market
                .short_open_interest
                .checked_add(notional)
                .ok_or(ErrorCode::MathOverflow)?;
        }
    }

    emit!(PositionOpened {
        user: ctx.accounts.user.key(),
        oracle: ctx.accounts.oracle.key(),
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
