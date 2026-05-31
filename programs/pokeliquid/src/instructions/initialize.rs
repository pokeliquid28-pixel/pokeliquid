use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::*,
    state::{OracleAccount, ProtocolState},
};

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = ProtocolState::SPACE,
        seeds = [PROTOCOL_SEED],
        bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        init,
        payer = admin,
        space = OracleAccount::SPACE,
        seeds = [ORACLE_SEED],
        bump,
    )]
    pub oracle: Account<'info, OracleAccount>,

    /// Our devnet USDC mint — protocol_state is the mint authority
    #[account(
        init,
        payer = admin,
        mint::decimals = USDC_DECIMALS,
        mint::authority = protocol_state,
        seeds = [USDC_MINT_SEED],
        bump,
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = admin,
        token::mint = usdc_mint,
        token::authority = protocol_state,
        seeds = [FEE_VAULT_SEED],
        bump,
    )]
    pub fee_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = admin,
        token::mint = usdc_mint,
        token::authority = protocol_state,
        seeds = [INSURANCE_FUND_SEED],
        bump,
    )]
    pub insurance_fund: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<Initialize>) -> Result<()> {
    let bumps = &ctx.bumps;

    let state = &mut ctx.accounts.protocol_state;
    state.admin = ctx.accounts.admin.key();
    state.oracle = ctx.accounts.oracle.key();
    state.fee_vault = ctx.accounts.fee_vault.key();
    state.insurance_fund = ctx.accounts.insurance_fund.key();
    state.usdc_mint = ctx.accounts.usdc_mint.key();
    state.total_long_exposure = 0;
    state.total_short_exposure = 0;
    state.max_long_exposure = u64::MAX;
    state.max_short_exposure = u64::MAX;
    state.fee_bps = DEFAULT_FEE_BPS;
    state.base_funding_rate_per_hour = DEFAULT_BASE_FUNDING_RATE;
    state.skew_factor = DEFAULT_SKEW_FACTOR;
    state.profit_cap_bps = DEFAULT_PROFIT_CAP_BPS;
    state.insurance_fund_bps = DEFAULT_INSURANCE_FUND_BPS;
    state.min_position_size = DEFAULT_MIN_POSITION_SIZE;
    state.is_paused = false;
    state.secondary_authority = Pubkey::default();
    state.last_oracle_update = 0;
    state.auto_pause_threshold = DEFAULT_AUTO_PAUSE_THRESHOLD;
    state.bump = bumps.protocol_state;
    state.usdc_mint_bump = bumps.usdc_mint;
    state.fee_vault_bump = bumps.fee_vault;
    state.insurance_fund_bump = bumps.insurance_fund;

    let oracle = &mut ctx.accounts.oracle;
    oracle.price = 0;
    oracle.last_updated = 0;
    oracle.staleness_threshold = DEFAULT_STALENESS_THRESHOLD;
    oracle.bump = bumps.oracle;

    msg!("pokeliquid initialized. CHARIZARD-PERP market ready.");
    msg!("protocol_state: {}", state.key());
    msg!("oracle: {}", oracle.key());
    msg!("fee_vault: {}", ctx.accounts.fee_vault.key());
    msg!("insurance_fund: {}", ctx.accounts.insurance_fund.key());
    msg!("usdc_mint: {}", ctx.accounts.usdc_mint.key());

    Ok(())
}
