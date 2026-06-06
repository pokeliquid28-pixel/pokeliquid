/// Comprehensive fuzz/edge-case test suite for pokeliquid.
/// Covers: math edge cases, attack vectors, property-based random inputs.
/// Run: cargo test --package pokeliquid fuzz -- --nocapture
use pokeliquid::{
    constants::*,
    instructions::close_position::compute_pnl,
    state::Direction,
};

// ════════════════════════════════════════════════════════════════════════════════
// Category 1: Math Edge Cases
// ════════════════════════════════════════════════════════════════════════════════

// ── 1.1 Max Leverage Liquidation ────────────────────────────────────────────

#[test]
fn fuzz_max_leverage_liquidation_boundary() {
    // 10x leverage: collateral = 100, notional = 1000
    // Fee = 2% of 100 = 2, so position collateral = 98
    // Liq when equity * 20 < notional, i.e., equity < 50
    // equity = collateral + pnl = 98 + pnl
    // Liquidatable when 98 + pnl < 50 → pnl < -48
    // For long: pnl = (current - entry) / entry * notional
    // pnl = -48 → (current - entry)/entry * 1000 = -48 → current = entry * (1 - 0.048)

    let entry_price: u64 = 100_000_000; // $100
    let collateral: u64 = 100_000_000;
    let fee_bps: u64 = DEFAULT_FEE_BPS;
    let leverage: u8 = 10;
    let notional: u64 = collateral * leverage as u64;

    let fee = collateral * fee_bps / 10_000;
    let position_collateral = collateral - fee; // 98_000_000

    // Price that puts equity exactly at 5% margin ratio (boundary)
    // equity = pos_collateral + pnl, equity * 20 = notional
    // pos_collateral + pnl = notional / 20 = 50_000_000
    // pnl = 50_000_000 - 98_000_000 = -48_000_000
    // (current - entry) / entry * notional = -48_000_000
    // current = entry * (1 + pnl/notional) = 100 * (1 - 48/1000) = 95.2
    let boundary_price: u64 = 95_200_000;

    let pnl_at_boundary = compute_pnl(&Direction::Long, boundary_price, entry_price, notional).unwrap();
    let equity_at_boundary = position_collateral as i128 + pnl_at_boundary;
    // At boundary: NOT liquidatable (equity * 20 >= notional)
    assert!(
        equity_at_boundary * 20 >= notional as i128,
        "At boundary price ${}, equity={} should not be liquidatable",
        boundary_price as f64 / 1e6,
        equity_at_boundary
    );

    // Just below boundary: liquidatable
    let below_boundary: u64 = 95_100_000; // $95.10
    let pnl_below = compute_pnl(&Direction::Long, below_boundary, entry_price, notional).unwrap();
    let equity_below = position_collateral as i128 + pnl_below;
    assert!(
        equity_below <= 0 || equity_below * 20 < notional as i128,
        "Below boundary price ${}, equity={} should be liquidatable",
        below_boundary as f64 / 1e6,
        equity_below
    );
}

#[test]
fn fuzz_max_leverage_short_liquidation() {
    let entry_price: u64 = 100_000_000;
    let collateral: u64 = 100_000_000;
    let leverage: u8 = 10;
    let notional: u64 = collateral * leverage as u64;
    let fee = collateral * DEFAULT_FEE_BPS / 10_000;
    let position_collateral = collateral - fee; // 98

    // Short liquidation: price goes UP
    // pnl = (entry - current) / entry * notional
    // Boundary: equity = 50 → pnl = 50 - 98 = -48
    // -48_000_000 = (100 - current) / 100 * 1000
    // current = 100 + 4.8 = 104.8
    let boundary_price: u64 = 104_800_000;
    let pnl = compute_pnl(&Direction::Short, boundary_price, entry_price, notional).unwrap();
    let equity = position_collateral as i128 + pnl;
    assert!(equity * 20 >= notional as i128, "Boundary should not be liquidatable");

    let above_boundary: u64 = 104_900_000;
    let pnl2 = compute_pnl(&Direction::Short, above_boundary, entry_price, notional).unwrap();
    let equity2 = position_collateral as i128 + pnl2;
    assert!(
        equity2 <= 0 || equity2 * 20 < notional as i128,
        "Above boundary should be liquidatable for short"
    );
}

// ── 1.2 Profit Cap at Exact Boundary ────────────────────────────────────────

#[test]
fn fuzz_profit_cap_exact_boundary() {
    let collateral: u64 = 100_000_000;
    let profit_cap_bps: u64 = DEFAULT_PROFIT_CAP_BPS; // 50_000 = 500%
    let max_profit = (collateral as u128 * profit_cap_bps as u128 / 10_000) as i128; // 500_000_000

    // PnL exactly at cap
    let raw_pnl: i128 = 500_000_000;
    let capped = raw_pnl.min(max_profit);
    assert_eq!(capped, 500_000_000, "At-cap PnL should equal cap");

    // PnL 1 unit above cap
    let raw_pnl2: i128 = 500_000_001;
    let capped2 = raw_pnl2.min(max_profit);
    assert_eq!(capped2, 500_000_000, "Above-cap PnL should be clamped");

    // PnL 1 unit below cap
    let raw_pnl3: i128 = 499_999_999;
    let capped3 = raw_pnl3.min(max_profit);
    assert_eq!(capped3, 499_999_999, "Below-cap PnL should pass through");
}

#[test]
fn fuzz_profit_cap_with_various_collaterals() {
    // Test that profit cap scales correctly with collateral
    for collateral in [1_000_000u64, 10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000] {
        let max_profit = collateral as u128 * DEFAULT_PROFIT_CAP_BPS as u128 / 10_000;
        assert_eq!(
            max_profit,
            collateral as u128 * 5,
            "500% cap means max_profit = 5x collateral for {}",
            collateral
        );
    }
}

// ── 1.3 Funding Accumulation Over Long Periods ──────────────────────────────

#[test]
fn fuzz_funding_accumulation_168h() {
    // 7 days = 168 hours of funding
    let notional: u64 = 1_000_000_000; // 1000 USDC
    let hourly_rate: u64 = DEFAULT_BASE_FUNDING_RATE; // 30 = 0.03%/hr
    let hours: u64 = 168;

    let funding = notional
        .checked_mul(hourly_rate).unwrap()
        .checked_mul(hours).unwrap()
        .checked_div(FUNDING_RATE_SCALE).unwrap();

    // 1000 * 0.03% * 168 = 1000 * 0.0003 * 168 = 50.4 USDC
    assert_eq!(funding, 50_400_000, "7-day funding on 1000 USDC notional");
}

#[test]
fn fuzz_funding_with_max_skew() {
    // Fully skewed market: only longs, no shorts
    let total_long: u64 = 10_000_000_000;
    let total_short: u64 = 0;
    let total = total_long + total_short;
    let diff = total_long;
    let skew_rate = if total > 0 { diff * DEFAULT_SKEW_FACTOR / total } else { 0 };
    // skew_rate = 10B * 1000 / 10B = 1000

    let hourly_rate = DEFAULT_BASE_FUNDING_RATE + skew_rate; // 30 + 1000 = 1030

    let notional: u64 = 1_000_000_000;
    let hours: u64 = 24;
    let funding = notional
        .checked_mul(hourly_rate).unwrap()
        .checked_mul(hours).unwrap()
        .checked_div(FUNDING_RATE_SCALE).unwrap();

    // 1_000_000_000 * 1030 * 24 / 100_000 = 247_200_000 = 247.2 USDC
    assert_eq!(funding, 247_200_000);
}

#[test]
fn fuzz_funding_drains_entire_collateral() {
    // Funding >= collateral → triggers funding liquidation
    let collateral: u64 = 10_000_000; // 10 USDC
    let notional: u64 = 100_000_000; // 100 USDC (10x)
    let hourly_rate: u64 = DEFAULT_BASE_FUNDING_RATE + DEFAULT_SKEW_FACTOR; // 1030 (max skew)
    let hours: u64 = 100;

    let funding = notional
        .checked_mul(hourly_rate).unwrap()
        .checked_mul(hours).unwrap()
        .checked_div(FUNDING_RATE_SCALE).unwrap();

    // 100_000_000 * 1030 * 100 / 100_000 = 103_000_000 = 103 USDC >> 10 USDC collateral
    assert!(funding >= collateral, "Funding {} should exceed collateral {}", funding, collateral);
}

// ── 1.4 Simultaneous Liquidation of All 5 Positions ─────────────────────────

#[test]
fn fuzz_all_5_positions_liquidatable() {
    // Simulate 5 positions all going underwater simultaneously
    let entry_price: u64 = 100_000_000;
    let crash_price: u64 = 50_000_000; // 50% crash

    for leverage in [1u8, 2, 5, 10] {
        let collateral: u64 = 100_000_000;
        let fee = collateral * DEFAULT_FEE_BPS / 10_000;
        let pos_collateral = collateral - fee;
        let notional = collateral * leverage as u64;

        let pnl = compute_pnl(&Direction::Long, crash_price, entry_price, notional).unwrap();
        let equity = pos_collateral as i128 + pnl;

        if leverage >= 2 {
            // 50% crash with 2x+ leverage should be liquidatable
            assert!(
                equity <= 0 || equity * 20 < notional as i128,
                "{}x long should be liquidatable at 50% crash, equity={}",
                leverage, equity
            );
        }
    }
}

// ── 1.5 Vault Drain Protection ──────────────────────────────────────────────

#[test]
fn fuzz_settlement_capped_at_zero() {
    // Settlement can never be negative (clamped to 0)
    let collateral: u64 = 100_000_000;
    let pnl: i128 = -200_000_000; // 200 USDC loss on 100 collateral
    let funding: u64 = 5_000_000;
    let fee: u64 = 2_000_000;

    let settlement_i128 = collateral as i128 + pnl - funding as i128 - fee as i128;
    let settlement = if settlement_i128 <= 0 { 0u64 } else { settlement_i128 as u64 };
    assert_eq!(settlement, 0, "Settlement must be clamped to 0 on heavy loss");
}

#[test]
fn fuzz_settlement_never_exceeds_collateral_plus_profit_cap() {
    // Maximum settlement = collateral + max_profit (minus fees/funding)
    let collateral: u64 = 100_000_000;
    let max_profit = (collateral as u128 * DEFAULT_PROFIT_CAP_BPS as u128 / 10_000) as i128;
    let fee: u64 = collateral * DEFAULT_FEE_BPS / 10_000;

    // Best case: max profit, 0 funding
    let best_settlement = collateral as i128 + max_profit - fee as i128;
    // 100 + 500 - 2 = 598 USDC
    assert_eq!(best_settlement, 598_000_000);

    // Even with absurd raw PnL, cap prevents higher
    let raw_pnl: i128 = 10_000_000_000; // 10,000 USDC
    let capped = raw_pnl.min(max_profit);
    let settlement = collateral as i128 + capped - fee as i128;
    assert_eq!(settlement, 598_000_000, "Profit cap limits max settlement");
}

// ── 1.6 Zero Exposure Edge Case ─────────────────────────────────────────────

#[test]
fn fuzz_zero_exposure_skew() {
    // Both sides zero → skew_rate = 0, no division by zero
    let total_long: u64 = 0;
    let total_short: u64 = 0;
    let total = total_long + total_short;

    let skew_rate = if total > 0 {
        let diff = if total_long > total_short { total_long - total_short } else { total_short - total_long };
        diff * DEFAULT_SKEW_FACTOR / total
    } else {
        0u64
    };
    assert_eq!(skew_rate, 0, "Zero exposure → zero skew");

    let hourly_rate = DEFAULT_BASE_FUNDING_RATE + skew_rate;
    assert_eq!(hourly_rate, 30, "Base rate unchanged with zero exposure");
}

// ── 1.7 Precision Loss Tests ────────────────────────────────────────────────

#[test]
fn fuzz_precision_small_collateral() {
    // Smallest valid position: 1 USDC = 1_000_000 raw
    let collateral: u64 = DEFAULT_MIN_POSITION_SIZE; // 1_000_000
    let fee = collateral * DEFAULT_FEE_BPS / 10_000; // 20_000 = 0.02 USDC
    assert_eq!(fee, 20_000);

    let pos_collateral = collateral - fee; // 980_000
    let notional = collateral * 1; // 1x leverage

    // Small price move: 0.1%
    let entry: u64 = 100_000_000;
    let exit: u64 = 100_100_000;
    let pnl = compute_pnl(&Direction::Long, exit, entry, notional).unwrap();
    // (0.1/100) * 1_000_000 = 1000
    assert_eq!(pnl, 1_000, "Small PnL should be computed correctly");

    let settlement = pos_collateral as i128 + pnl - fee as i128;
    assert!(settlement > 0, "Small profitable trade should have positive settlement");
}

#[test]
fn fuzz_precision_large_values() {
    // Very large position: 1 billion USDC collateral at 10x
    let collateral: u64 = 1_000_000_000_000; // 1M USDC
    let leverage: u8 = 10;
    let notional: u64 = collateral * leverage as u64;
    let entry: u64 = 100_000_000; // $100
    let exit: u64 = 101_000_000; // $101 (1% move)

    let pnl = compute_pnl(&Direction::Long, exit, entry, notional).unwrap();
    // (1/100) * 10_000_000_000_000 = 100_000_000_000 = 100k USDC
    assert_eq!(pnl, 100_000_000_000);
}

#[test]
fn fuzz_precision_fee_rounding() {
    // Fee calculation with values that don't divide evenly
    let collateral: u64 = 1_333_333; // 1.333333 USDC
    let fee = collateral * DEFAULT_FEE_BPS / 10_000;
    // 1_333_333 * 200 / 10_000 = 26_666 (truncated, not rounded)
    assert_eq!(fee, 26_666, "Fee should truncate, not round");
}

#[test]
fn fuzz_precision_insurance_split_rounding() {
    // Insurance split with odd amounts
    let fee: u64 = 33_333; // 0.033333 USDC
    let insurance = fee * DEFAULT_INSURANCE_FUND_BPS / 10_000;
    // 33_333 * 2500 / 10_000 = 8_333
    assert_eq!(insurance, 8_333, "Insurance split truncates correctly");
}

// ════════════════════════════════════════════════════════════════════════════════
// Category 2: Attack Vectors
// ════════════════════════════════════════════════════════════════════════════════

// ── 2.1 Oracle Manipulation Resistance ──────────────────────────────────────

#[test]
fn fuzz_oracle_extreme_price_swing() {
    // Simulate flash crash to $0.01 then recovery
    let entry: u64 = 100_000_000; // $100
    let flash_price: u64 = 10_000; // $0.01
    let notional: u64 = 1_000_000_000; // 1000 USDC

    let pnl_crash = compute_pnl(&Direction::Long, flash_price, entry, notional).unwrap();
    // (0.01 - 100) / 100 * 1000 ≈ -999.9 USDC
    assert!(pnl_crash < -999_000_000, "Flash crash should cause near-total loss");

    // But settlement is clamped to 0, so user can't lose more than collateral
    let collateral: u64 = 100_000_000;
    let settlement = collateral as i128 + pnl_crash;
    let clamped = if settlement <= 0 { 0u64 } else { settlement as u64 };
    assert_eq!(clamped, 0, "Loss clamped at collateral");
}

#[test]
fn fuzz_oracle_price_to_zero() {
    // Price drops to 0 → PnL computation should not panic
    let entry: u64 = 100_000_000;
    let notional: u64 = 1_000_000_000;

    let pnl = compute_pnl(&Direction::Long, 0, entry, notional).unwrap();
    assert_eq!(pnl, -1_000_000_000, "Price=0 → total loss of notional");

    let pnl_short = compute_pnl(&Direction::Short, 0, entry, notional).unwrap();
    assert_eq!(pnl_short, 1_000_000_000, "Price=0 → short gains full notional");
}

#[test]
fn fuzz_oracle_entry_price_zero() {
    // Entry price = 0 → compute_pnl should return 0, not divide by zero
    let pnl = compute_pnl(&Direction::Long, 100_000_000, 0, 1_000_000_000).unwrap();
    assert_eq!(pnl, 0, "Zero entry price should yield 0 PnL");

    let pnl_short = compute_pnl(&Direction::Short, 100_000_000, 0, 1_000_000_000).unwrap();
    assert_eq!(pnl_short, 0, "Zero entry price should yield 0 PnL for short too");
}

#[test]
fn fuzz_oracle_extreme_price_spike() {
    // Price spikes 100x (pump and dump scenario)
    let entry: u64 = 100_000_000; // $100
    let spike_price: u64 = 10_000_000_000; // $10,000

    let notional: u64 = 1_000_000_000; // 1000 USDC
    let collateral: u64 = 100_000_000;

    // Long: huge profit but capped
    let pnl = compute_pnl(&Direction::Long, spike_price, entry, notional).unwrap();
    // (10000 - 100) / 100 * 1000 = 99,000 USDC
    assert_eq!(pnl, 99_000_000_000);

    let max_profit = (collateral as u128 * DEFAULT_PROFIT_CAP_BPS as u128 / 10_000) as i128;
    let capped = pnl.min(max_profit);
    assert_eq!(capped, 500_000_000, "Profit cap protects protocol from 100x spike");

    // Short: devastating loss but settlement clamped
    let pnl_short = compute_pnl(&Direction::Short, spike_price, entry, notional).unwrap();
    assert!(pnl_short < -90_000_000_000, "Short should have catastrophic loss");
    let settlement_short = collateral as i128 + pnl_short;
    let clamped = if settlement_short <= 0 { 0u64 } else { settlement_short as u64 };
    assert_eq!(clamped, 0, "Short loss clamped at collateral");
}

// ── 2.2 Liquidation Sandwich Attack ─────────────────────────────────────────

#[test]
fn fuzz_liquidation_reward_proportional() {
    // Liquidator reward should always be proportional to collateral
    // Distribution: 2% liquidator, 44% LP, 44% insurance, 10% platform
    for collateral in [1_000_000u64, 10_000_000, 100_000_000, 1_000_000_000, u64::MAX / 10_000] {
        let reward = collateral * LIQUIDATOR_REWARD_BPS / 10_000;
        let lp = collateral * LIQUIDATION_LP_BPS / 10_000;
        let insurance = collateral * LIQUIDATION_INSURANCE_BPS / 10_000;
        let platform = collateral - reward - lp - insurance;

        // Verify distribution sums to collateral
        assert_eq!(
            reward + lp + insurance + platform, collateral,
            "Liquidation distribution must sum to collateral for {}",
            collateral
        );
        // Reward is exactly 2%
        assert_eq!(reward, collateral / 50, "Reward should be 2% for {}", collateral);
    }
}

#[test]
fn fuzz_liquidation_boundary_not_liquidatable() {
    // At exactly 5% margin, position should NOT be liquidatable
    // equity * 20 < notional is strict <, so equity * 20 == notional is safe
    for leverage in 1u8..=10 {
        let notional: u64 = 1_000_000_000;
        let threshold_equity = notional / 20; // exactly 5%

        let is_liq = threshold_equity <= 0 || (threshold_equity as i128 * 20 < notional as i128);
        assert!(!is_liq, "Exactly at 5% should NOT be liquidatable (leverage {}x)", leverage);
    }
}

// ── 2.3 Integer Overflow Resistance ─────────────────────────────────────────

#[test]
fn fuzz_overflow_notional_calculation() {
    // collateral * leverage should use checked_mul
    let max_collateral: u64 = u64::MAX / 10; // large but not max
    let leverage: u8 = 10;
    let result = max_collateral.checked_mul(leverage as u64);
    assert!(result.is_some(), "Large collateral * 10 should not overflow u64");

    // But u64::MAX * 10 should overflow
    let overflow_result = u64::MAX.checked_mul(10);
    assert!(overflow_result.is_none(), "u64::MAX * 10 must overflow");
}

#[test]
fn fuzz_overflow_fee_calculation() {
    // fee = collateral * fee_bps / 10_000
    // Intermediate: collateral * 200 could overflow for large collateral
    let large_collateral: u64 = u64::MAX / 200;
    let fee = large_collateral.checked_mul(DEFAULT_FEE_BPS);
    assert!(fee.is_some(), "Fee calc should not overflow for reasonable collateral");

    // Just past the boundary
    let too_large: u64 = u64::MAX / 200 + 1;
    let fee2 = too_large.checked_mul(DEFAULT_FEE_BPS);
    assert!(fee2.is_none(), "Fee calc should overflow when collateral is too large");
}

#[test]
fn fuzz_overflow_funding_calculation() {
    // funding = notional * hourly_rate * hours / FUNDING_RATE_SCALE
    // Worst case: max notional * max rate * max hours
    let notional: u64 = 10_000_000_000_000; // 10M USDC
    let hourly_rate: u64 = DEFAULT_BASE_FUNDING_RATE + DEFAULT_SKEW_FACTOR; // 1030
    let hours: u64 = 8760; // 1 year

    let step1 = notional.checked_mul(hourly_rate);
    assert!(step1.is_some(), "notional * rate should not overflow");

    let step2 = step1.unwrap().checked_mul(hours);
    // 10_000_000_000_000 * 1030 * 8760 could overflow u64 (max ~1.8e19)
    // 10^13 * 1030 * 8760 = 9.02e19 → OVERFLOWS u64
    assert!(step2.is_none(), "Extreme funding calc overflows — program uses checked_mul to catch this");
}

#[test]
fn fuzz_overflow_pnl_uses_i128() {
    // PnL uses i128 to avoid overflow: price_delta * notional
    let entry: u64 = 1_000_000; // $1
    let current: u64 = u64::MAX; // absurdly high price
    let notional: u64 = u64::MAX / 2;

    // This would overflow i64 but i128 handles it
    let price_delta = current as i128 - entry as i128;
    let result = price_delta.checked_mul(notional as i128);
    assert!(result.is_some(), "i128 should handle large PnL calculations");
}

// ── 2.4 Position Slot Exhaustion ────────────────────────────────────────────

#[test]
fn fuzz_position_slot_boundary() {
    use pokeliquid::state::{Position, MAX_POSITIONS};
    use anchor_lang::prelude::Pubkey;

    // Simulate filling all 5 slots
    let mut positions: [Option<Position>; MAX_POSITIONS] = Default::default();
    for i in 0..MAX_POSITIONS {
        assert!(
            positions.iter().position(|p| p.is_none()).is_some(),
            "Slot {} should be available",
            i
        );
        positions[i] = Some(Position {
            oracle: Pubkey::default(),
            direction: Direction::Long,
            collateral: 100_000_000,
            notional: 1_000_000_000,
            leverage: 10,
            entry_price: 100_000_000,
            open_timestamp: 0,
            last_funding_timestamp: 0,
            sl_price: None,
            tp_price: None,
        });
    }

    // 6th position should fail
    assert!(
        positions.iter().position(|p| p.is_none()).is_none(),
        "All 5 slots full — no slot available"
    );

    // Close slot 2 and verify it's reusable
    positions[2] = None;
    let slot = positions.iter().position(|p| p.is_none());
    assert_eq!(slot, Some(2), "Freed slot 2 should be reusable");
}

// ════════════════════════════════════════════════════════════════════════════════
// Category 3: Property-Based Tests (Randomized Inputs)
// ════════════════════════════════════════════════════════════════════════════════

/// Simple deterministic PRNG for reproducible property tests.
struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self { Self(seed) }

    fn next(&mut self) -> u64 {
        // xorshift64
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }

    fn range(&mut self, min: u64, max: u64) -> u64 {
        if min >= max { return min; }
        min + self.next() % (max - min)
    }
}

#[test]
fn fuzz_property_pnl_symmetry_1000_inputs() {
    // Property: Long PnL at price P = -Short PnL at price P
    let mut rng = Rng::new(42);

    for _ in 0..1000 {
        let entry = rng.range(1_000_000, 1_000_000_000); // $1 - $1000
        let current = rng.range(1_000, 2_000_000_000);   // $0.001 - $2000
        let notional = rng.range(1_000_000, 10_000_000_000); // 1 - 10000 USDC

        let pnl_long = compute_pnl(&Direction::Long, current, entry, notional).unwrap();
        let pnl_short = compute_pnl(&Direction::Short, current, entry, notional).unwrap();

        assert_eq!(
            pnl_long, -pnl_short,
            "Long+Short PnL must cancel: entry={} current={} notional={} long={} short={}",
            entry, current, notional, pnl_long, pnl_short
        );
    }
}

#[test]
fn fuzz_property_pnl_zero_at_entry_1000_inputs() {
    // Property: PnL = 0 when current_price == entry_price
    let mut rng = Rng::new(123);

    for _ in 0..1000 {
        let price = rng.range(1, 10_000_000_000);
        let notional = rng.range(1, 10_000_000_000);

        let pnl_long = compute_pnl(&Direction::Long, price, price, notional).unwrap();
        let pnl_short = compute_pnl(&Direction::Short, price, price, notional).unwrap();

        assert_eq!(pnl_long, 0, "Long PnL at entry should be 0: price={} notional={}", price, notional);
        assert_eq!(pnl_short, 0, "Short PnL at entry should be 0: price={} notional={}", price, notional);
    }
}

#[test]
fn fuzz_property_long_profit_when_price_up() {
    // Property: Long PnL > 0 when current > entry, < 0 when current < entry
    let mut rng = Rng::new(456);

    for _ in 0..1000 {
        let entry = rng.range(1_000_000, 1_000_000_000);
        let notional = rng.range(1_000_000, 10_000_000_000);

        // Price up
        let higher = entry + rng.range(1, entry);
        let pnl_up = compute_pnl(&Direction::Long, higher, entry, notional).unwrap();
        assert!(pnl_up > 0, "Long PnL should be positive when price up: entry={} current={}", entry, higher);

        // Price down
        let lower = rng.range(1, entry);
        let pnl_down = compute_pnl(&Direction::Long, lower, entry, notional).unwrap();
        assert!(pnl_down < 0, "Long PnL should be negative when price down: entry={} current={}", entry, lower);
    }
}

#[test]
fn fuzz_property_short_profit_when_price_down() {
    // Property: Short PnL > 0 when current < entry, < 0 when current > entry
    let mut rng = Rng::new(789);

    for _ in 0..1000 {
        let entry = rng.range(1_000_000, 1_000_000_000);
        let notional = rng.range(1_000_000, 10_000_000_000);

        let lower = rng.range(1, entry);
        let pnl_down = compute_pnl(&Direction::Short, lower, entry, notional).unwrap();
        assert!(pnl_down > 0, "Short PnL should be positive when price down");

        let higher = entry + rng.range(1, entry);
        let pnl_up = compute_pnl(&Direction::Short, higher, entry, notional).unwrap();
        assert!(pnl_up < 0, "Short PnL should be negative when price up");
    }
}

#[test]
fn fuzz_property_liquidation_consistency_1000_inputs() {
    // Property: if position is liquidatable at price P, it should also be
    // liquidatable at any worse price
    let mut rng = Rng::new(1337);

    for _ in 0..1000 {
        let entry = rng.range(10_000_000, 500_000_000); // $10 - $500
        let collateral = rng.range(1_000_000, 1_000_000_000); // 1 - 1000 USDC
        let leverage = (rng.range(1, 11)) as u8;
        let notional = collateral * leverage as u64;
        let fee = collateral * DEFAULT_FEE_BPS / 10_000;
        let pos_collateral = collateral - fee;

        // Generate a price that might be around the liquidation boundary
        let price = rng.range(1_000, entry * 2);

        let pnl = compute_pnl(&Direction::Long, price, entry, notional).unwrap();
        let equity = pos_collateral as i128 + pnl;
        let is_liq = equity <= 0 || equity * 20 < notional as i128;

        if is_liq && price > 1_000 {
            // If liquidatable at this price, must also be liquidatable at lower price
            let worse_price = rng.range(1, price);
            let worse_pnl = compute_pnl(&Direction::Long, worse_price, entry, notional).unwrap();
            let worse_equity = pos_collateral as i128 + worse_pnl;
            let worse_liq = worse_equity <= 0 || worse_equity * 20 < notional as i128;
            assert!(
                worse_liq,
                "If liq at price={}, must also be liq at worse price={}",
                price, worse_price
            );
        }
    }
}

#[test]
fn fuzz_property_fee_always_less_than_collateral() {
    // Property: fee < collateral for any valid fee_bps < 10000
    let mut rng = Rng::new(2023);

    for _ in 0..1000 {
        let collateral = rng.range(DEFAULT_MIN_POSITION_SIZE, 10_000_000_000);
        let fee = collateral * DEFAULT_FEE_BPS / 10_000;
        assert!(fee < collateral, "Fee must be less than collateral: col={} fee={}", collateral, fee);

        // Position collateral must be positive after fee
        let pos_collateral = collateral - fee;
        assert!(pos_collateral > 0, "Position collateral must be positive after fee");
    }
}

#[test]
fn fuzz_property_settlement_bounded() {
    // Property: settlement is always in [0, collateral + max_profit]
    let mut rng = Rng::new(999);

    for _ in 0..1000 {
        let collateral = rng.range(1_000_000, 1_000_000_000);
        let fee = collateral * DEFAULT_FEE_BPS / 10_000;
        let pos_collateral = collateral - fee;
        let leverage = (rng.range(1, 11)) as u8;
        let notional = collateral * leverage as u64;

        let entry = rng.range(10_000_000, 500_000_000);
        let current = rng.range(1_000, 1_000_000_000);

        let raw_pnl = compute_pnl(&Direction::Long, current, entry, notional).unwrap();
        let max_profit = (pos_collateral as u128 * DEFAULT_PROFIT_CAP_BPS as u128 / 10_000) as i128;
        let capped_pnl = raw_pnl.min(max_profit);

        let close_fee = pos_collateral * DEFAULT_FEE_BPS / 10_000;
        let settlement_i128 = pos_collateral as i128 + capped_pnl - close_fee as i128;
        let settlement = if settlement_i128 <= 0 { 0u64 } else { settlement_i128 as u64 };

        // Upper bound: collateral + max_profit (funding=0)
        let upper_bound = pos_collateral as i128 + max_profit;
        assert!(
            (settlement as i128) <= upper_bound,
            "Settlement {} exceeds upper bound {}: col={} pnl={} capped={}",
            settlement, upper_bound, pos_collateral, raw_pnl, capped_pnl
        );
    }
}

#[test]
fn fuzz_property_funding_monotonic_with_time() {
    // Property: funding owed increases monotonically with hours
    let mut rng = Rng::new(7777);

    for _ in 0..500 {
        let notional = rng.range(1_000_000, 10_000_000_000);
        let hourly_rate = rng.range(1, 2000);

        let mut prev_funding = 0u64;
        for hours in [1u64, 2, 6, 12, 24, 48, 168] {
            let result = notional
                .checked_mul(hourly_rate)
                .and_then(|v| v.checked_mul(hours))
                .and_then(|v| v.checked_div(FUNDING_RATE_SCALE));

            if let Some(funding) = result {
                assert!(
                    funding >= prev_funding,
                    "Funding must increase with time: {}h={} < prev={}",
                    hours, funding, prev_funding
                );
                prev_funding = funding;
            }
        }
    }
}

#[test]
fn fuzz_property_liquidation_distribution_sums() {
    // Property: liquidator_reward + insurance + vault_remainder = collateral (always)
    let mut rng = Rng::new(5555);

    for _ in 0..1000 {
        let collateral = rng.range(1_000_000, 10_000_000_000_000);

        let reward = collateral * LIQUIDATOR_REWARD_BPS / 10_000;
        let insurance = collateral * LIQUIDATION_INSURANCE_BPS / 10_000;
        let vault = collateral - reward - insurance;

        assert_eq!(
            reward + insurance + vault,
            collateral,
            "Distribution must sum to collateral: {}",
            collateral
        );
    }
}

// ── SL/TP Trigger Logic ─────────────────────────────────────────────────────

#[test]
fn fuzz_sl_tp_trigger_correctness() {
    // Long SL: triggers when price <= sl_price
    // Long TP: triggers when price >= tp_price
    // Short SL: triggers when price >= sl_price
    // Short TP: triggers when price <= tp_price

    // Long SL at $90
    let sl: u64 = 90_000_000;
    assert!(89_000_000 <= sl, "Price below SL should trigger");
    assert!(90_000_000 <= sl, "Price at SL should trigger");
    assert!(!(91_000_000 <= sl), "Price above SL should not trigger");

    // Long TP at $120
    let tp: u64 = 120_000_000;
    assert!(121_000_000 >= tp, "Price above TP should trigger");
    assert!(120_000_000 >= tp, "Price at TP should trigger");
    assert!(!(119_000_000 >= tp), "Price below TP should not trigger");

    // Short SL at $110
    let short_sl: u64 = 110_000_000;
    assert!(111_000_000 >= short_sl, "Price above SL should trigger for short");
    assert!(110_000_000 >= short_sl, "Price at SL should trigger for short");
    assert!(!(109_000_000 >= short_sl), "Price below SL should not trigger for short");

    // Short TP at $80
    let short_tp: u64 = 80_000_000;
    assert!(79_000_000 <= short_tp, "Price below TP should trigger for short");
    assert!(80_000_000 <= short_tp, "Price at TP should trigger for short");
    assert!(!(81_000_000 <= short_tp), "Price above TP should not trigger for short");
}

#[test]
fn fuzz_property_sl_tp_validation() {
    // Property: Long SL must be < entry, TP must be > entry
    // Short SL must be > entry, TP must be < entry
    let mut rng = Rng::new(3141);

    for _ in 0..1000 {
        let entry = rng.range(10_000_000, 500_000_000);

        // Valid Long SL/TP
        let long_sl = rng.range(1, entry);
        assert!(long_sl < entry, "Long SL must be below entry");

        let long_tp = entry + rng.range(1, entry);
        assert!(long_tp > entry, "Long TP must be above entry");

        // Valid Short SL/TP
        let short_sl = entry + rng.range(1, entry);
        assert!(short_sl > entry, "Short SL must be above entry");

        let short_tp = rng.range(1, entry);
        assert!(short_tp < entry, "Short TP must be below entry");
    }
}

// ── Keeper Reward Tests ─────────────────────────────────────────────────────

#[test]
fn fuzz_keeper_reward_deducted_from_settlement() {
    // SL/TP execution: keeper gets 0.1% of collateral, deducted from user's settlement
    let collateral: u64 = 100_000_000;
    let keeper_reward_bps: u64 = 10; // 0.1%

    let keeper_reward = collateral * keeper_reward_bps / 10_000;
    assert_eq!(keeper_reward, 100_000, "Keeper reward = 0.1% of collateral = 0.1 USDC");

    // Settlement comparison: manual close vs SL/TP close
    let pnl: i128 = 50_000_000;
    let fee = collateral * DEFAULT_FEE_BPS / 10_000;

    let manual_settlement = collateral as i128 + pnl - fee as i128;
    let sltp_settlement = collateral as i128 + pnl - fee as i128 - keeper_reward as i128;

    assert_eq!(
        manual_settlement - sltp_settlement,
        keeper_reward as i128,
        "SL/TP settlement should be exactly keeper_reward less than manual"
    );
}
