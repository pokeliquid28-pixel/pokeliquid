pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ");

#[program]
pub mod pokeliquid {
    use super::*;

    /// One-time setup. Creates all protocol accounts and sets default parameters.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize::handler(ctx)
    }

    /// One-time setup for the liquidity pool (admin only, run after initialize).
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        initialize_pool::handler(ctx)
    }

    /// Deposit USDC collateral into the protocol.
    pub fn deposit_collateral(ctx: Context<DepositCollateral>, amount: u64) -> Result<()> {
        deposit_collateral::handler(ctx, amount)
    }

    /// Withdraw free (unencumbered) collateral.
    pub fn withdraw_collateral(ctx: Context<WithdrawCollateral>, amount: u64) -> Result<()> {
        withdraw_collateral::handler(ctx, amount)
    }

    /// Close (delete) a margin account and return rent to the user.
    pub fn close_margin_account(ctx: Context<CloseMarginAccount>) -> Result<()> {
        close_margin_account::handler(ctx)
    }

    /// Add margin from free collateral to an open position.
    pub fn add_margin(ctx: Context<AddMargin>, position_index: u8, amount: u64) -> Result<()> {
        add_margin::handler(ctx, position_index, amount)
    }

    /// Remove margin from an open position back to free collateral (health-checked).
    pub fn remove_margin(ctx: Context<RemoveMargin>, position_index: u8, amount: u64) -> Result<()> {
        remove_margin::handler(ctx, position_index, amount)
    }

    /// Permissionless: pause the protocol if oracle is stale beyond threshold.
    pub fn check_and_pause(ctx: Context<CheckAndPause>) -> Result<()> {
        check_and_pause::handler(ctx)
    }

    /// Open a perpetual position with optional SL/TP.
    pub fn open_position(
        ctx: Context<OpenPosition>,
        direction: Direction,
        collateral: u64,
        leverage: u8,
        sl_price: Option<u64>,
        tp_price: Option<u64>,
    ) -> Result<()> {
        open_position::handler(ctx, direction, collateral, leverage, sl_price, tp_price)
    }

    /// Set stop-loss and/or take-profit on an open position.
    pub fn set_sl_tp(
        ctx: Context<SetSlTp>,
        position_index: u8,
        sl_price: Option<u64>,
        tp_price: Option<u64>,
    ) -> Result<()> {
        set_sl_tp::handler(ctx, position_index, sl_price, tp_price)
    }

    /// Close a position by slot index and settle PnL.
    pub fn close_position(ctx: Context<ClosePosition>, position_index: u8) -> Result<()> {
        close_position::handler(ctx, position_index)
    }

    /// Liquidate an undercollateralised position by slot index (anyone can call).
    pub fn liquidate(ctx: Context<Liquidate>, user: Pubkey, position_index: u8) -> Result<()> {
        liquidate::handler(ctx, user, position_index)
    }

    /// Execute a stop-loss or take-profit on any position (permissionless, keeper receives 0.1% reward).
    pub fn execute_sl_tp(ctx: Context<ExecuteSlTp>, user: Pubkey, position_index: u8) -> Result<()> {
        execute_sl_tp::handler(ctx, user, position_index)
    }

    /// Settle accrued funding on all positions in a margin account (permissionless crank).
    pub fn settle_funding(ctx: Context<SettleFunding>) -> Result<()> {
        settle_funding::handler(ctx)
    }

    /// LP: deposit USDC into the liquidity pool, receive shares.
    pub fn lp_deposit(ctx: Context<LpDeposit>, amount: u64) -> Result<()> {
        lp_deposit::handler(ctx, amount)
    }

    /// LP: withdraw USDC from the liquidity pool by burning shares.
    pub fn lp_withdraw(ctx: Context<LpWithdraw>, shares: u64) -> Result<()> {
        lp_withdraw::handler(ctx, shares)
    }

    /// LP: claim accumulated trading fees.
    pub fn claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
        claim_fees::handler(ctx)
    }

    /// Admin: push a new oracle price (default market).
    pub fn update_oracle(ctx: Context<UpdateOracle>, price: u64) -> Result<()> {
        update_oracle::handler(ctx, price)
    }

    /// Admin: initialize a market-specific oracle account.
    pub fn init_market_oracle(ctx: Context<InitMarketOracle>, market_id: String) -> Result<()> {
        init_market_oracle::handler(ctx, market_id)
    }

    /// Admin: push a price to a market-specific oracle.
    pub fn update_market_oracle(ctx: Context<UpdateMarketOracle>, market_id: String, price: u64) -> Result<()> {
        update_market_oracle::handler(ctx, market_id, price)
    }

    /// Admin: update protocol parameters.
    pub fn update_params(ctx: Context<UpdateProtocolParams>, params: ProtocolParams) -> Result<()> {
        update_params::handler(ctx, params)
    }

    /// Admin: withdraw USDC from the fee vault.
    pub fn withdraw_fees(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
        withdraw_fees::handler(ctx, amount)
    }

    /// Admin: withdraw USDC from the insurance fund.
    pub fn withdraw_insurance(ctx: Context<WithdrawInsurance>, amount: u64) -> Result<()> {
        withdraw_insurance::handler(ctx, amount)
    }

    /// Devnet helper: mint 1000 USDC to the caller (no auth required).
    pub fn mint_devnet_usdc(ctx: Context<MintDevnetUsdc>) -> Result<()> {
        mint_devnet_usdc::handler(ctx)
    }
}
