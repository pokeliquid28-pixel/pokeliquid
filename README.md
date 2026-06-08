# Pokeliquid — Pokemon Card Perps

A perpetual futures DEX on Solana for trading **Pokemon TCG products** — real-world cards and sealed product priced via live TCGPlayer market data. 21 markets live on mainnet.

```
TCGPlayer ──scrape──> Keeper (Node.js) ──update_oracle──> Solana Program (Anchor)
                         │                                       │
                         ├── Liquidation loop (10s)               │
                         ├── SL/TP execution (10s)                │
                         ├── Funding settlement (1hr)             │
                         ├── Trade parsing (30s)                  │
                         ├── SQLite price history                 │
                         ├── Telegram alerts                      │
                         └── HTTP API (:3001)                     │
                                                                  │
                      Next.js Frontend <──RPC──────────────────────┘
                           │
                           ├── Session wallet (localStorage keypair)
                           ├── Email + password auth (Supabase Postgres)
                           ├── PnL export cards (per-trade + overall)
                           ├── Prize pool + leaderboard
                           └── Vercel proxy → Keeper API
```

---

## Live Deployment

| Service | URL / Address |
|---------|---------------|
| **Frontend** | `https://pokeliquid.xyz` (Vercel) |
| **Keeper API** | `http://157.180.67.25:3001` (Hetzner CX23, Helsinki) |
| **Program** | `5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6` (mainnet) |
| **Keeper proxy** | Frontend routes `/api/keeper/*` → Hetzner keeper (avoids mixed content) |
| **Verified source** | `github.com/pokeliquid28-create/pokeliquid` (for on-chain program verification) |

---

## Deployed Addresses (Mainnet)

| Account | Address |
|---------|---------|
| **Program ID** | `5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6` |
| **ProtocolState** | `6yAYSsp863889v7bhMEwj6tVq5DvFTi1gwzwHFrqwLFL` |
| **FeeVault** | `BFm4z6Z2H84GrpcKkydmE1qZVidwuj2sP3N3wTNZemJt` |
| **InsuranceFund** | `266CZZpRb1PFDGQf4bNE5ASPVxAUkon6tv6BvRYpP7x9` |
| **LiquidityPool** | (derived from LP_POOL_SEED) |
| **LP Vault** | (derived from LP_VAULT_SEED) |
| **USDC Mint** | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (real USDC) |
| **Admin** | Squads v4 multisig vault (`2iVcXi6XXkm1X6w4qLbVvzC1fZ3yS57HxEyn5ghWopak` original, transferred to multisig) |
| **Secondary Auth** | `2XsE4rWJa7LRjFWfMFUmWFxBeqNaKmuXdfJk5iWy1ssH` |

---

## Markets (21 live)

| Market ID | Card / Product | Oracle PDA |
|-----------|---------------|------------|
| PRISMATIC-ETB | Prismatic Evolutions ETB | `FbPBfXaCY1Chm23pyVv7gcesRVK7FxFXHgd5xNb84r4Q` |
| CHARIZARD-125/094-PFL | Mega Charizard X ex (Phantasmal Flames) | `8KU9oyrCAhX58Mz73z8MjKH8P88CyqPcx8zCm61HWzeP` |
| CHARMANDER-038-MEP | Charmander (Mega Evolution Promo) | `EN3Y7vWu2a2PXma2V5vfm6swFed8YTFHCG75EQxoHETY` |
| PIKACHU-276/217-AH | Pikachu ex (Ascended Heroes) | `Fx1rYyuEz91rqgpEWHs8MyH7kiLpNeXuDdcAJiSjhN87` |
| GRENINJA-116/086-CR | Mega Greninja ex (Chaos Rising) | `CVZ3Uy33JMmofNP8F6sc8MXDRcPqx5tCseYkMjFqo9Bs` |
| ASCENDED-HEROES-ETB | Ascended Heroes ETB | `AELYcbqH4bznFEHXV14B65VVDyjJ3wxGYSs4r6ZDwXZR` |
| PSYDUCK-226/217-AH | Psyduck (Ascended Heroes) | `4MgTDnKZoLfvy6uLEDAhCb4xZQhMKL7Tui9iJRYFPKff` |
| MEOWTH-106/094-PFL | Meowth (Phantasmal Flames) | `FLidEWgSD9wTi11Yhvq8XeJSmxCgEYm8D49moULPS73V` |
| BLACK-BOLT-ETB | Black Bolt ETB | `AQRbdjv87zu2Yiyfva1JyR5P7oABLRBW2VV8ghM3ay7M` |
| MAGNETON-159-PROMO | Magneton SV Promo | `E6uxuj3rQTsoNpFGejsufWLrskfbmnCybBbLRfoxmdXs` |
| CHARIZARD-199/165-151 | Charizard ex (SV 151) | `CafH2Edbo1D3FSt9svayAEYfGGRN8KthJYUF3QqZ3fqB` |
| MISTYS-PSYDUCK-193/182-DR | Misty's Psyduck (Destined Rivals) | `7yd9fu8B4P9WztqKsr2aavpPYqUw4ajaZYaaRsQXr9w7` |
| UMBREON-161/131-PE | Umbreon ex (Prismatic Evolutions) | `3yzynV61LLLsWMtPR5Gnjxfng1GCB9esfwS6DMVNdkAK` |
| MEW-232/091-PF | Mew ex (Paldean Fates) | `GNhqrci8F9q8pKUd8SDtpSAs6TpTsBA2axZbz9uDWR2Q` |
| PIKACHU-238/191-SS | Pikachu ex (Surging Sparks) | `5hkDDGy2n4YCteRYCLdkjGwYSFJckPpdoip36aGLUWWd` |
| GIRATINA-GG69/GG70-CZ | Giratina VSTAR (Crown Zenith) | `CKErhqbVGZUdTCw9P2jnG2AeQDZFqvxDpw1MXyAgb2R6` |
| CHAOS-RISING-BB | Chaos Rising Booster Box | `7UMQL2z31YpqbQ4zfbosixHQPrUK9BFAEAyg8ujoQAvW` |
| KABUTO-FOSSIL-1E | Kabuto Fossil 1st Edition | `CFSh1kDfAkpGbC9E5RG5zqdG36RqtkZZvqHC7FczzzMU` |
| GENGAR-284/217-AH | Mega Gengar ex (Ascended Heroes) | `4KnytCXdBfU9tTkrZFVEXb7J75BuXnUyKuq58MCq2Ydz` |
| DRAGONITE-290/217-AH | Mega Dragonite ex (Ascended Heroes) | `GDqkhQjYvCtVavis6wEGpbkozrHu18khJgTCYTkGKxvj` |
| CLEFAIRY-094/088-PO | Clefairy (Perfect Order) | `Cjps4TodWqzqwi48LmTh3dxSX2XJ3eEebbcJsDeYw7BH` |

## Market Spec
- **Collateral:** USDC (real SPL Token, 6 decimals)
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
| `update_params(params)` | Admin | Update any protocol parameter (including admin transfer). |
| `withdraw_fees(amount)` | Admin | Withdraw from fee vault (reserves LP unclaimed fees). |
| `withdraw_insurance(amount)` | Admin | Withdraw from insurance fund. |
| `claim_fees` | User (LP) | Claim LP fee share (MasterChef-style accumulator). |
| `mint_devnet_usdc` | Anyone | Mint 1,000 devnet USDC to caller (disabled on mainnet). |
| `realloc_margin` | User | Reallocate margin account to new size (546 bytes). |
| `init_market_state` | Admin | Initialize per-market state (OI tracking). |
| `init_market_oracle(market)` | Admin | Create a new oracle account for a market. |
| `update_market_oracle(market, price)` | Admin/Secondary | Push price to a specific market oracle. |
| `init_liquidity_pool` | Admin | Initialize LP pool + vault. |
| `lp_deposit(amount)` | User | Deposit USDC into LP pool. |
| `lp_withdraw(shares)` | User | Withdraw USDC from LP pool (auto-claims pending fees). |

---

## LP Fee Distribution (MasterChef-style)

LP fees use a SushiSwap MasterChef-style accumulator for fair distribution:

- `LiquidityPool.acc_fee_per_share` (u128, scaled by 1e12) — monotonically increasing accumulator
- `LpPosition.reward_debt` (u128) — set on deposit/withdraw to prevent claiming historical fees
- Every fee accrual (open, close, liquidate, SL/TP, funding) increments `acc_fee_per_share`
- Claimable = `shares * acc_fee_per_share / 1e12 - reward_debt`
- Legacy fallback for pre-upgrade accounts (proportional share of unclaimed)
- `lp_withdraw` auto-claims pending fees before burning shares

---

## Project Structure

```
programs/pokeliquid/src/
  lib.rs                    # Entry point, security.txt, instruction declarations
  state.rs                  # ProtocolState, OracleAccount, MarginAccount, Position, LiquidityPool, LpPosition
  error.rs                  # ErrorCode enum
  events.rs                 # All program events
  constants.rs              # Seeds, defaults, rates
  instructions/             # 25 instruction handlers (one file each)

programs/pokeliquid/tests/
  test_initialize.rs        # Integration tests
  fuzz_tests.rs             # 38 fuzz/property-based tests

keeper/
  keeper.js                 # Oracle + liquidation + SL/TP + funding + trade parsing keeper
  telegram.js               # Telegram alert module
  prices.db                 # SQLite price history (auto-created)
  prices.json               # EWMA state persistence
  pm2.config.js             # pm2 process config
  secondary.json            # Secondary oracle pusher keypair

app/                        # Next.js 14 frontend
  vercel.json               # Rewrites: /api/keeper/* → Hetzner keeper
  src/
    app/
      page.tsx              # Trade page (gates behind auth — shows LandingAuth if not connected)
      trades/page.tsx       # Dedicated trade history page (expanded view)
      positions/page.tsx    # Open positions + trade history
      pool/page.tsx         # Liquidity pool page
      stats/page.tsx        # Protocol statistics + charts
      leaderboard/page.tsx  # Top traders leaderboard
      prize-pool/page.tsx   # Prize pool with bonus winners
      docs/page.tsx         # Documentation
      api-docs/             # API documentation
      privacy/page.tsx      # Privacy policy
      terms/page.tsx        # Terms of service
      reset-password/page.tsx # Password reset page
      api/
        create-session-wallet/  # POST — Generate + fund session wallet
        signup/                 # POST — Create account, set JWT session cookie
        login/                  # POST — Verify password, return key, set JWT cookie
        logout/                 # POST — Clear session cookie
        me/                     # GET  — Return session from JWT cookie (or 401)
        forgot-password/        # POST — Send reset email via Resend
        reset-password/         # POST — Change password (requires current password)
        reset-password-with-token/ # POST — Reset password via emailed token
    components/
      LandingAuth.tsx       # Login / signup / reset password landing page
      AuthGuard.tsx         # Route guard — redirects unauthenticated users
      AuthModal.tsx         # In-app auth modal (save account from header)
      TradingPanel.tsx      # Order entry (long/short, collateral, leverage, SL/TP)
      PositionPanel.tsx     # Open positions with margin mgmt, SL/TP, close confirm
      CollateralPanel.tsx   # Deposit/withdraw collateral (auto-airdrops SOL if needed)
      TradeHistory.tsx      # Trade history with market filter, auto-refresh, per-trade PnL export
      PnlExport.tsx         # PnL export cards (overall stats + per-trade) — save/copy as PNG
      SaveWalletSheet.tsx   # Bottom sheet after first trade prompts account creation
      WalletButton.tsx      # Header wallet button (login/email/address/disconnect)
      Header.tsx            # Nav + oracle indicator + wallet button
      Footer.tsx            # Site footer
      OracleChart.tsx       # Price chart (canvas, OHLC candles via /candles endpoint)
      LongShortBar.tsx      # OI visualization
      Logo.tsx              # Brand logo component
      SwapModal.tsx         # Token swap modal
      SendModal.tsx         # Send tokens modal
      ExportKeyModal.tsx    # Export private key modal
      NotificationBell.tsx  # Header notification dropdown
      ToastContainer.tsx    # Ephemeral toast notifications
      ErrorBoundary.tsx     # React error boundary
      RiskDisclaimer.tsx    # Risk disclaimer
      Skeleton.tsx          # Loading skeleton
    hooks/
      useAuth.ts            # Authentication state
      useOracle.ts          # On-chain oracle + price history from keeper API
      useProtocolState.ts   # Protocol state polling
      useMarginAccount.ts   # Margin account + positions
      useMarket.ts          # Market selection + data
      useMarketState.ts     # Per-market state (OI)
      useLiquidityPool.ts   # LP pool data
      useLpPosition.ts      # User's LP position
      useOrderBook.ts       # Order book data
      usePositionPrice.ts   # Position-specific price tracking
      useWalletBalances.ts  # SOL + USDC balances
    lib/
      markets.ts            # 21 market definitions (IDs, oracle addresses, TCGPlayer IDs, images)
      session-wallet.ts     # SessionWalletAdapter (custom wallet adapter, only wallet option)
      addresses.ts          # PDA derivation
      program.ts            # Anchor program setup
      utils.ts              # Price formatting, PnL calc
      crypto.ts             # AES-256-GCM encrypt/decrypt
      auth.ts               # Argon2id hashing, JWT session tokens (jose)
      db.ts                 # Supabase Postgres via pg (wallets, reset tokens)
      pokeliquid.idl.json   # Anchor IDL
    providers/
      AppProviders.tsx      # Session wallet adapter only (no Phantom/Solflare)
      SessionWalletProvider.tsx  # Auto-connect returning users only
      NotificationProvider.tsx   # Notifications + toasts + liquidation alerts
```

---

## Setup & Run

### Prerequisites
- Rust 1.89+, Solana CLI 3.1.10, Anchor CLI 1.0.2
- Node.js 18+
- Playwright: `npx playwright install chromium`

### Build & Deploy
```bash
anchor build --features mainnet
solana program deploy target/deploy/pokeliquid.so \
  --program-id 5C1cz4kCA8DcD2zjhBphuK86vAjdoCnichK1kdLHPMt6 \
  --url mainnet-beta

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

### Deploy Frontend
```bash
git push origin main        # auto-deploys to Vercel ("app" project → pokeliquid.xyz)
```

### Run Tests
```bash
cargo test --package pokeliquid       # 60 tests (22 unit + 38 fuzz/property)
node scripts/e2e-test.js              # 13-step e2e test
```

---

## Authentication System

Users authenticate with email + password. No external wallet extensions required.

### Flow
1. **New user** visits the site → sees **LandingAuth** landing page with login/signup/guest options
2. **Sign up** → email + password (with confirmation) → generates Solana keypair → encrypts private key with AES-256-GCM → stores in Supabase Postgres → sets JWT session cookie
3. **Log in** → verifies password (bcrypt) → decrypts private key → restores to localStorage → sets JWT session cookie
4. **Forgot password** → `/reset-password` page → enter email → receives reset link via Resend → click link → set new password (token-based, 1hr expiry, single-use)
5. **Guest mode** → generates ephemeral keypair in localStorage (no persistence across devices)
6. **Save account** → after trading as guest, header prompts to create account to save wallet
7. **Session restore** → on page load, `GET /api/me` reads JWT cookie to restore auth state
8. **Logout** → `POST /api/logout` clears session cookie + disconnects wallet

### Security
- **Passwords hashed with bcrypt** (12 rounds) — industry standard, works on all platforms
- Legacy PBKDF2 hashes auto-migrated to bcrypt on next successful login
- **JWT sessions** (HS256, 30-day expiry) stored as `HttpOnly; Secure; SameSite=Lax` cookies
- Private key sent only once (at login/signup), then lives in localStorage — JWT cookie has no private key
- Private keys encrypted with AES-256-GCM (key derived from `EMAIL_ENCRYPTION_SECRET`)
- Password reset tokens: cryptographically random (32 bytes), 1-hour expiry, single-use
- Forgot-password endpoint returns success regardless of whether email exists (prevents enumeration)
- Session wallet creation rate limited to 1 per IP per hour
- No external wallet adapters (Phantom/Solflare removed) — session wallet only

### Database (Supabase Postgres)
- Connected via `pg` package (not `@vercel/postgres`)
- SSL with `rejectUnauthorized: false` for Supabase compatibility
- Tables: `wallets`, `session_wallets`, `password_reset_tokens`

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

### Volume Farm
- **Script:** `/root/volume-farm/volume-farm.js` (runs via pm2 as `volume-farm`)
- **Wallets:** `/root/volume-farm/farm-wallets.json` (40 wallets)
- Trades 6 markets with randomized intervals, direction, 10x leverage
- Closes positions after $0.50 PnL move or 5min hold cap
- CLI: `--setup`, `--drain`, `--status`, `--withdraw-fees <amt>`

### Vercel Frontend
- **URL:** `https://pokeliquid.xyz`
- **Deploy from:** `app/` subdirectory
- **Rewrites:** `/api/keeper/*` → `http://157.180.67.25:3001/*` (via vercel.json)
- **Auto-deploy:** Push to `origin/main` triggers deploy

### GitHub Repos
- **Private:** `onchainscammer-art/poke-liquid` (full codebase, auto-deploys frontend)
- **Public:** `pokeliquid28-create/pokeliquid` (program source only, for on-chain verification)

### Env Vars (Vercel)
```
# Required for auth:
EMAIL_ENCRYPTION_SECRET=<random-32-char-string>
JWT_SECRET=<random-64-char-string>        # Signs JWT session cookies
POSTGRES_URL=postgresql://...             # Supabase Postgres connection string

# Required for forgot-password emails:
RESEND_API_KEY=re_xxxxx                   # Resend.com API key

# Required for auto-funding new wallets:
RELAYER_PRIVATE_KEY=<base58-private-key>  # Funds new session wallets with SOL

# Optional:
NEXT_PUBLIC_RPC_ENDPOINT=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_APP_URL=https://pokeliquid.xyz
```

---

## Keeper

The keeper runs five loops and an HTTP API:

| Loop | Interval | Description |
|------|----------|-------------|
| Oracle update | 5 min | Scrape TCGPlayer, apply adaptive EWMA, push price on-chain |
| Liquidation | 10 sec | Scan all margin accounts, liquidate underwater positions |
| SL/TP execution | 10 sec | Execute stop-loss/take-profit when price crosses triggers |
| Funding settlement | 1 hour | Call `settle_funding` for accounts with positions open 1+ hours |
| Trade parsing | 30 sec | Parse on-chain events, store in SQLite for trade history API |

### Adaptive EWMA Oracle
- Source: TCGPlayer market price via Playwright headless browser
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

### Monitoring & Alerts (Telegram)

Alerts sent via `@pokeliquidbot` with level-based rate limiting:

| Level | Triggers | Rate Limit |
|-------|----------|------------|
| CRITICAL | Oracle stale 15min+, RPC 3x fail, vault < $50, liq loop 3x fail, unhandled exceptions | 1 min |
| WARN | Price deviation >10%, liquidation events, funding failures, scrape failures | 5 min |
| INFO | Daily digest at midnight UTC (oracle updates, liquidations, volume, vault balance, errors) | none |

### API Endpoints (port 3001)

```
GET /ping                       # { ok: true, timestamp } — uptime monitoring
GET /health                     # Comprehensive health: oracle, liquidation, funding, solana, protocol
GET /prices?limit=50            # Last N price records
GET /prices?from=1234&to=5678   # Records in unix timestamp range
GET /candles?market=ETB&resolution=1h  # OHLC candles (1h or 1d)
GET /stats                      # 24h/7d volume, trades, liquidations
GET /trades?user=PUBKEY&limit=20 # Trade history for a user
GET /trades/recent?limit=50     # Recent trades across all users
GET /events/recent              # Recent decoded program events
```

---

## Tests

### Rust Tests (60 total)
- **22 unit tests** — core math, state transitions, instruction logic
- **38 fuzz/property-based tests** covering:
  - Math edge cases (17): PnL symmetry, liquidation boundaries, overflow, zero-value safety, profit cap, funding accumulation
  - Attack vectors (11): oracle manipulation, leverage overflow, dust positions, reentrancy-style exploits, sandwich scenarios
  - Property-based with 1000 random inputs (10): deterministic PRNG (xorshift64), tests invariants hold across random parameter combinations

```bash
cargo test --package pokeliquid    # runs all 60 tests
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

- **Unique market** — perpetual futures on physical TCG products (21 markets live)
- **Full vertical stack** — on-chain program + keeper + scraper + frontend, all integrated
- **No wallet extension required** — session wallet in localStorage, email+password auth for persistence
- **Professional trading UX** — inline SL/TP, margin ratio bar, PnL flash, close confirmation
- **PnL export cards** — shareable per-trade and overall PnL cards (save as PNG / copy to clipboard)
- **Correct math** — PnL, liquidation, funding rates all verified (60 Rust tests including 38 fuzz tests)
- **MasterChef LP fees** — fair fee distribution via accumulator pattern, auto-claim on withdraw
- **Adaptive EWMA oracle** — 4-tier spike protection handles manipulation attempts
- **Oracle resilience** — secondary authority fallback, auto-pause on stale, Telegram alerts
- **Multi-position** — 5 simultaneous positions per account with add/remove margin
- **On-chain funding settlement** — hourly settlement keeps liquidation checks accurate
- **Insurance fund** — automatic 10% fee routing for protocol solvency
- **LP pool** — users can provide liquidity and earn fees
- **Admin via Squads multisig** — admin transferred to Squads v4 for secure multi-sig operations
- **Persistent infrastructure** — Hetzner keeper (pm2 + systemd), Vercel frontend, Supabase Postgres
- **Secure auth** — bcrypt password hashing, AES-256-GCM key encryption, JWT sessions (HttpOnly cookies)
- **Password recovery** — email-based forgot password flow via Resend (token-based, 1hr expiry, single-use)
- **OHLC charts** — 1-hour and 1-day candle aggregation from 5-minute price data
- **24h change tracking** — accurate 24-hour price change percentages per market
- **Responsive mobile UI** — landing page, docs, and trading interface optimized for mobile
- **Custom domain** — `pokeliquid.xyz` with verified email sending via Resend
- **Leaderboard + prize pool** — competitive trading with prize distribution
- **Security.txt** — on-chain security contact info via `solana-security-txt`
- **Volume farm** — automated volume generation across 6 markets (40 wallets)

## Known Limitations & Roadmap

### Important
- [ ] **No partial close** — can't close a percentage of a position
- [ ] **Single admin oracle** — one keypair pushes price, no decentralized oracle fallback
- [ ] **No limit orders** — market orders only

### Nice to have
- [x] Mainnet deployment with real USDC
- [x] MasterChef LP fee distribution
- [x] Admin transfer to multisig
- [x] 21 markets live
- [x] PnL export cards
- [ ] Referral / fee sharing system
- [ ] $POKE governance token

---

## Tech Notes

- `@types/react` pinned to 18.2.79 (wallet adapter compat — do NOT bump to 18.3.x)
- `@anchor-lang/core` for Anchor 1.x TS client (not `@coral-xyz/anchor`)
- Anchor 1.0.x: `CpiContext::new_with_signer` first arg is `.key()` not `AccountInfo`
- Large Accounts structs need `Box<Account<'info, T>>` to avoid 4096-byte stack limit
- `anchor-lang` needs `init-if-needed` feature for `init_if_needed` constraint
- bn.js `.toNumber()` throws on values > 53 bits — use `safeBn()` wrapper
- Direction enum in TS: `{ long: {} }` / `{ short: {} }`
- MarginAccount::SPACE = 546 bytes (verified via Rust test)
- Vercel rewrites `/api/keeper/*` → Hetzner to avoid HTTPS→HTTP mixed content
- Database uses `pg` package (not `@vercel/postgres`) — strips `sslmode` and `supa` params from connection string, sets `ssl: { rejectUnauthorized: false }` for Supabase
- Only wallet adapter is `SessionWalletAdapter` — Phantom/Solflare removed
- RELAYER_PRIVATE_KEY is base58 format (not JSON array)
- Password hashing uses `bcryptjs` (pure JS, no native deps) — legacy PBKDF2 hashes auto-migrate on login
- JWT sessions use `jose` package (HS256) — 30-day expiry, HttpOnly/Secure/SameSite=Lax cookies
- Forgot-password emails sent via Resend API (verified domain: `pokeliquid.xyz`)
- `SessionWalletAdapter.connect()` does NOT auto-generate keypairs — users must explicitly log in or choose guest mode
- On-chain market IDs use full names (e.g. "PRISMATIC-ETB", not "ETB") — PDA seeds: `[b"oracle", market_id.as_bytes()]`
- PositionClosed event does NOT emit notional/collateral — trade history shows "—" for size on closes
- `html-to-image` (`toPng`) used for PnL card export with pixelRatio: 2
