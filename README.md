# Pokeliquid — PRISMATIC-ETB-PERP

A perpetual futures DEX on Solana for trading the **Prismatic Evolutions Elite Trainer Box** — a real-world Pokemon TCG product priced via live TCGPlayer market data.

```
TCGPlayer ──scrape──> Keeper (Node.js) ──update_oracle──> Solana Program (Anchor)
                         │                                       │
                         ├── Liquidation loop (10s)               │
                         ├── SL/TP execution (10s)                │
                         ├── Funding settlement (1hr)             │
                         ├── SQLite price history                 │
                         └── HTTP API (:3001)                     │
                                                                  │
                      Next.js Frontend <──RPC──────────────────────┘
                           │
                           ├── Session wallet (auto-create)
                           ├── Email wallet recovery
                           └── Vercel proxy → Keeper API
```

---

## Live Deployment

| Service | URL / Address |
|---------|---------------|
| **Frontend** | `https://app-two-green-66.vercel.app` (Vercel) |
| **Keeper API** | `http://157.180.67.25:3001` (Hetzner CX23, Helsinki) |
| **Program** | `7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ` (devnet) |
| **Keeper proxy** | Frontend routes `/api/keeper/*` → Hetzner keeper (avoids mixed content) |

---

## Deployed Addresses (Devnet)

| Account | Address |
|---------|---------|
| **Program ID** | `7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ` |
| **ProtocolState** | `8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK` |
| **OracleAccount** | `2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12` |
| **FeeVault** | `GRFF44bR65tVUChnidAqZAgpFbg1Kw8GboWzUBQbW581` |
| **InsuranceFund** | `9NmpMraE2XCSUa1gKgwi9zxN8LLdT4o5Uiis5dKkKs1F` |
| **LiquidityPool** | `DiM6xwNdBnNGf2TrgHHgZJYSFLpEXawADvAWdQvUKFT` |
| **LP Vault** | `6UNaHeeQooouQ1eMemsZGgbBzgrQwqqyExaLjTTyc7My` |
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
- **Stop-loss / Take-profit:** Per-position SL/TP prices, executed permissionlessly by keeper
- **Price scale:** 1,000,000 (divide raw u64 by 1e6 for USD)

---

## Instructions

| Instruction | Auth | Description |
|-------------|------|-------------|
| `initialize` | Admin | One-time setup. Creates all protocol PDAs. |
| `deposit_collateral(amount)` | User | Transfer USDC to fee vault, credit margin account. Creates account if needed. |
| `withdraw_collateral(amount)` | User | Withdraw free collateral. |
| `close_margin_account` | User | Close margin account PDA, return rent SOL. |
| `open_position(direction, collateral, leverage, sl, tp)` | User | Open long/short with optional SL/TP prices. |
| `close_position(position_index)` | User | Close position by slot index, settle PnL + funding + close fee. |
| `set_sl_tp(position_index, sl, tp)` | User | Update SL/TP prices on an open position. |
| `execute_sl_tp(user, position_index)` | Anyone | Execute SL/TP if price has crossed trigger. Permissionless (keeper calls). |
| `add_margin(position_index, amount)` | User | Add collateral to an open position. |
| `remove_margin(position_index, amount)` | User | Remove collateral from an open position (margin ratio check). |
| `liquidate(user, position_index)` | Anyone | Liquidate specific position below 5% margin ratio. |
| `settle_funding` | Anyone | Settle accrued funding on all positions in a margin account. |
| `update_oracle(price)` | Admin/Secondary | Push new price to oracle account. Auto-unpauses if protocol was paused. |
| `check_and_pause` | Anyone | Pause protocol if oracle stale > auto_pause_threshold. |
| `update_params(params)` | Admin | Update any protocol parameter. |
| `withdraw_fees(amount)` | Admin | Withdraw from fee vault. |
| `withdraw_insurance(amount)` | Admin | Withdraw from insurance fund. |
| `mint_devnet_usdc` | Anyone | Mint 1,000 devnet USDC to caller. |
| `init_liquidity_pool` | Admin | Initialize LP pool + vault. |
| `lp_deposit(amount)` | User | Deposit USDC into LP pool. |
| `lp_withdraw(amount)` | User | Withdraw USDC from LP pool. |

---

## Project Structure

```
programs/pokeliquid/src/
  lib.rs                    # Entry point, instruction declarations
  state.rs                  # ProtocolState, OracleAccount, MarginAccount, Position, LiquidityPool, LpPosition
  error.rs                  # ErrorCode enum
  events.rs                 # All program events
  constants.rs              # Seeds, defaults, rates
  instructions/             # 20 instruction handlers (one file each)

keeper/
  keeper.js                 # Oracle + liquidation + SL/TP + funding keeper
  prices.db                 # SQLite price history (auto-created)
  prices.json               # EWMA state persistence
  pm2.config.js             # pm2 process config
  secondary.json            # Secondary oracle pusher keypair

app/                        # Next.js 14 frontend
  vercel.json               # Rewrites: /api/keeper/* → Hetzner keeper
  src/
    app/
      page.tsx              # Trade page
      recover/page.tsx      # Email wallet recovery page
      stats/page.tsx        # Protocol statistics + charts
      pool/page.tsx         # Liquidity pool page
      api/
        create-session-wallet/  # POST — Generate + fund session wallet
        save-wallet/            # POST — Encrypt key + send recovery email
        recover-wallet/         # GET  — Decrypt key from one-time token
    components/
      TradingPanel.tsx      # Order entry (long/short, collateral, leverage, SL/TP)
      PositionPanel.tsx     # Open positions with margin mgmt, SL/TP, close confirm
      CollateralPanel.tsx   # Deposit/withdraw collateral
      SaveWalletSheet.tsx   # Email save prompt (bottom sheet after first trade)
      TradeHistory.tsx      # Trade history from keeper API
      NotificationBell.tsx  # Header notification dropdown
      ToastContainer.tsx    # Ephemeral toast notifications
      Header.tsx            # Nav + oracle indicator + wallet button
      OracleChart.tsx       # Price chart (canvas)
      LongShortBar.tsx      # OI visualization
    hooks/
      useOracle.ts          # On-chain oracle + price history from keeper API
      useProtocolState.ts   # Protocol state polling
      useMarginAccount.ts   # Margin account + positions
      useLiquidityPool.ts   # LP pool data
    lib/
      session-wallet.ts     # SessionWalletAdapter (custom wallet adapter)
      crypto.ts             # AES-256-GCM encrypt/decrypt
      db.ts                 # Vercel Postgres (wallets, recovery tokens)
      addresses.ts          # PDA derivation
      program.ts            # Anchor program setup
      utils.ts              # Price formatting, PnL calc
      pokeliquid.idl.json   # Anchor IDL
    providers/
      AppProviders.tsx      # Wallet + session + notification providers
      SessionWalletProvider.tsx  # Auto-connect session wallet
      NotificationProvider.tsx   # Notifications + toasts + liquidation alerts

scripts/
  init.ts                   # Initialize protocol on devnet
  init-pool.ts              # Initialize LP pool
  set-secondary-authority.ts
  close-margin.ts
  e2e-test.js               # 13-step end-to-end test
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
npx playwright install chromium
ADMIN_KEYPAIR_PATH=/path/to/admin.json node keeper.js    # foreground
# or
ADMIN_KEYPAIR_PATH=/path/to/admin.json pm2 start pm2.config.js  # background
pm2 logs pokeliquid-keeper
```

### Run Frontend
```bash
cd app
npm install
npm run dev                 # http://localhost:3000
```

### Run Tests
```bash
cargo test --package pokeliquid       # 23 Rust tests
node scripts/e2e-test.js              # 13-step e2e test
```

---

## Infrastructure

### Keeper Server (Hetzner CX23)
- **IP:** 157.180.67.25
- **OS:** Ubuntu 22.04
- **Node:** v20.x
- **Process manager:** pm2 (auto-start on reboot via systemd)
- **SSH:** `ssh root@157.180.67.25` (ed25519 key auth)
- **Keeper path:** `/root/keeper/`
- **Admin keypair:** `/root/keeper/admin.json`
- **Env var:** `ADMIN_KEYPAIR_PATH=/root/keeper/admin.json`
- **Logs:** `pm2 logs pokeliquid-keeper`

### Vercel Frontend
- **URL:** `https://app-two-green-66.vercel.app`
- **Deploy from:** `app/` subdirectory
- **Rewrites:** `/api/keeper/*` → `http://157.180.67.25:3001/*` (via vercel.json)
- **Deploy:** `cd app && npx vercel --prod`

### Env Vars (Vercel)
```
# Required for session wallet / email recovery:
EMAIL_ENCRYPTION_SECRET=<random-32-char-string>
RESEND_API_KEY=re_xxxxx
POSTGRES_URL=postgres://...           # Vercel Postgres
RELAYER_PRIVATE_KEY=[1,2,3,...]       # Optional: auto-fund session wallets

# Optional:
NEXT_PUBLIC_RPC_ENDPOINT=https://api.devnet.solana.com
NEXT_PUBLIC_APP_URL=https://app-two-green-66.vercel.app
```

---

## Session Wallet System

Users can trade without installing a browser wallet extension:

1. **Auto-create:** On page load, if no wallet detected, a `SessionWalletAdapter` generates a keypair in localStorage and requests a devnet SOL airdrop
2. **Trade:** User mints test USDC, deposits, and trades — all signed with the session keypair
3. **Save:** After first trade, a bottom sheet prompts for email to encrypt and store the key
4. **Recover:** Email contains a one-time recovery link → `/recover?token=XXX` → restores keypair to localStorage on any device
5. **External wallet:** If user connects Phantom/Solflare, it takes priority over the session wallet

### Security
- Private keys encrypted with AES-256-GCM (PBKDF2 key derivation from `EMAIL_ENCRYPTION_SECRET`)
- Recovery tokens are one-time use, expire in 24 hours
- Session wallet creation rate limited to 1 per IP per hour

---

## Keeper

The keeper runs four loops and an HTTP API:

| Loop | Interval | Description |
|------|----------|-------------|
| Oracle update | 5 min | Scrape TCGPlayer, apply adaptive EWMA, push price on-chain |
| Liquidation | 10 sec | Scan all margin accounts, liquidate underwater positions |
| SL/TP execution | 10 sec | Execute stop-loss/take-profit when price crosses triggers |
| Funding settlement | 1 hour | Call `settle_funding` for accounts with positions open 1+ hours |

### Adaptive EWMA Oracle
- Source: TCGPlayer market price (product 593355) via Playwright headless browser
- Smoothing by deviation from current EWMA:
  - < 3%: direct pass-through (no smoothing)
  - 3-5%: alpha = 0.3 (moderate)
  - 5-15%: alpha = 0.1 (heavy)
  - \> 15%: alpha = 0.01 (spike rejection)
- Floor price: $100 (rejects prices below)
- State persisted to `prices.json` across restarts

### Oracle Resilience
- `update_oracle` accepts admin OR secondary_authority keypair
- Keeper falls back to secondary keypair after 3 primary failures
- `check_and_pause`: permissionless, pauses protocol if oracle stale > 1 hour
- `update_oracle` auto-unpauses protocol when new price pushed
- Keeper sends Telegram alerts on: oracle stale >15min, liq fails 3x, RPC spikes

### API Endpoints (port 3001)

```
GET /prices?limit=50            # Last N price records
GET /prices?from=1234&to=5678   # Records in unix timestamp range
GET /health                     # Keeper status, uptime, counters
GET /stats                      # 24h/7d volume, trades, liquidations
GET /trades?user=PUBKEY&limit=20 # Trade history for a user
GET /events/recent              # Recent decoded program events
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

## Current Strengths

- **Unique market** — perpetual futures on a physical TCG product
- **Full vertical stack** — on-chain program + keeper + scraper + frontend, all integrated
- **No wallet required** — session wallet auto-creates, email recovery for cross-device
- **Professional trading UX** — inline SL/TP, margin ratio bar, PnL flash, close confirmation
- **Correct math** — PnL, liquidation, funding rates all verified (23 Rust tests)
- **Adaptive EWMA oracle** — 4-tier spike protection handles manipulation attempts
- **Oracle resilience** — secondary authority fallback, auto-pause on stale, Telegram alerts
- **Multi-position** — 5 simultaneous positions per account with add/remove margin
- **On-chain funding settlement** — hourly settlement keeps liquidation checks accurate
- **Insurance fund** — automatic 10% fee routing for protocol solvency
- **LP pool** — users can provide liquidity and earn fees
- **Persistent infrastructure** — Hetzner keeper (pm2 + systemd), Vercel frontend, auto-deploy

## Known Limitations & Roadmap

### Important
- [ ] **No partial close** — can't close a percentage of a position
- [ ] **Single admin oracle** — one keypair pushes price, no decentralized oracle fallback
- [ ] **No limit orders** — market orders only
- [ ] Set up Vercel Postgres + Resend for email recovery (env vars needed)

### Nice to have
- [ ] Multi-asset support (additional perp markets)
- [ ] Mainnet deployment with real USDC
- [ ] Custom domain (pokeliquid.xyz)
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
- bn.js `.toNumber()` throws on values > 53 bits — use `safeBn()` wrapper
- Direction enum in TS: `{ long: {} }` / `{ short: {} }`
- MarginAccount::SPACE = 386 bytes (verified via Rust test)
- Vercel rewrites `/api/keeper/*` → Hetzner to avoid HTTPS→HTTP mixed content
- Session wallet stored in localStorage, encrypted with AES-256-GCM for email recovery
