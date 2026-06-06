# @pokeliquid/sdk

TypeScript SDK for the [Pokeliquid](https://pokeliquid.xyz) perpetual futures DEX on Solana.

## Install

```bash
npm install @pokeliquid/sdk @solana/web3.js
```

## Quick Start

### Read-only (market data)

```ts
import { PokeliquidAPI } from "@pokeliquid/sdk";

const api = new PokeliquidAPI();

// Get latest ETB price
const price = await api.latestPrice("ETB");
console.log(`ETB: $${price.toFixed(2)}`);

// Get hourly candles
const candles = await api.candles("CHARIZARD-X", "1h");

// Get protocol stats
const stats = await api.stats();
console.log(`24h volume: $${stats.total_volume_24h}`);

// Get recent trades
const trades = await api.recentTrades(20);
```

### Trading (on-chain)

```ts
import { Connection, Keypair } from "@solana/web3.js";
import { PokeliquidClient, Long, Short } from "@pokeliquid/sdk";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const keypair = Keypair.fromSecretKey(/* your key */);

// Wrap keypair as a wallet
const wallet = {
  publicKey: keypair.publicKey,
  signTransaction: async (tx) => { tx.sign(keypair); return tx; },
  signAllTransactions: async (txs) => { txs.forEach(tx => tx.sign(keypair)); return txs; },
};

const client = new PokeliquidClient(connection, wallet);

// Deposit $50 USDC
await client.deposit(50);

// Open a 5x long on ETB with $10 collateral
const sig = await client.openPosition("ETB", Long, 10, 5);
console.log("Opened:", sig);

// Set stop-loss at $150 and take-profit at $180
await client.setSlTp("ETB", 0, 150, 180);

// Check your positions
const account = await client.fetchMarginAccount();
console.log("Positions:", account?.positions);

// Close position at slot 0
await client.closePosition("ETB", 0);

// Withdraw everything
await client.withdraw(50);
```

### LP (liquidity providing)

```ts
// Deposit $100 into the LP pool
await client.lpDeposit(100);

// Claim accumulated fees
await client.claimFees();

// Check LP position
const lp = await client.fetchLpPosition();
console.log("Shares:", lp?.shares.toString());
```

## Markets

| Key | Market | Oracle |
|-----|--------|--------|
| `ETB` | Prismatic Evolutions ETB | `FbPB...r4Q` |
| `CHARIZARD-X` | Mega Charizard X ex 125/094 | `8KU9...zeP` |
| `CHARMANDER` | Charmander 038 Mega Evo Promo | `EN3Y...ETY` |
| `PIKACHU` | Pikachu ex 276/217 Ascended Heroes | `Fx1r...N87` |

## API Reference

### `PokeliquidAPI` (read-only)

| Method | Description |
|--------|-------------|
| `ping()` | Health check |
| `health()` | Full system health |
| `prices(market, opts?)` | Historical oracle prices |
| `latestPrice(market)` | Current price in USD |
| `candles(market, resolution)` | OHLC candlestick data |
| `recentTrades(limit?)` | Recent trades |
| `userTrades(pubkey, limit?)` | Trades for a wallet |
| `stats()` | Protocol statistics |
| `events(limit?)` | Recent events |

### `PokeliquidClient` (on-chain)

| Method | Description |
|--------|-------------|
| `deposit(usd)` | Deposit USDC collateral |
| `withdraw(usd)` | Withdraw USDC collateral |
| `openPosition(market, direction, collateral, leverage, opts?)` | Open position |
| `closePosition(market, index)` | Close position |
| `setSlTp(market, index, sl, tp)` | Set stop-loss / take-profit |
| `addMargin(index, usd)` | Add margin to position |
| `removeMargin(market, index, usd)` | Remove margin from position |
| `closeMarginAccount()` | Close margin account |
| `lpDeposit(usd)` | Deposit into LP pool |
| `lpWithdraw(shares)` | Withdraw from LP pool |
| `claimFees()` | Claim LP fees |
| `fetchMarginAccount()` | Fetch margin account data |
| `fetchLpPosition()` | Fetch LP position data |
| `usdcBalance()` | USDC wallet balance |
| `solBalance()` | SOL wallet balance |

### Helpers

| Export | Description |
|--------|-------------|
| `Long` / `Short` | Direction enum values |
| `usdToRaw(usd)` | Convert USD to raw USDC (×1e6) |
| `rawToUsd(raw)` | Convert raw USDC to USD |
| `MARKETS` | Market configuration map |
| `getMarginPDA(pubkey)` | Derive margin account PDA |
| `getMarketStatePDA(marketId)` | Derive market state PDA |

## Security

This SDK only exposes **user-level** instructions. Admin operations (oracle updates, parameter changes, fee withdrawals) are intentionally excluded and cannot be called through this SDK.

## License

MIT
