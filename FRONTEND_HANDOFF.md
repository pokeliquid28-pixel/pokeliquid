# Pokeliquid — Frontend Handoff

Welcome to Pokeliquid! This document gives you everything you need to get productive on the frontend. Read it top to bottom before touching any code.

---

## Project Overview

Pokeliquid is a perpetual futures trading platform on Solana where users trade the price of a real-world Pokemon TCG product — the Prismatic Evolutions Elite Trainer Box. A keeper server scrapes TCGPlayer for the live market price, pushes it on-chain via a custom Solana program (written in Anchor/Rust), and the Next.js frontend lets users open leveraged long/short positions, manage collateral, set stop-loss/take-profit, and view trade history. Everything runs on **devnet** — no real money is involved.

- **Live URL:** https://pokeliquid.xyz
- **Tech stack:** Next.js 14 (App Router), Tailwind CSS, Anchor (Solana), `@solana/wallet-adapter-react`
- **Repo root:** The frontend lives in the `app/` subdirectory. The Solana program is in `programs/pokeliquid/`, and the keeper server is in `keeper/`.

---

## Getting Started

### Clone & Install

```bash
git clone https://github.com/onchainscammer-art/poke-liquid.git
cd poke-liquid/app
npm install
```

### Environment Variables

Create `app/.env.local` from the example:

```bash
cp .env.example .env.local
```

The only variable needed for local development:

| Variable | Required? | Description | Default |
|----------|-----------|-------------|---------|
| `NEXT_PUBLIC_RPC_ENDPOINT` | No | Solana RPC URL | `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_PROGRAM_ID` | No | On-chain program address | Hardcoded in `addresses.ts` |
| `NEXT_PUBLIC_PROTOCOL_STATE` | No | Protocol state PDA | Hardcoded in `addresses.ts` |
| `NEXT_PUBLIC_ORACLE_ACCOUNT` | No | Oracle account PDA | Hardcoded in `addresses.ts` |
| `NEXT_PUBLIC_FEE_VAULT` | No | Fee vault PDA | Hardcoded in `addresses.ts` |
| `NEXT_PUBLIC_INSURANCE_FUND` | No | Insurance fund PDA | Hardcoded in `addresses.ts` |
| `NEXT_PUBLIC_USDC_MINT` | No | Devnet USDC mint address | Hardcoded in `addresses.ts` |

All `NEXT_PUBLIC_` vars have hardcoded fallback values in `src/lib/addresses.ts`, so you can run locally with zero config. The backend env vars (`EMAIL_ENCRYPTION_SECRET`, `JWT_SECRET`, `POSTGRES_URL`, etc.) are only needed on Vercel and are already configured there — you don't need them locally.

### Run Locally

```bash
npm run dev
# Opens http://localhost:3000
```

### Getting Test USDC

1. Sign up or continue as guest
2. Click "Get 1,000 Test USDC" in the Collateral panel (right side)
3. If you see a SOL error, the app will auto-airdrop devnet SOL first, then retry
4. Deposit USDC as collateral before trading

---

## Architecture — What NOT to Touch

These files are working correctly and battle-tested. Do not modify them without discussing with the team first.

### Hooks (`src/hooks/`)

| File | What it does |
|------|-------------|
| `useOracle.ts` | Polls the on-chain oracle account every 10s for the current price (raw u64, divide by 1,000,000 for USD). Also fetches historical price data from the keeper API for the chart. Returns `price`, `readings[]`, `health`, `isStale`, `lastUpdated`. |
| `useProtocolState.ts` | Polls the on-chain protocol state every 5s + subscribes to account changes. Returns all protocol parameters: fee rates, exposure caps, funding rates, pause status. Uses `safeBn()` to handle u64::MAX values that would overflow JavaScript. |
| `useMarginAccount.ts` | Fetches the current user's margin account PDA. Returns `collateral` (free balance), `positions[]` (up to 5 open positions), and `exists` (whether the account has been created on-chain). Polls every 5s. |
| `useLiquidityPool.ts` | Fetches the LP pool state: `totalUsdc`, `totalShares`, `accumulatedFees`. Polls every 5s + subscribes to account changes. |
| `useLpPosition.ts` | Fetches the current user's LP position (shares deposited, deposit amount). |
| `useWalletBalances.ts` | Reads the connected wallet's SOL balance (lamports) and USDC token account balance. Polls every 5s. |

### API Routes (`src/app/api/`)

| Route | Method | What it does |
|-------|--------|-------------|
| `signup/` | POST | Creates account: validates email, hashes password (bcrypt), encrypts private key (AES-256-GCM), stores in Postgres, sets JWT session cookie |
| `login/` | POST | Verifies password, decrypts private key, returns it to client, sets JWT cookie. Auto-migrates legacy PBKDF2 hashes to bcrypt. |
| `logout/` | POST | Clears the session cookie |
| `me/` | GET | Reads JWT from cookie, returns `{ userId, email, walletPubkey }` or 401 |
| `forgot-password/` | POST | Generates reset token, sends email via Resend. Always returns success (prevents email enumeration). |
| `reset-password/` | POST | Changes password using current password (for logged-in users) |
| `reset-password-with-token/` | POST | Resets password using emailed token (1hr expiry, single-use) |
| `create-session-wallet/` | POST | Funds a new session wallet with devnet SOL via the relayer keypair |

### Libraries (`src/lib/`)

| File | What it does |
|------|-------------|
| `addresses.ts` | All on-chain account addresses (program ID, PDAs) and PDA derivation functions. Hardcoded devnet addresses with env var overrides. |
| `program.ts` | Creates Anchor `Program` instances. `getReadonlyProgram()` for fetching data (no wallet needed), `getProgram()` for sending transactions (needs connected wallet). |
| `utils.ts` | Price/USDC formatting, PnL calculation, liquidation price formulas, funding rate math. All numbers use raw u64 format (divide by 1,000,000 for USD display). |
| `session-wallet.ts` | Custom `SessionWalletAdapter` — generates/stores a Solana keypair in localStorage so users can trade without a browser wallet extension. Also has helpers: `getSavedEmail()`, `setSavedEmail()`, `hasSessionWallet()`, etc. |
| `crypto.ts` | AES-256-GCM encrypt/decrypt for private key storage on the server. |
| `auth.ts` | Argon2id password hashing, JWT creation/verification (jose library), session cookie helpers. |
| `db.ts` | Postgres connection pool and all database queries (accounts, reset tokens, session wallets). |
| `pokeliquid.idl.json` | The Anchor IDL (Interface Definition Language) — auto-generated from the Rust program. **Never edit this manually.** It's generated by `anchor build` and copied here. |

### Providers (`src/providers/`)

| File | What it does |
|------|-------------|
| `AppProviders.tsx` | Wraps the app in Solana connection + wallet providers. Only uses `SessionWalletAdapter` (no Phantom/Solflare). |
| `SessionWalletProvider.tsx` | Auto-connects returning users who have a keypair in localStorage. New users see the landing page instead. |
| `NotificationProvider.tsx` | Manages toast notifications and the notification bell. Monitors positions for liquidation warnings. |

---

## Component Map

### Layout & Navigation

| Component | File | Description |
|-----------|------|-------------|
| **Header** | `Header.tsx` | Top nav bar. Logo, navigation links (Trade/Pool/Stats), oracle health indicator, wallet balances, notification bell, wallet button. |
| **Logo** | `Logo.tsx` | Renders the Pokeliquid logo PNG at a given `size` prop. Picks optimized image (64/192/512px) based on size. |
| **DevnetBanner** | `DevnetBanner.tsx` | Yellow "DEVNET — NOT REAL MONEY" banner at the top. |
| **WalletButton** | `WalletButton.tsx` | Shows "Log In" / "Try Without Account" when disconnected. Shows email + address + Disconnect when connected. Calls `/api/me` to restore session from JWT cookie. Calls `/api/logout` on disconnect. |

### Authentication

| Component | File | Description |
|-----------|------|-------------|
| **LandingAuth** | `LandingAuth.tsx` | Full-page login/signup form shown when not connected. Two modes: login and signup (with password confirmation). "Forgot password?" links to `/reset-password`. "Continue as guest" option. |
| **AuthModal** | `AuthModal.tsx` | Modal version of login/signup for in-app use (e.g., "Save Account" button in header). Used when a guest wants to create an account after trading. |
| **SaveWalletSheet** | `SaveWalletSheet.tsx` | Bottom sheet that appears after a guest's first trade, prompting them to create an account. Exports `incrementTradeCount()` and `getTradeCount()`. |

### Trading

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| **TradingPanel** | `TradingPanel.tsx` | `oracle`, `protocol`, `margin`, `onRefresh` | Order entry form. Long/Short toggle, collateral amount, leverage slider (1-10x), optional SL/TP prices. Shows estimated liquidation price, fees, and funding rate. Calls `open_position` on-chain. |
| **PositionPanel** | `PositionPanel.tsx` | `oracle`, `margin`, `protocol`, `onRefresh` | Displays all open positions (up to 5). Shows real-time PnL, margin ratio, entry/liq prices, time open, SL/TP status. Has close position, add/remove margin, and set SL/TP controls. |
| **CollateralPanel** | `CollateralPanel.tsx` | `margin`, `onRefresh` | Shows total/free/locked collateral. Deposit/withdraw buttons. "Get 1,000 Test USDC" button (auto-airdrops SOL if needed). |

### Data Display

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| **OracleChart** | `OracleChart.tsx` | `readings`, `height` | Canvas-drawn price chart showing last 50 oracle readings. Green fill-area chart with price labels. |
| **LongShortBar** | `LongShortBar.tsx` | `totalLong`, `totalShort`, `maxLong`, `maxShort` | Visual bar showing long vs short open interest ratio. Green (long) and red (short) with percentages. |
| **TradeHistory** | `TradeHistory.tsx` | (none) | Fetches trade history from keeper API (`/api/keeper/trades`). Shows recent trades for the connected user. |

### UI Primitives

| Component | File | Props | Description |
|-----------|------|-------|-------------|
| **Skeleton** | `Skeleton.tsx` | `height`, `width` | Shimmer loading placeholder. |
| **NotificationBell** | `NotificationBell.tsx` | (none) | Bell icon with badge count. Dropdown shows liquidation warnings and position alerts. |
| **ToastContainer** | `ToastContainer.tsx` | (none) | Renders ephemeral toast notifications (slide-in from right). |

---

## Data Flow

### Oracle Price: Keeper -> Chain -> Frontend

```
TCGPlayer.com
    |
    v  (Playwright scrape every 5 min)
Keeper (Hetzner server)
    |
    v  (update_oracle instruction)
Solana Program (OracleAccount on-chain)
    |
    v  (useOracle hook polls every 10s)
Frontend (price state, chart)
```

The keeper also stores price history in SQLite. The frontend fetches historical data via `/api/keeper/prices` for the chart, and reads the current price directly from the on-chain oracle account.

### Wallet Connection

There is **only one wallet adapter**: `SessionWalletAdapter`. No Phantom, Solflare, or other browser wallets.

- **Returning user:** `SessionWalletProvider` checks `localStorage` for a saved keypair. If found, auto-connects.
- **New user (login/signup):** User enters email + password on `LandingAuth`. Server decrypts their stored private key and returns it. Client saves to `localStorage`, connects the wallet adapter, reloads.
- **Guest:** Clicks "Continue as guest". A new keypair is generated, stored in `localStorage`. Ephemeral — lost if localStorage is cleared and no account was created.

### Opening a Position

1. User enters collateral amount, leverage, direction (long/short) in `TradingPanel`
2. Frontend calls `open_position` instruction on the Solana program
3. Program validates parameters, deducts collateral + fee, creates the position in the user's `MarginAccount`
4. `useMarginAccount` hook polls and picks up the new position
5. `PositionPanel` renders it with real-time PnL calculations

### Trade History

The keeper server logs all program events (opens, closes, liquidations) to SQLite. The frontend fetches from `/api/keeper/trades?user=PUBKEY&limit=20` via the Vercel proxy (`/api/keeper/*` rewrites to the Hetzner keeper).

---

## Keeper API Endpoints

All accessed via the Vercel proxy at `/api/keeper/*`. The actual server is at `157.180.67.25:3001`.

### `GET /api/keeper/prices?limit=50`

Returns recent price records.

```json
[
  { "id": 1234, "ewma": 163.92, "raw": 165.00, "timestamp": 1717315200 },
  { "id": 1233, "ewma": 163.85, "raw": 164.50, "timestamp": 1717314900 }
]
```

### `GET /api/keeper/health`

Returns keeper status.

```json
{
  "status": "ok",
  "uptime_seconds": 86400,
  "last_oracle_update": 1717315200,
  "oracle_price_usd": 163.92,
  "total_oracle_updates": 288,
  "total_liquidations": 5,
  "total_sl_tp_executions": 12,
  "rpc_endpoint": "https://api.devnet.solana.com"
}
```

### `GET /api/keeper/stats`

Returns 24h/7d trading statistics.

```json
{
  "total_volume_24h": 50000.00,
  "total_volume_7d": 250000.00,
  "total_trades_24h": 45,
  "total_liquidations_24h": 2,
  "total_fees_24h": 1000.00,
  "unique_traders_24h": 8
}
```

### `GET /api/keeper/trades?user=PUBKEY&limit=20`

Returns trade history for a specific user.

```json
[
  {
    "id": 100,
    "timestamp": 1717315200,
    "user_pubkey": "ABcd...",
    "position_index": 0,
    "action": "open",
    "direction": "long",
    "collateral": 100.00,
    "notional": 1000.00,
    "leverage": 10,
    "entry_price": 163.92,
    "exit_price": null,
    "pnl": null
  }
]
```

### `GET /api/keeper/events/recent`

Returns recently decoded on-chain program events.

```json
[
  {
    "name": "PositionOpened",
    "data": { "user": "ABcd...", "direction": "long", "collateral": 100000000 },
    "timestamp": 1717315200
  }
]
```

---

## Design System (Current)

> **Note:** This design system is being replaced by the new design. Document it here so you know what exists and what to replace.

### Colors

Defined in `tailwind.config.ts` and `globals.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `bg` | `#080B10` | Page background (near-black) |
| `panel` | `#0F1420` | Card/panel backgrounds |
| `border` | `#1e2a3a` | Borders, dividers |
| `primary` | `#e2e8f0` | Primary text (light gray) |
| `secondary` | `#64748b` | Secondary/muted text |
| `long` | `#22c55e` | Green — long positions, profit, positive |
| `short` | `#ef4444` | Red — short positions, loss, negative |

### Holographic Gradient

The signature gradient used for branding, buttons, and accents:

```css
linear-gradient(135deg, #ff6ec7, #a78bfa, #38bdf8, #34d399)
```

Available as utility classes:
- `.holo-text` — gradient text (transparent background clip)
- `.holo-bg` — gradient background (used on primary buttons)
- `.holo-border` — gradient border via pseudo-element

### Typography

| Font | CSS Class | Usage |
|------|-----------|-------|
| **Inter** | `font-sans` (default) | All UI text — labels, buttons, headings |
| **JetBrains Mono** | `font-mono` | Prices, numbers, addresses, timestamps, data |

Both loaded from Google Fonts in `globals.css`.

### Spacing

- Panels/cards: `p-3 md:p-5` (12px mobile, 20px desktop)
- Section gaps: `space-y-4 md:space-y-6`
- Max width: `max-w-7xl` (1280px)
- Main layout: `grid grid-cols-1 lg:grid-cols-5` (60/40 split on desktop)

### Component Patterns

- **Panels** use `border border-border bg-panel` with section headers in `text-[10px] md:text-xs font-semibold text-secondary uppercase tracking-wider`
- **Buttons** — primary: `holo-bg text-black`, secondary: `border border-border text-secondary`
- **Inputs** — `bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary`
- **Loading states** — `<Skeleton>` component with shimmer animation
- **Animations** — `price-flash-up`/`price-flash-down` for price changes, `pnl-flash-up`/`pnl-flash-down` for PnL

---

## Pages

### `/` — Trade Page

**File:** `src/app/page.tsx`

The main trading interface. If the user is not connected, shows `LandingAuth` (login/signup). If connected, shows:
- Product image + price ticker with flash animation
- Price chart (last 50 readings)
- Long/short open interest bar
- Position panel (open positions)
- Trade history
- Collateral panel (deposit/withdraw)
- Trading panel (open new positions)

**Components used:** `LandingAuth`, `OracleChart`, `LongShortBar`, `TradingPanel`, `PositionPanel`, `CollateralPanel`, `TradeHistory`, `Skeleton`

**Data needed:** `useOracle`, `useProtocolState`, `useMarginAccount`

### `/pool` — Liquidity Pool

**File:** `src/app/pool/page.tsx`

Users can deposit USDC into the liquidity pool to earn fees. Shows pool stats, user's LP position, deposit/withdraw forms.

**Components used:** `Skeleton`

**Data needed:** `useLiquidityPool`, `useLpPosition`, `useWalletBalances`, `useProtocolState`

### `/stats` — Protocol Statistics

**File:** `src/app/stats/page.tsx`

Dashboard showing 24h/7d trading volume, trade counts, liquidations, fees, unique traders, keeper health, funding rates. Fetches from keeper API endpoints.

**Data needed:** `useOracle`, `useProtocolState`, `useLiquidityPool` + keeper API (`/stats`, `/health`)

### `/reset-password` — Password Reset

**File:** `src/app/reset-password/page.tsx`

Dual-mode page:
- No `?token=` param: shows "enter your email" form, calls `POST /api/forgot-password`
- With `?token=XXX`: shows "enter new password" form, calls `POST /api/reset-password-with-token`

On success, redirects to `/` (login page).

---

## On-Chain Program

| | |
|---|---|
| **Program ID** | `7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ` |
| **ProtocolState** | `8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK` |
| **OracleAccount** | `2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12` |
| **FeeVault** | `GRFF44bR65tVUChnidAqZAgpFbg1Kw8GboWzUBQbW581` |
| **InsuranceFund** | `9NmpMraE2XCSUa1gKgwi9zxN8LLdT4o5Uiis5dKkKs1F` |
| **LiquidityPool** | `DiM6xwNdBnNGf2TrgHHgZJYSFLpEXawADvAWdQvUKFT` |
| **USDC Mint** | `Gj9gBxmesYoNa4kvZUKJbiF85PduMKnHnppp4ikbWUUi` |

### Instructions the Frontend Calls

| Instruction | Where it's called | What it does |
|-------------|-------------------|-------------|
| `deposit_collateral(amount)` | CollateralPanel | Transfer USDC from wallet to margin account |
| `withdraw_collateral(amount)` | CollateralPanel | Withdraw free collateral back to wallet |
| `open_position(direction, collateral, leverage, sl, tp)` | TradingPanel | Open a leveraged long or short position |
| `close_position(position_index)` | PositionPanel | Close a position, settle PnL + fees |
| `set_sl_tp(position_index, sl, tp)` | PositionPanel | Update stop-loss/take-profit prices |
| `add_margin(position_index, amount)` | PositionPanel | Add collateral to an open position |
| `remove_margin(position_index, amount)` | PositionPanel | Remove collateral from an open position |
| `mint_devnet_usdc` | CollateralPanel + TradingPanel | Mint 1,000 test USDC to the caller |
| `lp_deposit(amount)` | Pool page | Deposit USDC into the LP pool |
| `lp_withdraw(amount)` | Pool page | Withdraw USDC from the LP pool |

### IDL

The complete IDL is at `src/lib/pokeliquid.idl.json`. It's auto-generated — never edit it manually.

### Key Concepts for Non-Solana Developers

- **PDA (Program Derived Address):** Deterministic account addresses derived from seeds. The user's margin account PDA is derived from `["margin", user_pubkey]`. See `addresses.ts`.
- **ATA (Associated Token Account):** Each user needs a token account for USDC. The frontend auto-creates it if missing.
- **Raw u64 values:** All prices and amounts are stored as integers. Divide by `1,000,000` for human-readable USD. Use `rawToPrice()` and `rawToUsdc()` from `utils.ts`.
- **Direction enum:** In TypeScript, pass `{ long: {} }` or `{ short: {} }` to Anchor instructions.
- **bn.js:** Solana uses `BN` (big number) objects. Use `.toNumber()` to convert, but beware of overflow on large values — use `safeBn()` from `useProtocolState.ts`.

---

## Environment Variables (Complete List)

### Client-side (`NEXT_PUBLIC_*`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_RPC_ENDPOINT` | No | Solana RPC URL | `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_PROGRAM_ID` | No | Program ID | `7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ` |
| `NEXT_PUBLIC_PROTOCOL_STATE` | No | Protocol state PDA | `8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK` |
| `NEXT_PUBLIC_ORACLE_ACCOUNT` | No | Oracle PDA | `2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12` |
| `NEXT_PUBLIC_FEE_VAULT` | No | Fee vault PDA | `GRFF44bR65tVUChnidAqZAgpFbg1Kw8GboWzUBQbW581` |
| `NEXT_PUBLIC_INSURANCE_FUND` | No | Insurance fund PDA | `9NmpMraE2XCSUa1gKgwi9zxN8LLdT4o5Uiis5dKkKs1F` |
| `NEXT_PUBLIC_USDC_MINT` | No | USDC mint address | `Gj9gBxmesYoNa4kvZUKJbiF85PduMKnHnppp4ikbWUUi` |
| `NEXT_PUBLIC_PRICE_API` | No | Keeper API base URL | `/api/keeper` |
| `NEXT_PUBLIC_APP_URL` | No | App URL for email links | `https://pokeliquid.xyz` |

### Server-side (Vercel only — already configured)

| Variable | Required | Description |
|----------|----------|-------------|
| `EMAIL_ENCRYPTION_SECRET` | Yes | AES-256-GCM key for encrypting private keys |
| `JWT_SECRET` | Yes | Signs JWT session cookies (HS256) |
| `POSTGRES_URL` | Yes | Supabase Postgres connection string |
| `RESEND_API_KEY` | Yes | Resend.com API key for password reset emails |
| `RELAYER_PRIVATE_KEY` | Yes | Base58 private key that funds new session wallets with SOL |

---

## Deployment

### Auto-Deploy from GitHub

Vercel is connected to the GitHub repo. Every push to `main` triggers an auto-deploy. The Vercel root directory is set to `app/`.

### Workflow

1. Create a feature branch: `git checkout -b feature/my-change`
2. Make your changes in `app/src/`
3. Test locally with `npm run dev`
4. Push and open a PR: `git push -u origin feature/my-change`
5. Vercel creates a preview deployment for the PR — test on that URL
6. Get review and merge to `main`
7. Vercel auto-deploys to production

### Rules

- **Never push directly to `main`** — always use PRs
- **Never commit `.env` files** or any file containing secrets
- **Never modify the IDL file** — it's auto-generated from the Rust program
- Run `npm run build` locally before pushing to catch type errors early

---

## Known Issues & TODOs

### Functional Issues
- **No partial close** — users can't close a percentage of a position, only 100%
- **No limit orders** — market orders only
- **Single oracle source** — price comes from one TCGPlayer scrape, no fallback oracles
- **Devnet RPC rate limits** — `useOracle` and `useProtocolState` poll frequently; devnet RPC can throttle

### UX Issues
- Logo is a square PNG with lots of whitespace — looks small at small sizes
- Price chart is basic (canvas-drawn, no zoom/pan)
- Mobile layout works but could be tighter
- No dark/light mode toggle (dark only)
- Trade history only shows trades logged by the keeper — if keeper was down, trades are missing

### Security Notes
- `@types/react` is pinned to `18.2.79` — do NOT bump to `18.3.x` (breaks wallet adapter types)
- The session wallet private key lives in `localStorage` — standard for devnet, would need hardware wallet support for mainnet

---

## Contact

- **Backend / Solana program / keeper / infrastructure:** Ethan
- **Frontend / design:** You + Ethan

When in doubt, ask before modifying anything in `src/hooks/`, `src/lib/`, `src/providers/`, or `src/app/api/`. These are the load-bearing walls.
