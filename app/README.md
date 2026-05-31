# Pokeliquid Frontend

Next.js 14 frontend for the CHARIZARD-PERP perpetual futures DEX on Solana devnet.

## Stack

- **Next.js 14** (App Router)
- **Tailwind CSS** with custom design system
- **@solana/wallet-adapter-react** — Phantom, Backpack, Solflare
- **@anchor-lang/core** — Anchor 1.0.x TypeScript client
- **@solana/spl-token** — ATA management

## Setup

```bash
cd app
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` to `.env.local`. All addresses are pre-filled for devnet:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_RPC_ENDPOINT` | Solana RPC (default: devnet) |
| `NEXT_PUBLIC_PROGRAM_ID` | Pokeliquid program |
| `NEXT_PUBLIC_PROTOCOL_STATE` | ProtocolState PDA |
| `NEXT_PUBLIC_ORACLE_ACCOUNT` | OracleAccount PDA |
| `NEXT_PUBLIC_FEE_VAULT` | Fee vault token account |
| `NEXT_PUBLIC_INSURANCE_FUND` | Insurance fund token account |
| `NEXT_PUBLIC_USDC_MINT` | Devnet USDC mint |

## IDL Integration

The IDL is copied from `../target/idl/pokeliquid.json` to `src/lib/pokeliquid.idl.json`.

After rebuilding the program (`anchor build`), refresh it:

```bash
cp ../target/idl/pokeliquid.json src/lib/pokeliquid.idl.json
```

## Price & USDC Scale

Both oracle prices and USDC amounts use **6 decimal places**:
- `1_000_000` raw = `$1.00` price or `1 USDC`
- Oracle price `2_230_400_000` = `$2,230.40`

## User Flow

1. **Connect** Phantom/Backpack/Solflare wallet (devnet)
2. **Get Test USDC** — mints 1,000 devnet USDC (Trade page button)
3. **Deposit** USDC as margin collateral (Pool page)
4. **Open Position** — Long or Short, 1x–10x leverage (Trade page)
5. **Close Position** when ready to settle PnL

## Vercel Deploy

```bash
# In Vercel dashboard:
# Root Directory: pokeliquid/app
# Framework: Next.js
# Build Command: npm run build
# Output Directory: .next

# Add env vars from .env.example in Vercel project settings
```

Or via CLI:

```bash
cd app
npx vercel --prod
```

## Pages

| Route | Description |
|---|---|
| `/` | Trade — price ticker, chart, order form, position panel |
| `/pool` | Liquidity — deposit/withdraw collateral, protocol params |
| `/stats` | Statistics — oracle data, OI, roadmap |

## Data Polling

| Data | Interval |
|---|---|
| Oracle price | 10s |
| Protocol state | 30s |
| Margin account | 10s (when wallet connected) |
| Wallet balances | 30s (when wallet connected) |
