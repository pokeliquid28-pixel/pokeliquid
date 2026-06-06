/// Integration tests for pokeliquid using litesvm.
/// Run: cargo test (builds .so first via anchor build)
use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::instruction::Instruction,
        InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    pokeliquid::{
        constants::*,
        instructions::close_position::compute_pnl,
        state::{Direction, MarginAccount, Position},
    },
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

// SysvarRent111111111111111111111111111111111
const RENT_SYSVAR: &str = "SysvarRent111111111111111111111111111111111";
fn rent_id() -> Pubkey { RENT_SYSVAR.parse().unwrap() }

fn program_id() -> Pubkey {
    pokeliquid::id()
}

fn protocol_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[PROTOCOL_SEED], &program_id())
}

fn oracle_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[ORACLE_SEED], &program_id())
}

fn usdc_mint_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[USDC_MINT_SEED], &program_id())
}

fn fee_vault_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[FEE_VAULT_SEED], &program_id())
}

fn insurance_fund_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[INSURANCE_FUND_SEED], &program_id())
}

fn margin_pda(user: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[MARGIN_SEED, user.as_ref()], &program_id())
}

// ── Pure Math Tests ────────────────────────────────────────────────────────────

#[test]
fn test_compute_pnl_long_profit() {
    // Price goes from 100 to 120: 20% gain on notional
    let pnl = compute_pnl(&Direction::Long, 120_000_000, 100_000_000, 1_000_000_000).unwrap();
    // (120-100)/100 * 1000 = 200 USDC profit
    assert_eq!(pnl, 200_000_000);
}

#[test]
fn test_compute_pnl_long_loss() {
    // Price goes from 100 to 80: 20% loss
    let pnl = compute_pnl(&Direction::Long, 80_000_000, 100_000_000, 1_000_000_000).unwrap();
    assert_eq!(pnl, -200_000_000);
}

#[test]
fn test_compute_pnl_short_profit() {
    // Short: price goes from 100 to 80: 20% gain
    let pnl = compute_pnl(&Direction::Short, 80_000_000, 100_000_000, 1_000_000_000).unwrap();
    assert_eq!(pnl, 200_000_000);
}

#[test]
fn test_compute_pnl_short_loss() {
    // Short: price goes from 100 to 120: 20% loss
    let pnl = compute_pnl(&Direction::Short, 120_000_000, 100_000_000, 1_000_000_000).unwrap();
    assert_eq!(pnl, -200_000_000);
}

#[test]
fn test_compute_pnl_zero_entry_price() {
    let pnl = compute_pnl(&Direction::Long, 100_000_000, 0, 1_000_000_000).unwrap();
    assert_eq!(pnl, 0);
}

#[test]
fn test_compute_pnl_no_price_change() {
    let pnl = compute_pnl(&Direction::Long, 100_000_000, 100_000_000, 1_000_000_000).unwrap();
    assert_eq!(pnl, 0);
}

// ── Liquidation Condition Tests ────────────────────────────────────────────────

#[test]
fn test_liquidation_condition_at_5pct() {
    // collateral = 50, notional = 1000 → margin_ratio = 5% → exactly at threshold
    let collateral: u64 = 50_000_000;
    let notional: u64 = 1_000_000_000;
    let unrealized_pnl: i128 = 0;
    let equity = collateral as i128 + unrealized_pnl;
    // liquidatable if equity * 20 < notional
    let liquidatable = equity <= 0 || (equity * 20 < notional as i128);
    // 50 * 20 = 1000 = notional, so NOT liquidatable (strict <)
    assert!(!liquidatable);
}

#[test]
fn test_liquidation_condition_below_5pct() {
    // collateral = 40, notional = 1000 → 4% margin → liquidatable
    let collateral: u64 = 40_000_000;
    let notional: u64 = 1_000_000_000;
    let equity = collateral as i128;
    let liquidatable = equity <= 0 || (equity * 20 < notional as i128);
    assert!(liquidatable); // 40 * 20 = 800 < 1000
}

#[test]
fn test_liquidation_condition_with_negative_pnl() {
    // collateral = 100, loss = 60 → equity = 40, notional = 1000 → liquidatable
    let collateral: u64 = 100_000_000;
    let notional: u64 = 1_000_000_000;
    let unrealized_pnl: i128 = -60_000_000;
    let equity = collateral as i128 + unrealized_pnl;
    let liquidatable = equity <= 0 || (equity * 20 < notional as i128);
    assert!(liquidatable);
}

#[test]
fn test_not_liquidatable_healthy_position() {
    // collateral = 200, notional = 1000 → 20% margin
    let collateral: u64 = 200_000_000;
    let notional: u64 = 1_000_000_000;
    let equity = collateral as i128;
    let liquidatable = equity <= 0 || (equity * 20 < notional as i128);
    assert!(!liquidatable); // 200 * 20 = 4000 > 1000
}

// ── Profit Cap Tests ───────────────────────────────────────────────────────────

#[test]
fn test_profit_cap_applied() {
    // profit_cap_bps = 50000 = 500%. Collateral = 100. Max profit = 500.
    let collateral: u64 = 100_000_000;
    let profit_cap_bps: u64 = 50_000;
    let max_profit = collateral * profit_cap_bps / 10_000;
    assert_eq!(max_profit, 500_000_000); // 500 USDC

    let raw_pnl: i128 = 600_000_000; // 600 USDC
    let capped = raw_pnl.min(max_profit as i128);
    assert_eq!(capped, 500_000_000);
}

#[test]
fn test_profit_cap_not_applied_when_under() {
    let collateral: u64 = 100_000_000;
    let profit_cap_bps: u64 = 50_000;
    let max_profit = collateral * profit_cap_bps / 10_000;

    let raw_pnl: i128 = 200_000_000; // 200 USDC < cap
    let capped = raw_pnl.min(max_profit as i128);
    assert_eq!(capped, 200_000_000);
}

// ── Funding Rate Tests ─────────────────────────────────────────────────────────

#[test]
fn test_funding_rate_balanced_markets() {
    // Equal longs and shorts → skew_rate = 0 → funding = base rate
    let total_long: u64 = 1_000_000_000;
    let total_short: u64 = 1_000_000_000;
    let base_rate: u64 = 30; // 0.03% per hour
    let skew_factor: u64 = 1_000;

    let total = total_long + total_short;
    let diff = if total_long > total_short { total_long - total_short } else { total_short - total_long };
    let skew_rate = diff * skew_factor / total;
    assert_eq!(skew_rate, 0);

    let hourly_rate = base_rate + skew_rate; // majority side
    assert_eq!(hourly_rate, 30);
}

#[test]
fn test_funding_rate_skewed_market() {
    // longs = 1000, shorts = 0 → fully skewed
    let total_long: u64 = 1_000_000_000;
    let total_short: u64 = 0u64;
    let base_rate: u64 = 30;
    let skew_factor: u64 = 1_000;

    let total = total_long + total_short;
    if total > 0 {
        let diff = total_long - total_short;
        let skew_rate = diff * skew_factor / total;
        // skew_rate = 1000 * 1000 / 1000 = 1000
        assert_eq!(skew_rate, 1_000);

        // Long side (majority): hourly_rate = 30 + 1000 = 1030
        let long_rate = base_rate + skew_rate;
        assert_eq!(long_rate, 1_030);

        // Short side (minority): hourly_rate = max(0, 30 - 1000) = 0
        let short_rate = base_rate.saturating_sub(skew_rate);
        assert_eq!(short_rate, 0);
    }
}

#[test]
fn test_funding_owed_calculation() {
    // notional = 1000, rate = 30 (0.03%), hours = 24
    let notional: u64 = 1_000_000_000; // 1000 USDC (6 decimals)
    let hourly_rate: u64 = 30;
    let hours: u64 = 24;
    let funding = notional * hourly_rate * hours / FUNDING_RATE_SCALE;
    // 1_000_000_000 * 30 * 24 / 100_000 = 7_200_000 = 7.2 USDC
    assert_eq!(funding, 7_200_000);
}

// ── Fee Calculation Tests ──────────────────────────────────────────────────────

#[test]
fn test_fee_calculation() {
    let collateral: u64 = 100_000_000; // 100 USDC
    let fee_bps: u64 = 200; // 2%
    let fee = collateral * fee_bps / 10_000;
    assert_eq!(fee, 2_000_000); // 2 USDC
}

#[test]
fn test_insurance_fee_split() {
    let fee: u64 = 2_000_000; // 2 USDC fee
    let insurance_fund_bps: u64 = 1_000; // 10%
    let insurance = fee * insurance_fund_bps / 10_000;
    assert_eq!(insurance, 200_000); // 0.2 USDC to insurance
    // 1.8 USDC stays in fee_vault
}

// ── Liquidation Distribution Tests ────────────────────────────────────────────

#[test]
fn test_liquidation_distribution() {
    let collateral: u64 = 100_000_000; // 100 USDC

    let liquidator_reward = collateral * LIQUIDATOR_REWARD_BPS / 10_000;
    let lp_portion = collateral * LIQUIDATION_LP_BPS / 10_000;
    let insurance_portion = collateral * LIQUIDATION_INSURANCE_BPS / 10_000;
    let platform_remainder = collateral - liquidator_reward - lp_portion - insurance_portion;

    assert_eq!(liquidator_reward, 2_000_000); // 2 USDC (2%)
    assert_eq!(lp_portion, 44_000_000); // 44 USDC (44%)
    assert_eq!(insurance_portion, 44_000_000); // 44 USDC (44%)
    assert_eq!(platform_remainder, 10_000_000); // 10 USDC (10%) stays in vault
}

// ── Settlement Edge Case Tests ─────────────────────────────────────────────────

#[test]
fn test_settlement_total_loss() {
    // Loss exceeds collateral → settlement = 0
    let collateral: u64 = 100_000_000;
    let pnl: i128 = -150_000_000;
    let funding: u64 = 0;
    let fee: u64 = 2_000_000;

    let settlement_i128 = collateral as i128 + pnl - funding as i128 - fee as i128;
    let settlement = if settlement_i128 <= 0 { 0u64 } else { settlement_i128 as u64 };
    assert_eq!(settlement, 0);
}

#[test]
fn test_settlement_with_profit() {
    let collateral: u64 = 100_000_000;
    let pnl: i128 = 50_000_000; // 50 USDC profit
    let funding: u64 = 1_000_000;
    let fee: u64 = 2_000_000;

    let settlement_i128 = collateral as i128 + pnl - funding as i128 - fee as i128;
    let settlement = if settlement_i128 <= 0 { 0u64 } else { settlement_i128 as u64 };
    assert_eq!(settlement, 147_000_000); // 100 + 50 - 1 - 2 = 147 USDC
}

// ── LiteSVM Integration Test ───────────────────────────────────────────────────

fn make_svm() -> (LiteSVM, Keypair) {
    let admin = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!("../../../target/deploy/pokeliquid.so");
    svm.add_program(program_id(), bytes).unwrap();
    svm.airdrop(&admin.pubkey(), 10_000_000_000).unwrap();
    (svm, admin)
}

fn send_ix(svm: &mut LiteSVM, ix: Instruction, signers: &[&Keypair]) -> bool {
    let blockhash = svm.latest_blockhash();
    let payer = signers[0].pubkey();
    let msg = Message::new_with_blockhash(&[ix], Some(&payer), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), signers).unwrap();
    svm.send_transaction(tx).is_ok()
}

#[test]
fn test_initialize_ix() {
    let (mut svm, admin) = make_svm();

    let (protocol_state, _) = protocol_pda();
    let (oracle, _) = oracle_pda();
    let (usdc_mint, _) = usdc_mint_pda();
    let (fee_vault, _) = fee_vault_pda();
    let (insurance_fund, _) = insurance_fund_pda();

    let ix = Instruction::new_with_bytes(
        program_id(),
        &pokeliquid::instruction::Initialize {}.data(),
        pokeliquid::accounts::Initialize {
            admin: admin.pubkey(),
            protocol_state,
            oracle,
            usdc_mint,
            fee_vault,
            insurance_fund,
            system_program: anchor_lang::system_program::ID,
            token_program: anchor_spl::token::ID,
            rent: rent_id(),
        }
        .to_account_metas(None),
    );

    assert!(send_ix(&mut svm, ix, &[&admin]), "initialize should succeed");
}

#[test]
fn test_initialize_idempotent_fails() {
    let (mut svm, admin) = make_svm();

    let (protocol_state, _) = protocol_pda();
    let (oracle, _) = oracle_pda();
    let (usdc_mint, _) = usdc_mint_pda();
    let (fee_vault, _) = fee_vault_pda();
    let (insurance_fund, _) = insurance_fund_pda();

    let accounts = pokeliquid::accounts::Initialize {
        admin: admin.pubkey(),
        protocol_state,
        oracle,
        usdc_mint,
        fee_vault,
        insurance_fund,
        system_program: anchor_lang::system_program::ID,
        token_program: anchor_spl::token::ID,
        rent: rent_id(),
    }
    .to_account_metas(None);

    let ix = Instruction::new_with_bytes(
        program_id(),
        &pokeliquid::instruction::Initialize {}.data(),
        accounts.clone(),
    );
    assert!(send_ix(&mut svm, ix, &[&admin]));

    // Second call should fail (PDA already exists)
    let ix2 = Instruction::new_with_bytes(
        program_id(),
        &pokeliquid::instruction::Initialize {}.data(),
        accounts,
    );
    assert!(!send_ix(&mut svm, ix2, &[&admin]), "double initialize must fail");
}

#[test]
fn print_margin_account_size() {
    println!("Position::SPACE = {}", Position::SPACE);
    println!("MarginAccount::SPACE = {}", MarginAccount::SPACE);
    println!("Position mem::size_of = {}", std::mem::size_of::<Position>());
    println!("Option<Position> mem::size_of = {}", std::mem::size_of::<Option<Position>>());
    println!("MarginAccount mem::size_of = {}", std::mem::size_of::<MarginAccount>());
    assert!(MarginAccount::SPACE > 0);
}
