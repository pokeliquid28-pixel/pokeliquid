# Pokeliquid — PRISMATIC-ETB-PERP

A perpetual futures DEX on Solana for trading the **Prismatic Evolutions Elite Trainer Box** — a real-world Pokemon TCG product priced via live TCGPlayer market data.

```
TCGPlayer ──scrape──> Keeper (Node.js) ──update_oracle──> Solana Program (Anchor)
                         │                                       │
                         ├── Liquidation loop (10s)               │
                         ├── Funding settlement (1hr)             │
                         ├── SQLite price history                 │
                         └── HTTP API (:3001)                     │
                                                                  │
                      Next.js Frontend <──RPC──────────────────────┘
```

---

## Deployed Addresses (Devnet)

| Account | Address |
|---------|---------|
| **Program ID** | `7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ` |
| **ProtocolState** | `8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK` |
| **OracleAccount** | `2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12` |
| **FeeVault** | `GRFF44bR65tVUChnidAqZAgpFbg1Kw8GboWzUBQbW581` |
| **InsuranceFund** | `9NmpMraE2XCSUa1gKgwi9zxN8LLdT4o5Uiis5dKkKs1F` |
| **USDC Mint** | `Gj9gBxmesYoNa4kvZUKJbiF85PduMKnHnppp4ikbWUUi` |

---

## Market Spec

- **Market:** PRISMATIC-ETB-PERP (Prismatic Evolutions Elite Trainer Box)
- **Collateral:** devnet USDC (program-controlled mint, 6 decimals)
- **Positions:** Up to 5 simultaneous per account (`[Option<Position>; 5]`)
- **Leverage:** 1x – 10x
- **Open fee:** 2% of collateral (90% fee vault / 10% insurance)
- **Close fee:** 2% of collateral (same split)
- **Profit cap:** 500% of collateral
- **Funding rate:** 0.03%/hr base, skew-adjusted by OI imbalance, **settled on-chain hourly**
- **Liquidation threshold:** 5% margin ratio (equity/notional < 0.05)
- **Liquidation split:** 1% liquidator / 9% insurance / 90% stays in vault
- **Price scale:** 1,000,000 (divide raw u64 by 1e6 for USD)

---

## Instructions

| Instruction | Auth | Description |
|-------------|------|-------------|
| `initialize` | Admin | One-time setup. Creates all protocol PDAs. |
| `deposit_collateral(amount)` | User | Transfer USDC to fee vault, credit margin account. Creates account if needed. |
| `withdraw_collateral(amount)` | User | Withdraw free collateral (no open positions). |
| `close_margin_account` | User | Close margin account PDA, return rent SOL. Works with any account size (migration). |
| `open_position(direction, collateral, leverage)` | User | Open long/short in first empty slot. Deducts open fee. |
| `close_position(position_index)` | User | Close position by slot index, settle PnL + funding + close fee. |
| `liquidate(user, position_index)` | Anyone | Liquidate specific position below 5% margin ratio. |
| `settle_funding` | Anyone | Settle accrued funding on all positions in a margin account. Deducts from position collateral. Auto-liquidates if funding drains all collateral. |
| `update_oracle(price)` | Admin | Push new price to oracle account. |
| `update_params(params)` | Admin | Update any protocol parameter. |
| `withdraw_fees(amount)` | Admin | Withdraw from fee vault. |
| `withdraw_insurance(amount)` | Admin | Withdraw from insurance fund. |
| `mint_devnet_usdc` | Anyone | Mint 1,000 devnet USDC to caller. |

---

## Project Structure

```
programs/pokeliquid/src/
  lib.rs                    # Entry point, instruction declarations
  state.rs                  # ProtocolState, OracleAccount, MarginAccount, Position
  error.rs                  # ErrorCode enum
  events.rs                 # PositionOpened/Closed/Liquidated, FundingSettled, OracleUpdated
  constants.rs              # Seeds, defaults, rates
  instructions/
    initialize.rs           deposit_collateral.rs    withdraw_collateral.rs
    close_margin_account.rs open_position.rs         close_position.rs
    liquidate.rs            settle_funding.rs        update_oracle.rs
    update_params.rs        withdraw_fees.rs         withdraw_insurance.rs
    mint_devnet_usdc.rs

keeper/
  keeper.js                 # Oracle + liquidation + funding keeper
  prices.db                 # SQLite price history (auto-created)
  prices.json               # EWMA state persistence
  package.json              # Dependencies: @solana/web3.js, playwright, better-sqlite3
  pm2.config.js

app/                        # Next.js 14 frontend
  src/
    app/page.tsx             # Trade page
    components/
      TradingPanel.tsx       # Order entry (long/short, collateral, leverage)
      PositionPanel.tsx      # Open positions with close buttons
      LongShortBar.tsx       # OI visualization
      OracleChart.tsx        # Price chart (data from keeper API)
    hooks/
      useOracle.ts           # On-chain oracle + price history from API
      useProtocolState.ts    # Protocol state polling + websocket
      useMarginAccount.ts    # Margin account + positions
    lib/
      addresses.ts           # PDA derivation
      program.ts             # Anchor program setup
      utils.ts               # Price formatting, PnL calc
      pokeliquid.idl.json    # Anchor IDL (copy from target/idl/)

scripts/
  init.ts                   # Initialize protocol on devnet
  close-margin.ts           # Close old margin account for migration
```

---

## Setup & Run

### Prerequisites
- Rust 1.89+, Solana CLI 3.1.10, Anchor CLI 1.0.2
- Node.js 18+
- Playwright: `npx playwright install chromium`

### Build & Deploy
```bash
anchor build
solana program deploy target/deploy/pokeliquid.so \
  --program-id 7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ \
  --url devnet

# Copy IDL to frontend after build
cp target/idl/pokeliquid.json app/src/lib/pokeliquid.idl.json
```

### Run Keeper
```bash
cd keeper
npm install
node keeper.js              # foreground
# or
pm2 start pm2.config.js    # background with auto-restart
pm2 logs keeper             # view logs
pm2 restart keeper          # restart after code changes
```

### Run Frontend
```bash
cd app
npm install
npm run dev                 # http://localhost:3000
```

### Run Tests
```bash
cargo test --package pokeliquid       # 22 Rust tests
anchor test --provider.cluster devnet  # TS integration tests
```

---

## Keeper

The keeper runs three loops and an HTTP API:

| Loop | Interval | Description |
|------|----------|-------------|
| Oracle update | 5 min | Scrape TCGPlayer, apply adaptive EWMA, push price on-chain |
| Liquidation | 10 sec | Scan all margin accounts, liquidate underwater positions |
| Funding settlement | 1 hour | Call `settle_funding` for accounts with positions open 1+ hours |
| Health summary | 1 hour | Log EWMA stats, spike count, raw price range |

### Adaptive EWMA Oracle
- Source: TCGPlayer market price (product 593355) via Playwright headless browser
- Smoothing by deviation from current EWMA:
  - < 3%: direct pass-through (no smoothing)
  - 3-5%: alpha = 0.3 (moderate)
  - 5-15%: alpha = 0.1 (heavy)
  - \> 15%: alpha = 0.01 (spike rejection)
- Floor price: $100 (rejects prices below)
- State persisted to `prices.json` across restarts

### Price History API (port 3001)

```
GET /prices?limit=50            # Last N records (default 50, max 500)
GET /prices?from=1234&to=5678   # Records in unix timestamp range
```

Response:
```json
[{
  "id": 1,
  "timestamp": 1780245393,
  "raw_price": 173.86,
  "ewma": 173.86,
  "deviation": 0.05,
  "alpha": 1,
  "tx_signature": "abc123..."
}]
```

---

## Math

All arithmetic uses `u64` and `i128` for intermediate calculations. No floats. Division is always last. All operations use `checked_*` and return `MathOverflow` on failure.

**Funding rate (settled hourly on-chain):**
```
skew_rate = |long_exposure - short_exposure| * skew_factor / total_exposure
majority side:  hourly_rate = base_rate + skew_rate
minority side:  hourly_rate = max(0, base_rate - skew_rate)
funding_owed = notional * hourly_rate * hours / 100_000
→ deducted from position.collateral by settle_funding instruction
```

**PnL:**
```
Long:  (current_price - entry_price) * notional / entry_price
Short: (entry_price - current_price) * notional / entry_price
capped_pnl = min(pnl, collateral * profit_cap_bps / 10_000)
```

**Settlement (on close):**
```
settlement = collateral + capped_pnl - funding_owed - close_fee
(draws from insurance fund if fee_vault insufficient)
```

**Liquidation:**
```
liquidatable if (collateral + unrealized_pnl) * 20 < notional
rewards: 1% liquidator, 9% insurance, 90% stays in vault
```

---

## Account PDAs

All derived from program ID `7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ`:

```
ProtocolState:  seeds = ["protocol"]
OracleAccount:  seeds = ["oracle"]
MarginAccount:  seeds = ["margin", user_pubkey]
FeeVault:       seeds = ["fee_vault"]
InsuranceFund:  seeds = ["insurance_fund"]
USDC Mint:      seeds = ["usdc_mint"]
```

**MarginAccount layout (296 bytes):**
```
8 discriminator + 32 owner + 8 collateral + 5 * (1 option_tag + 42 position) + 1 bump + 32 padding
```

---

## Current Strengths

- **Unique market** — perpetual futures on a physical TCG product, nobody else does this
- **Full vertical stack** — on-chain program + keeper + scraper + frontend, all integrated
- **Correct math** — PnL calculation, liquidation logic, funding rates all verified
- **Adaptive EWMA oracle** — 4-tier spike protection handles manipulation attempts
- **Multi-position** — 5 simultaneous positions per account
- **On-chain funding settlement** — hourly settlement deducts from position collateral, keeping liquidation checks accurate
- **Insurance fund** — automatic 10% fee routing for protocol solvency
- **Persistent price history** — SQLite DB + HTTP API, chart survives page refreshes
- **Automated keeper** — oracle, liquidation, and funding all run unattended via pm2

## Known Limitations & Roadmap

### Critical (needed before real usage)
- [ ] **No limit orders / stop-loss / take-profit** — market orders only, no automated exit conditions
- [ ] **No add/remove margin on open positions** — can't adjust collateral after opening
- [ ] **Withdraw blocks on any open position** — can't withdraw free collateral while positions exist
- [ ] **Counterparty / vault solvency risk** — all collateral in one vault, no LP mechanism
- [ ] **Single admin oracle** — one keypair pushes price, no decentralized oracle fallback
- [ ] **No partial close** — can't close a percentage of a position

### Important
- [ ] Trade history / PnL tracking (index on-chain events into DB)
- [ ] Deposit/withdraw UI with explicit buttons
- [ ] Pool & Stats pages (routes exist but are shells)
- [ ] Mobile responsiveness

### Nice to have
- [ ] Multi-asset support (additional perp markets)
- [ ] Mainnet deployment with real USDC
- [ ] Referral / fee sharing system
- [ ] Governance token
- [ ] API documentation page

---

## Tech Notes

- `@types/react` pinned to 18.2.79 (wallet adapter compat — do NOT bump to 18.3.x)
- `@anchor-lang/core` for Anchor 1.x TS client (not `@coral-xyz/anchor`)
- Anchor 1.0.x: `CpiContext::new_with_signer` first arg is `.key()` not `AccountInfo`
- Large Accounts structs need `Box<Account<'info, T>>` to avoid 4096-byte stack limit
- `anchor-lang` needs `init-if-needed` feature for `init_if_needed` constraint
- bn.js `.toNumber()` throws on values > 53 bits (u64::MAX) — use `safeBn()` wrapper in frontend
- Direction enum in TS: `{ long: {} }` / `{ short: {} }`
