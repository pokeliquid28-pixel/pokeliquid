use anchor_lang::prelude::*;

// ─── Protocol State ───────────────────────────────────────────────────────────

#[account]
pub struct ProtocolState {
    pub admin: Pubkey,
    pub oracle: Pubkey,
    pub fee_vault: Pubkey,
    pub insurance_fund: Pubkey,
    pub usdc_mint: Pubkey,
    pub total_long_exposure: u64,
    pub total_short_exposure: u64,
    pub max_long_exposure: u64,
    pub max_short_exposure: u64,
    pub fee_bps: u64,
    pub base_funding_rate_per_hour: u64,
    pub skew_factor: u64,
    pub profit_cap_bps: u64,
    pub insurance_fund_bps: u64,
    pub min_position_size: u64,
    pub is_paused: bool,
    pub bump: u8,
    pub usdc_mint_bump: u8,
    pub fee_vault_bump: u8,
    pub insurance_fund_bump: u8,
    pub secondary_authority: Pubkey,
    pub last_oracle_update: i64,
    pub auto_pause_threshold: i64,
    pub manual_pause: bool,
    /// Running total of user-owned USDC in fee_vault (collateral + position collateral).
    /// withdraw_fees cannot withdraw below this amount.
    pub total_user_collateral: u64,
    /// Two-step admin transfer: pending new admin must call accept_admin to complete.
    pub pending_admin: Option<Pubkey>,
    /// Running total of unclaimed referral fees in fee_vault.
    pub total_referral_pending: u64,
}

impl ProtocolState {
    // 8 disc + 6*32 pub + 12*8 u64 + 2 bool + 4*1 bumps + 2*8 i64 + (1+32) pending_admin
    pub const SPACE: usize = 8 + 192 + 96 + 2 + 4 + 16 + 33;
}

// ─── Oracle Account ───────────────────────────────────────────────────────────

#[account]
pub struct OracleAccount {
    pub price: u64,
    pub last_updated: i64,
    pub staleness_threshold: i64,
    pub bump: u8,
}

impl OracleAccount {
    pub const SPACE: usize = 8 + 8 + 8 + 8 + 1 + 32;
}

// ─── Market State ────────────────────────────────────────────────────────────

#[account]
pub struct MarketState {
    pub market_id: [u8; 32],
    pub oracle: Pubkey,
    pub long_open_interest: u64,
    pub short_open_interest: u64,
    pub max_long_oi: u64,
    pub max_short_oi: u64,
    pub bump: u8,
}

impl MarketState {
    // 8 disc + 32 market_id + 32 oracle + 4*8 u64 + 1 bump + 32 padding
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 1 + 32;

    /// Return market_id trimmed of trailing zeros (matches init seed length).
    pub fn market_id_trimmed(&self) -> &[u8] {
        let len = self.market_id.iter().rposition(|&b| b != 0).map_or(0, |i| i + 1);
        &self.market_id[..len]
    }
}

// ─── Margin Account ───────────────────────────────────────────────────────────

pub const MAX_POSITIONS: usize = 5;

#[account]
pub struct MarginAccount {
    pub owner: Pubkey,
    pub collateral: u64,
    pub positions: [Option<Position>; MAX_POSITIONS],
    pub bump: u8,
}

impl MarginAccount {
    // 8 disc + 32 owner + 8 collateral + 5 * (1 option_tag + Position::SPACE) + 1 bump + 32 padding = 546
    pub const SPACE: usize = 8 + 32 + 8 + MAX_POSITIONS * (1 + Position::SPACE) + 1 + 32;

    pub fn open_position_count(&self) -> u8 {
        self.positions.iter().filter(|p| p.is_some()).count() as u8
    }

    pub fn first_open_slot(&self) -> Option<usize> {
        self.positions.iter().position(|p| p.is_none())
    }
}

// ─── Position ─────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct Position {
    pub oracle: Pubkey,
    pub direction: Direction,
    pub collateral: u64,
    pub notional: u64,
    pub leverage: u8,
    pub entry_price: u64,
    pub open_timestamp: i64,
    pub last_funding_timestamp: i64,
    pub sl_price: Option<u64>,
    pub tp_price: Option<u64>,
}

impl Position {
    // 32 + 1 + 8 + 8 + 1 + 8 + 8 + 8 + (1+8) + (1+8) = 92
    pub const SPACE: usize = 32 + 1 + 8 + 8 + 1 + 8 + 8 + 8 + 9 + 9;
}

// ─── Close Reason ────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum CloseReason {
    Manual,
    StopLoss,
    TakeProfit,
    Liquidation,
    AdminForced,
}

// ─── Direction ────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum Direction {
    Long,
    Short,
}

// ─── Liquidity Pool ──────────────────────────────────────────────────────

/// Precision multiplier for acc_fee_per_share (1e12).
pub const FEE_PER_SHARE_PRECISION: u128 = 1_000_000_000_000;

#[account]
pub struct LiquidityPool {
    pub total_usdc: u64,
    pub total_shares: u64,
    pub accumulated_fees: u64,
    pub lp_fee_bps: u64,
    pub bump: u8,
    pub vault_bump: u8,
    pub total_fees_claimed: u64,
    /// MasterChef-style accumulator: total fees per share (scaled by 1e12).
    /// Monotonically increasing. Used for fair fee distribution across LPs.
    pub acc_fee_per_share: u128,
}

impl LiquidityPool {
    // 8 disc + 5*8 u64 + 2*1 bumps + 1*16 u128 + 8 padding
    pub const SPACE: usize = 8 + 40 + 2 + 16 + 8;
}

// ─── LP Position ─────────────────────────────────────────────────────────

#[account]
pub struct LpPosition {
    pub owner: Pubkey,
    pub shares: u64,
    pub usdc_deposited: u64,
    pub fees_claimed: u64,
    pub bump: u8,
    /// MasterChef reward_debt = shares * acc_fee_per_share at last deposit/withdraw.
    pub reward_debt: u128,
}

impl LpPosition {
    // 8 disc + 32 owner + 3*8 u64 + 1 bump + 1*16 u128 + 16 padding
    pub const SPACE: usize = 8 + 32 + 24 + 1 + 16 + 16;
}

// ─── Referral Account ────────────────────────────────────────────────────────

pub const MAX_USERNAME_LEN: usize = 32;

#[account]
pub struct ReferralAccount {
    pub owner: Pubkey,
    pub username: [u8; MAX_USERNAME_LEN],
    pub username_len: u8,
    pub pending_fees: u64,
    pub total_earned: u64,
    pub total_referrals: u64,
    pub bump: u8,
    /// Admin-configurable fee share in bps (0 = use default/auto, 1000-3000 = 10-30%).
    pub fee_share_bps: u64,
    /// Number of unique traders who have used this referral code.
    pub unique_referrals: u64,
    /// Total trading fees generated by referred trades (raw USDC, 6 decimals).
    pub total_fees_generated: u64,
}

impl ReferralAccount {
    // 8 disc + 32 owner + 32 username + 1 username_len + 6*8 u64 + 1 bump + 8 padding
    pub const SPACE: usize = 8 + 32 + MAX_USERNAME_LEN + 1 + 48 + 1 + 8;
}

// ─── Referral Tracker (unique user dedup) ────────────────────────────────────

#[account]
pub struct ReferralTracker {
    pub bump: u8,
}

impl ReferralTracker {
    pub const SPACE: usize = 8 + 1 + 7; // disc + bump + padding
}

// ─── Update Params ────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct ProtocolParams {
    pub fee_bps: Option<u64>,
    pub base_funding_rate_per_hour: Option<u64>,
    pub skew_factor: Option<u64>,
    pub profit_cap_bps: Option<u64>,
    pub max_long_exposure: Option<u64>,
    pub max_short_exposure: Option<u64>,
    pub min_position_size: Option<u64>,
    pub is_paused: Option<bool>,
    pub staleness_threshold: Option<i64>,
    pub secondary_authority: Option<Pubkey>,
    pub auto_pause_threshold: Option<i64>,
    pub insurance_fund_bps: Option<u64>,
    pub lp_fee_bps: Option<u64>,
    pub admin: Option<Pubkey>,
}

// ─── Timelock ────────────────────────────────────────────────────────────────

#[account]
pub struct Timelock {
    /// Pending parameter change
    pub pending_params: Option<ProtocolParams>,
    pub params_execute_after: i64,
    /// Pending fee vault withdrawal
    pub pending_fee_withdrawal: u64,
    pub fee_execute_after: i64,
    /// Pending insurance withdrawal
    pub pending_insurance_withdrawal: u64,
    pub insurance_execute_after: i64,
    pub bump: u8,
}

impl Timelock {
    // Generous size to accommodate serialized ProtocolParams (all Option fields)
    // 8 disc + 1 option tag + ~200 params + 8 timestamp + 8 fee + 8 timestamp + 8 ins + 8 timestamp + 1 bump + padding
    pub const SPACE: usize = 512;
}

// ─── Raffle ──────────────────────────────────────────────────────────────────

#[account]
pub struct RaffleResult {
    pub round: u32,
    pub winner: Pubkey,
    pub total_entries: u64,
    pub total_holders: u32,
    pub winner_tickets: u64,
    pub slot_hash_seed: [u8; 32],
    pub prize_description: [u8; 64],
    pub timestamp: i64,
    pub bump: u8,
}

// ─── Payout Queue (FIFO) ─────────────────────────────────────────────────────

pub const PAYOUT_QUEUE_SIZE: usize = 16;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, Copy)]
pub struct PayoutEntry {
    pub user: Pubkey,       // 32 — wallet to send USDC to
    pub user_ata: Pubkey,   // 32 — user's USDC ATA
    pub amount: u64,        // 8  — USDC owed (6 decimals)
    pub timestamp: i64,     // 8  — when the IOU was created
}
// 80 bytes per entry

#[account]
pub struct PayoutQueue {
    pub head: u16,
    pub tail: u16,
    pub count: u16,
    pub bump: u8,
    pub entries: [PayoutEntry; PAYOUT_QUEUE_SIZE],
}

impl PayoutQueue {
    // 8 disc + 2+2+2+1 + 64*80 = 8 + 7 + 5120 = 5135
    pub const SPACE: usize = 8 + 7 + PAYOUT_QUEUE_SIZE * 80;

    pub fn push(&mut self, entry: PayoutEntry) -> Result<()> {
        require!((self.count as usize) < PAYOUT_QUEUE_SIZE, crate::error::ErrorCode::PayoutQueueFull);
        self.entries[self.tail as usize] = entry;
        self.tail = ((self.tail + 1) % PAYOUT_QUEUE_SIZE as u16) as u16;
        self.count += 1;
        Ok(())
    }

    pub fn peek(&self) -> Option<&PayoutEntry> {
        if self.count == 0 { return None; }
        Some(&self.entries[self.head as usize])
    }

    pub fn pop(&mut self) {
        if self.count == 0 { return; }
        self.entries[self.head as usize] = PayoutEntry::default();
        self.head = ((self.head + 1) % PAYOUT_QUEUE_SIZE as u16) as u16;
        self.count -= 1;
    }
}

impl RaffleResult {
    // 8 disc + 4 round + 32 winner + 8 total_entries + 4 total_holders + 8 winner_tickets + 32 slot_hash_seed + 64 prize_desc + 8 timestamp + 1 bump
    pub const SPACE: usize = 8 + 4 + 32 + 8 + 4 + 8 + 32 + 64 + 8 + 1;
}
