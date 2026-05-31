# Pokeliquid Oracle Keeper

Continuously pushes Charizard 4/102 Base Set Unlimited PSA 10 prices from
eBay onto the Pokeliquid devnet oracle every 5 minutes.

## How it works

Each cycle:
1. Fetches an OAuth 2.0 token from eBay (cached for 2 hours, auto-refreshed).
2. Queries the eBay Browse API for the 10 most recently listed fixed-price
   listings matching `"charizard 4/102 base set unlimited psa 10"`, filtered
   to prices ≥ $1,000.
3. Extracts the price from each result and takes the **median**.
4. Runs sanity checks against the previous accepted price:
   - `> 25%` deviation → logs `WARN`, still submits.
   - `> 50%` deviation → logs `CRITICAL`, rejects and resubmits last good price.
5. Rejects any price below $1,000 (catches unrelated cards / data errors).
6. Scales to `u64`: `price * 1_000_000` (6 decimal places).
7. Calls `update_oracle` on the Pokeliquid program via a raw Solana transaction.
8. Logs one line per cycle and a health summary every hour.

API and Solana RPC errors are each retried 3× with exponential back-off
(5 s / 15 s / 45 s). The process never crashes — all errors are caught,
logged, and fall back to the last known-good price.

---

## Prerequisites

- Node.js >= 18 (for native `fetch`)
- An eBay Developer account with a Production app (Client ID + Cert ID)
- The admin keypair that owns the Pokeliquid protocol (`ADMIN_KEYPAIR_PATH`)

---

## Setup

```bash
cd keeper
npm install
cp .env.example .env
$EDITOR .env
```

### .env values to fill in

| Key | Description |
|-----|-------------|
| `EBAY_CLIENT_ID` | eBay Production App ID (e.g. `Name-app-PRD-xxx-xxx`) |
| `EBAY_CLIENT_SECRET` | eBay Production Cert ID (e.g. `PRD-xxx-xxx-xxx-xxx`) |
| `ADMIN_KEYPAIR_PATH` | Path to your Solana keypair JSON file |

All other values default to the deployed devnet addresses and sane settings.

---

## Run

### Directly (foreground, useful for testing)

```bash
node keeper.js
```

### With PM2 (persistent background process)

```bash
npm install -g pm2

pm2 start keeper.js --name keeper
pm2 logs keeper

# Restart after .env changes
pm2 restart keeper --update-env

# Auto-start on system boot
pm2 startup
pm2 save
```

---

## Log format

**Per-cycle:**
```
[2026-01-01T12:00:00.000Z] ebay_psa10_median=$3200.00 (n=8) price=$3200.00 on_chain=3200000000 deviation=+2.1% tx=abc123...
```

**OAuth refresh:**
```
[2026-01-01T12:00:00.000Z] INFO  eBay OAuth token refreshed — expires in 7200s
```

**Hourly health summary:**
```
[HEALTH] uptime=60min updates=12 errors=0 last_price=$3200.00 last_update=2026-01-01T12:00:00.000Z ebay_token=valid (expires in 90min)
```

**Warning / error prefixes:**
- `WARN`     — price deviation >25%, API fallback, or no valid samples
- `ERROR`    — retriable failure (API or RPC), cycle skipped
- `CRITICAL` — price deviation >50%, new price rejected

---

## Deployed addresses (devnet)

| Account | Address |
|---------|---------|
| Program | `7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ` |
| OracleAccount | `2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12` |
| ProtocolState | `8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK` |
