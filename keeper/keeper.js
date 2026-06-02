"use strict";

require("dotenv").config();
const fs   = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { createHash } = require("crypto");
const Database = require("better-sqlite3");
const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } = require("@solana/web3.js");
const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { chromium } = require("playwright");
const { sendAlert, sendDailyDigest } = require("./telegram");

// ─── Config ───────────────────────────────────────────────────────────────────

const ADMIN_KEYPAIR_PATH    = process.env.ADMIN_KEYPAIR_PATH || "/Users/ethangriffin/.config/solana/id.json";
const SECONDARY_KEYPAIR_PATH = process.env.SECONDARY_KEYPAIR_PATH || "./secondary.json";
const PROGRAM_ID            = new PublicKey(process.env.PROGRAM_ID || "7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ");
const ORACLE_PUBKEY         = new PublicKey(process.env.ORACLE_PUBKEY || "2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12");
const PROTOCOL_STATE_PUBKEY = new PublicKey(process.env.PROTOCOL_STATE_PUBKEY || "8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK");
const RPC_URL               = process.env.RPC_URL || "https://api.devnet.solana.com";
const UPDATE_INTERVAL_MS    = parseInt(process.env.UPDATE_INTERVAL_MS || "300000", 10);
const PRICE_MIN_USD         = parseFloat(process.env.PRICE_MIN_USD || "100");
const SEED_PRICE_USD        = parseFloat(process.env.SEED_PRICE_USD || "179");
const RAW_HISTORY_SIZE      = 12; // ~1 hour at 5-min intervals

const TCGPLAYER_URL = process.env.TCGPLAYER_URL ||
  "https://www.tcgplayer.com/product/593355/Pokemon-SV%20Prismatic%20Evolutions-Prismatic%20Evolutions%20Elite%20Trainer%20Box?Language=English";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PRICES_FILE = path.join(__dirname, "prices.json");

const LIQUIDATION_INTERVAL_MS = parseInt(process.env.LIQUIDATION_INTERVAL_MS || "10000", 10);
const LIQUIDATION_THRESHOLD   = 0.05; // 5% margin ratio → liquidatable
const FUNDING_RATE_SCALE      = 100_000n;

// Telegram config
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID || "";

// Well-known devnet addresses
const USDC_MINT_PUBKEY   = new PublicKey("Gj9gBxmesYoNa4kvZUKJbiF85PduMKnHnppp4ikbWUUi");
const FEE_VAULT_PUBKEY   = new PublicKey("GRFF44bR65tVUChnidAqZAgpFbg1Kw8GboWzUBQbW581");
const INS_FUND_PUBKEY    = new PublicKey("9NmpMraE2XCSUa1gKgwi9zxN8LLdT4o5Uiis5dKkKs1F");
const TOKEN_PROGRAM      = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOC_TOKEN_PROG   = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bSe");

const LP_POOL_PUBKEY = PublicKey.findProgramAddressSync(
  [Buffer.from("liquidity_pool")], PROGRAM_ID
)[0];

const LP_VAULT_PUBKEY = PublicKey.findProgramAddressSync(
  [Buffer.from("lp_vault")], PROGRAM_ID
)[0];

// Anchor discriminators
const UPDATE_ORACLE_DISCRIMINATOR = (() => {
  const hash = createHash("sha256").update("global:update_oracle").digest();
  return hash.slice(0, 8);
})();

const LIQUIDATE_DISCRIMINATOR = (() => {
  const hash = createHash("sha256").update("global:liquidate").digest();
  return hash.slice(0, 8);
})();

const SETTLE_FUNDING_DISCRIMINATOR = (() => {
  const hash = createHash("sha256").update("global:settle_funding").digest();
  return hash.slice(0, 8);
})();

const MARGIN_ACCOUNT_DISCRIMINATOR = (() => {
  const hash = createHash("sha256").update("account:MarginAccount").digest();
  return hash.slice(0, 8);
})();

// Event discriminators for trade parsing
const EVENT_DISC_POSITION_OPENED = createHash("sha256").update("event:PositionOpened").digest().slice(0, 8);
const EVENT_DISC_POSITION_CLOSED = createHash("sha256").update("event:PositionClosed").digest().slice(0, 8);
const EVENT_DISC_POSITION_LIQUIDATED = createHash("sha256").update("event:PositionLiquidated").digest().slice(0, 8);

let lastParsedSlot = 0;

const FUNDING_INTERVAL_MS = parseInt(process.env.FUNDING_INTERVAL_MS || "3600000", 10);

// ─── SQLite price history ─────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, "prices.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    raw_price REAL NOT NULL,
    ewma REAL NOT NULL,
    deviation REAL NOT NULL,
    alpha REAL NOT NULL,
    tx_signature TEXT NOT NULL
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_ph_timestamp ON price_history(timestamp)`);

// ─── Trades table ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    user_pubkey TEXT NOT NULL,
    position_index INTEGER NOT NULL,
    action TEXT NOT NULL,
    direction TEXT NOT NULL,
    collateral REAL NOT NULL,
    notional REAL NOT NULL,
    leverage INTEGER NOT NULL,
    entry_price REAL,
    exit_price REAL,
    pnl REAL,
    funding_paid REAL,
    fee_paid REAL NOT NULL,
    tx_signature TEXT NOT NULL UNIQUE,
    close_reason TEXT
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_pubkey)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_trades_ts ON trades(timestamp)`);

const insertTrade = db.prepare(`
  INSERT OR IGNORE INTO trades (timestamp, user_pubkey, position_index, action, direction,
    collateral, notional, leverage, entry_price, exit_price, pnl, funding_paid, fee_paid,
    tx_signature, close_reason)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const queryTradesByUser = db.prepare(`
  SELECT * FROM trades WHERE user_pubkey = ? ORDER BY id DESC LIMIT ?
`);

const queryTradesRecent = db.prepare(`
  SELECT * FROM trades ORDER BY id DESC LIMIT ?
`);

const queryTradesCountByUser = db.prepare(`
  SELECT COUNT(*) as total FROM trades WHERE user_pubkey = ?
`);

const queryStats24h = db.prepare(`
  SELECT
    COALESCE(SUM(notional), 0) as total_volume,
    COUNT(*) as total_trades,
    SUM(CASE WHEN action = 'liquidate' THEN 1 ELSE 0 END) as total_liquidations,
    COALESCE(SUM(fee_paid), 0) as total_fees,
    COUNT(DISTINCT user_pubkey) as unique_traders
  FROM trades WHERE timestamp >= ?
`);

const queryStats7d = db.prepare(`
  SELECT COALESCE(SUM(notional), 0) as total_volume FROM trades WHERE timestamp >= ?
`);

// Decoded events log table
db.exec(`
  CREATE TABLE IF NOT EXISTS decoded_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    data TEXT NOT NULL,
    tx_signature TEXT NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_events_ts ON decoded_events(timestamp)`);

const insertEvent = db.prepare(`
  INSERT INTO decoded_events (timestamp, event_type, data, tx_signature) VALUES (?, ?, ?, ?)
`);

const queryRecentEvents = db.prepare(`
  SELECT * FROM decoded_events ORDER BY id DESC LIMIT ?
`);

const insertPrice = db.prepare(`
  INSERT INTO price_history (timestamp, raw_price, ewma, deviation, alpha, tx_signature)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const queryLastN = db.prepare(`
  SELECT * FROM price_history ORDER BY id DESC LIMIT ?
`);

const queryRange = db.prepare(`
  SELECT * FROM price_history WHERE timestamp >= ? AND timestamp <= ? ORDER BY id ASC
`);

function recordPrice(rawPrice, ewmaValue, deviation, alpha, txSig) {
  const ts = Math.floor(Date.now() / 1000);
  insertPrice.run(ts, rawPrice, ewmaValue, deviation, alpha, txSig);
}

// ─── Health / stats counters ─────────────────────────────────────────────

let ewma        = SEED_PRICE_USD;
let rawHistory  = Array(RAW_HISTORY_SIZE).fill(SEED_PRICE_USD);

let spikesDetected = 0;
let hourUpdates    = 0;
let hourRawMin     = Infinity;
let hourRawMax     = -Infinity;
let hourRawSum     = 0;
let hourRawCount   = 0;

let uptimeStart          = Date.now();
let totalUpdates         = 0;
let totalErrors          = 0;
let lastUpdateTime       = null;
let oracleUpdates1h      = 0;
let oracleUpdates24h     = 0;
let liquidationChecks1h  = 0;
let liquidations24h      = 0;
let fundingSettlements24h = 0;
let fundingErrors24h     = 0;
let scrapeErrors24h      = 0;
let consecutiveLiqFails  = 0;
let consecutiveRpcFails  = 0;
let rpcErrors1h          = [];
let rpcErrors10m         = [];
let lastTelegramAlert    = 0;
let accountsMonitored    = 0;
let lastLiqCheck         = null;
let lastFundingSettlement = null;
let errors24h            = 0;

// ─── RPC error tracking ─────────────────────────────────────────────────

function trackRpcError() {
  const now = Date.now();
  rpcErrors10m.push(now);
  rpcErrors1h.push(now);
  consecutiveRpcFails++;

  rpcErrors10m = rpcErrors10m.filter(t => now - t < 10 * 60 * 1000);
  rpcErrors1h  = rpcErrors1h.filter(t => now - t < 60 * 60 * 1000);

  if (consecutiveRpcFails >= 3) {
    sendAlert("CRITICAL", "Solana RPC connection failed 3x in a row", {
      "Consecutive failures": consecutiveRpcFails,
      "Errors in 10min": rpcErrors10m.length,
      "RPC URL": RPC_URL,
    });
  } else if (rpcErrors1h.length > 5) {
    sendAlert("WARN", `RPC errors elevated: ${rpcErrors1h.length} in last hour`, {
      "Errors 10min": rpcErrors10m.length,
      "Errors 1h": rpcErrors1h.length,
    });
  }
}

function resetRpcFailStreak() {
  consecutiveRpcFails = 0;
}

// ─── HTTP API for price history + health ─────────────────────────────────

const API_PORT = parseInt(process.env.API_PORT || "3001", 10);

function startApiServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET");
    res.setHeader("Content-Type", "application/json");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://localhost:${API_PORT}`);

    if (url.pathname === "/ping") {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, timestamp: new Date().toISOString() }));
      return;
    }

    if (url.pathname === "/health") {
      const nowMs = Date.now();
      const lastUpdateTs = lastUpdateTime ? Math.floor(lastUpdateTime.getTime() / 1000) : 0;
      const secondsSince = lastUpdateTs > 0 ? Math.floor(nowMs / 1000) - lastUpdateTs : -1;

      // Status logic
      let status = "healthy";
      if (secondsSince < 0 || secondsSince > 30 * 60 || consecutiveRpcFails >= 3) {
        status = "critical";
      } else if (secondsSince > 10 * 60 || rpcErrors1h.length > 5) {
        status = "degraded";
      }

      // Fetch live on-chain data (best-effort, don't block)
      let solanaData = { rpc_url: RPC_URL, slot: null, rpc_latency_ms: null, relayer_sol_balance: null };
      let protocolData = { vault_balance: null, insurance_fund: null, total_long_oi: null, total_short_oi: null, open_positions: null };

      try {
        const conn = new Connection(RPC_URL, "confirmed");
        const rpcStart = Date.now();
        const slot = await conn.getSlot();
        solanaData.rpc_latency_ms = Date.now() - rpcStart;
        solanaData.slot = slot;

        // Relayer SOL balance
        const adminKp = loadKeypair(ADMIN_KEYPAIR_PATH);
        const balance = await conn.getBalance(adminKp.publicKey);
        solanaData.relayer_sol_balance = balance / 1e9;

        // Vault balance
        try {
          const vaultAta = getAtaAddress(FEE_VAULT_PUBKEY, USDC_MINT_PUBKEY);
          const vaultInfo = await conn.getTokenAccountBalance(vaultAta);
          if (vaultInfo?.value) protocolData.vault_balance = parseFloat(vaultInfo.value.uiAmountString || "0");
        } catch {}

        // Insurance fund balance
        try {
          const insAta = getAtaAddress(INS_FUND_PUBKEY, USDC_MINT_PUBKEY);
          const insInfo = await conn.getTokenAccountBalance(insAta);
          if (insInfo?.value) protocolData.insurance_fund = parseFloat(insInfo.value.uiAmountString || "0");
        } catch {}

        // Protocol state for OI
        try {
          const stateInfo = await conn.getAccountInfo(PROTOCOL_STATE_PUBKEY);
          if (stateInfo && stateInfo.data.length >= 200) {
            // total_long_oi at offset 8+32+32+8+8+8+8+8+8+1 = varies, read from known offsets
            // These are approximate — adjust if layout changes
          }
        } catch {}

        // Count open positions
        try {
          const marginAccounts = await conn.getProgramAccounts(PROGRAM_ID, {
            filters: [{ dataSize: MARGIN_ACCOUNT_SIZE }],
          });
          accountsMonitored = marginAccounts.length;
          let openPos = 0;
          for (const { account } of marginAccounts) {
            const decoded = decodeMarginAccount(account.data);
            if (decoded) openPos += decoded.positions.length;
          }
          protocolData.open_positions = openPos;
        } catch {}

      } catch (err) {
        log(`WARN  Health endpoint on-chain fetch failed: ${err.message}`);
      }

      res.writeHead(200);
      res.end(JSON.stringify({
        status,
        timestamp: new Date().toISOString(),
        oracle: {
          last_update: lastUpdateTime ? lastUpdateTime.toISOString() : null,
          seconds_since_update: secondsSince,
          current_price: ewma,
          ewma,
          updates_1h: oracleUpdates1h,
          updates_24h: oracleUpdates24h,
          scrape_errors_24h: scrapeErrors24h,
        },
        liquidation: {
          checks_1h: liquidationChecks1h,
          liquidations_24h: liquidations24h,
          accounts_monitored: accountsMonitored,
          last_check: lastLiqCheck ? lastLiqCheck.toISOString() : null,
          errors_1h: consecutiveLiqFails,
        },
        funding: {
          settlements_24h: fundingSettlements24h,
          last_settlement: lastFundingSettlement ? lastFundingSettlement.toISOString() : null,
          errors_24h: fundingErrors24h,
        },
        solana: solanaData,
        protocol: protocolData,
        keeper: {
          uptime_minutes: Math.floor((nowMs - uptimeStart) / 60000),
          total_updates: totalUpdates,
          total_errors: totalErrors,
          errors_24h: errors24h,
        },
      }));
      return;
    }

    if (url.pathname === "/prices") {
      try {
        const from  = url.searchParams.get("from");
        const to    = url.searchParams.get("to");
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 500);

        let rows;
        if (from && to) {
          rows = queryRange.all(parseInt(from, 10), parseInt(to, 10));
        } else {
          rows = queryLastN.all(limit).reverse(); // oldest-first
        }

        res.writeHead(200);
        res.end(JSON.stringify(rows));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === "/trades") {
      try {
        const user = url.searchParams.get("user");
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);

        if (!user) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "user parameter required" }));
          return;
        }

        const trades = queryTradesByUser.all(user, limit);
        const total = queryTradesCountByUser.get(user).total;

        res.writeHead(200);
        res.end(JSON.stringify({ trades, total }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === "/trades/recent") {
      try {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
        const trades = queryTradesRecent.all(limit);

        res.writeHead(200);
        res.end(JSON.stringify({ trades }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === "/events/recent") {
      try {
        const limit = Math.min(parseInt(url.searchParams.get("limit") || "10", 10), 50);
        const events = queryRecentEvents.all(limit);
        res.writeHead(200);
        res.end(JSON.stringify({ events }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (url.pathname === "/stats") {
      try {
        const now = Math.floor(Date.now() / 1000);
        const stats24 = queryStats24h.get(now - 86400);
        const stats7d = queryStats7d.get(now - 7 * 86400);

        res.writeHead(200);
        res.end(JSON.stringify({
          total_volume_24h: stats24.total_volume,
          total_volume_7d: stats7d.total_volume,
          total_trades_24h: stats24.total_trades,
          total_liquidations_24h: stats24.total_liquidations,
          total_fees_24h: stats24.total_fees,
          unique_traders_24h: stats24.unique_traders,
        }));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(API_PORT, () => {
    log(`INFO  API listening on http://localhost:${API_PORT} (/ping, /health, /prices, /trades, /stats)`);
  });
}

// ─── State persistence ────────────────────────────────────────────────────────

function loadState() {
  try {
    const raw = fs.readFileSync(PRICES_FILE, "utf-8");
    const state = JSON.parse(raw);

    if (typeof state.ewma === "number" && isFinite(state.ewma) && state.ewma > 0) {
      ewma = state.ewma;
    }
    if (Array.isArray(state.rawHistory) && state.rawHistory.length > 0) {
      const h = state.rawHistory.filter((v) => typeof v === "number" && isFinite(v) && v > 0);
      if (h.length > 0) {
        rawHistory = h.slice(-RAW_HISTORY_SIZE);
        while (rawHistory.length < RAW_HISTORY_SIZE) rawHistory.unshift(rawHistory[0]);
      }
    }
    const drift = Math.abs(ewma - SEED_PRICE_USD) / SEED_PRICE_USD;
    if (drift > 0.50) {
      log(`WARN  Stored EWMA ${formatUSD(ewma)} drifts ${(drift * 100).toFixed(0)}% from seed ${formatUSD(SEED_PRICE_USD)} — resetting to seed`);
      ewma       = SEED_PRICE_USD;
      rawHistory = Array(RAW_HISTORY_SIZE).fill(SEED_PRICE_USD);
    } else {
      log(`INFO  Restored state from prices.json: ewma=${formatUSD(ewma)} history[${rawHistory.length}]`);
    }
  } catch {
    log(`INFO  prices.json not found or corrupt — using seed values`);
    ewma       = SEED_PRICE_USD;
    rawHistory = Array(RAW_HISTORY_SIZE).fill(SEED_PRICE_USD);
  }
}

function saveState() {
  const state = {
    ewma,
    rawHistory,
    lastUpdated: new Date().toISOString(),
  };
  fs.writeFileSync(PRICES_FILE, JSON.stringify(state, null, 2), "utf-8");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(filepath) {
  const raw = fs.readFileSync(filepath, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function u64ToLeBytes(value) {
  const buf = Buffer.alloc(8);
  let v = BigInt(value);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

function buildUpdateOracleIx(authorityPubkey, price) {
  const data = Buffer.concat([UPDATE_ORACLE_DISCRIMINATOR, u64ToLeBytes(price)]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: authorityPubkey,         isSigner: true,  isWritable: false },
      { pubkey: PROTOCOL_STATE_PUBKEY,   isSigner: false, isWritable: true  },
      { pubkey: ORACLE_PUBKEY,           isSigner: false, isWritable: true  },
    ],
    data,
  });
}

function formatUSD(n) { return `$${n.toFixed(2)}`; }
function now()        { return new Date().toISOString(); }
function log(msg)     { console.log(`[${now()}] ${msg}`); }

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scalePrice(usdPrice) {
  return BigInt(Math.round(usdPrice * 1_000_000));
}

function avg(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ─── Adaptive EWMA ────────────────────────────────────────────────────────────

function applyEwma(rawPrice) {
  const prevEwma     = ewma;
  const deviation    = Math.abs(rawPrice - prevEwma) / prevEwma;
  const deviationPct = (deviation * 100).toFixed(2);
  const sign         = rawPrice >= prevEwma ? "+" : "-";

  let alpha, mode, candidate;

  if (deviation < 0.03) {
    mode      = "direct";
    alpha     = 1;
    candidate = rawPrice;
    log(`INFO  Direct price update deviation=${sign}${deviationPct}% (below 3% threshold)`);
  } else if (deviation < 0.05) {
    mode      = "moderate";
    alpha     = 0.3;
    candidate = alpha * rawPrice + (1 - alpha) * prevEwma;
    log(`INFO  Moderate smoothing deviation=${sign}${deviationPct}% alpha=0.3`);
  } else if (deviation < 0.15) {
    mode      = "heavy";
    alpha     = 0.1;
    candidate = alpha * rawPrice + (1 - alpha) * prevEwma;
    log(`INFO  Heavy smoothing deviation=${sign}${deviationPct}% alpha=0.1`);
  } else {
    mode      = "spike";
    alpha     = 0.01;
    candidate = alpha * rawPrice + (1 - alpha) * prevEwma;
    spikesDetected++;
    log(`WARN  SPIKE DETECTED deviation=${sign}${deviationPct}% alpha=0.01`);
  }

  if (candidate < PRICE_MIN_USD) {
    return {
      newEwma: prevEwma, alpha, mode, deviationPct,
      rejected: true,
      reason: `EWMA candidate ${formatUSD(candidate)} below floor ${formatUSD(PRICE_MIN_USD)}`,
    };
  }

  return { newEwma: candidate, alpha, mode, deviationPct, rejected: false, reason: null };
}

// ─── TCGPlayer scraper ────────────────────────────────────────────────────────

async function scrapeTcgplayer() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page    = await context.newPage();

    log(`INFO  Navigating to TCGPlayer product page…`);
    await page.goto(TCGPLAYER_URL, {
      waitUntil: "domcontentloaded",
      timeout:   20_000,
    });

    await page.waitForTimeout(3_000);

    const result = await page.evaluate(() => {
      function parseUSD(text) {
        if (!text) return null;
        const m = text.match(/\$([\d,]+(?:\.\d{1,2})?)/);
        if (!m) return null;
        const v = parseFloat(m[1].replace(/,/g, ""));
        return isNaN(v) || v <= 0 ? null : v;
      }

      const debug = [];
      let marketPrice    = null;
      let mostRecentSale = null;

      const priceSpans = document.querySelectorAll("span.price-points__upper__price");
      debug.push(`span.price-points__upper__price count: ${priceSpans.length}`);
      if (priceSpans.length >= 1) {
        marketPrice    = parseUSD(priceSpans[0].textContent);
        debug.push(`span[0] (Market Price): ${priceSpans[0].textContent.trim()}`);
      }
      if (priceSpans.length >= 2) {
        mostRecentSale = parseUSD(priceSpans[1].textContent);
        debug.push(`span[1] (Most Recent Sale): ${priceSpans[1].textContent.trim()}`);
      }

      if (!marketPrice) {
        const allEls = document.querySelectorAll("span, div, td, dt, p, h3, h4, label");
        for (const el of allEls) {
          if (el.textContent.trim() === "Market Price") {
            const sib = el.nextElementSibling;
            if (sib) {
              debug.push(`"Market Price" nextSibling: ${sib.textContent.trim()}`);
              marketPrice = parseUSD(sib.textContent);
            }
            if (!marketPrice && el.parentElement) {
              const parentSib = el.parentElement.nextElementSibling;
              if (parentSib) {
                debug.push(`"Market Price" parent nextSibling: ${parentSib.textContent.trim()}`);
                marketPrice = parseUSD(parentSib.textContent);
              }
            }
            if (marketPrice) break;
          }
        }
      }

      if (!mostRecentSale) {
        const spotlight = document.querySelector("span.spotlight__price");
        if (spotlight) mostRecentSale = parseUSD(spotlight.textContent);
      }

      return { marketPrice, mostRecentSale, debug };
    });

    result.debug.forEach((d) => log(`INFO  ${d}`));
    log(`INFO  Most Recent Sale: ${result.mostRecentSale !== null ? formatUSD(result.mostRecentSale) : "not found"}`);

    if (result.marketPrice === null) {
      throw new Error("Market Price not found via any selector strategy");
    }

    log(`INFO  Raw Market Price: ${formatUSD(result.marketPrice)}`);
    return result.marketPrice;

  } finally {
    await browser.close();
  }
}

async function fetchPriceWithRetry() {
  const delays = [10_000, 30_000, 60_000];

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await scrapeTcgplayer();
    } catch (err) {
      if (attempt < delays.length) {
        log(`WARN  Fetch error (attempt ${attempt + 1}/3): ${err.message}. Retrying in ${delays[attempt] / 1000}s…`);
        await sleep(delays[attempt]);
      } else {
        throw err;
      }
    }
  }
}

// ─── Liquidation helpers ──────────────────────────────────────────────────────

function getAtaAddress(owner, mint) {
  return getAssociatedTokenAddressSync(mint, owner, false);
}

const MAX_POSITIONS = 5;
const POSITION_BYTES = 60;
const POSITION_SLOT_BYTES = 1 + POSITION_BYTES;
const MARGIN_ACCOUNT_SIZE = 386; // Exact value from MarginAccount::SPACE in Rust

const EXECUTE_SL_TP_DISCRIMINATOR = (() => {
  const hash = createHash("sha256").update("global:execute_sl_tp").digest();
  return hash.slice(0, 8);
})();

function decodeMarginAccount(data) {
  if (data.length < MARGIN_ACCOUNT_SIZE) return null;

  const owner     = new PublicKey(data.slice(8, 40));
  const collateral = data.readBigUInt64LE(40);

  const positions = [];
  const posStart = 48;

  for (let i = 0; i < MAX_POSITIONS; i++) {
    const offset = posStart + i * POSITION_SLOT_BYTES;
    const tag = data[offset];
    if (tag !== 1) continue;

    const base = offset + 1;
    // Position layout (60 bytes):
    //   direction(1) + collateral(8) + notional(8) + leverage(1) + entry_price(8) +
    //   open_timestamp(8) + last_funding_timestamp(8) + sl_price(Option<u64> = 9) + tp_price(Option<u64> = 9)
    const slTag = data[base + 34];
    const slPrice = slTag === 1 ? data.readBigUInt64LE(base + 35) : null;
    const tpTag = data[base + 43];
    const tpPrice = tpTag === 1 ? data.readBigUInt64LE(base + 44) : null;

    positions.push({
      index: i,
      direction:     data[base] === 0 ? "Long" : "Short",
      collateral:    data.readBigUInt64LE(base + 1),
      notional:      data.readBigUInt64LE(base + 9),
      leverage:      data[base + 17],
      entryPrice:    data.readBigUInt64LE(base + 18),
      openTimestamp: data.readBigInt64LE(base + 26),
      slPrice,
      tpPrice,
    });
  }

  return { owner, collateral, positions };
}

function buildLiquidateIx(liquidatorPubkey, userPubkey, liquidatorAta, positionIndex) {
  const marginPda = (() => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("margin"), userPubkey.toBuffer()],
      PROGRAM_ID
    );
    return pda;
  })();

  const indexBuf = Buffer.from([positionIndex]);
  const data = Buffer.concat([LIQUIDATE_DISCRIMINATOR, userPubkey.toBuffer(), indexBuf]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: liquidatorPubkey,      isSigner: true,  isWritable: true  },
      { pubkey: userPubkey,            isSigner: false, isWritable: false },
      { pubkey: PROTOCOL_STATE_PUBKEY, isSigner: false, isWritable: true  },
      { pubkey: marginPda,             isSigner: false, isWritable: true  },
      { pubkey: ORACLE_PUBKEY,         isSigner: false, isWritable: false },
      { pubkey: FEE_VAULT_PUBKEY,      isSigner: false, isWritable: true  },
      { pubkey: INS_FUND_PUBKEY,       isSigner: false, isWritable: true  },
      { pubkey: liquidatorAta,         isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM,         isSigner: false, isWritable: false },
    ],
    data,
  });
}

function buildExecuteSlTpIx(callerPubkey, callerAta, userPubkey, positionIndex) {
  const marginPda = PublicKey.findProgramAddressSync(
    [Buffer.from("margin"), userPubkey.toBuffer()],
    PROGRAM_ID
  )[0];

  const indexBuf = Buffer.from([positionIndex]);
  const data = Buffer.concat([EXECUTE_SL_TP_DISCRIMINATOR, userPubkey.toBuffer(), indexBuf]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: callerPubkey,          isSigner: true,  isWritable: true  },
      { pubkey: userPubkey,            isSigner: false, isWritable: false },
      { pubkey: PROTOCOL_STATE_PUBKEY, isSigner: false, isWritable: true  },
      { pubkey: marginPda,             isSigner: false, isWritable: true  },
      { pubkey: ORACLE_PUBKEY,         isSigner: false, isWritable: false },
      { pubkey: FEE_VAULT_PUBKEY,      isSigner: false, isWritable: true  },
      { pubkey: INS_FUND_PUBKEY,       isSigner: false, isWritable: true  },
      { pubkey: callerAta,             isSigner: false, isWritable: true  },
      { pubkey: LP_POOL_PUBKEY,        isSigner: false, isWritable: true  },
      { pubkey: LP_VAULT_PUBKEY,       isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM,         isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ─── Liquidation loop ─────────────────────────────────────────────────────────

async function ensureLiquidatorAta(connection, payer, ata) {
  const info = await connection.getAccountInfo(ata);
  if (info && info.data.length > 0) return;

  const createAtaIx = createAssociatedTokenAccountInstruction(
    payer.publicKey, ata, payer.publicKey, USDC_MINT_PUBKEY,
  );

  try {
    const tx = new Transaction().add(createAtaIx);
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer.publicKey;
    tx.sign(payer);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, preflightCommitment: "confirmed" });
    await connection.confirmTransaction(sig, "confirmed");
    log(`INFO  [LIQ] Created liquidator USDC ATA: ${ata.toBase58().slice(0, 8)}… tx=${sig}`);
  } catch (err) {
    log(`WARN  [LIQ] ATA creation failed: ${err.message}`);
  }
}

async function runLiquidationCheck(connection, payer) {
  let accounts;
  try {
    accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ dataSize: MARGIN_ACCOUNT_SIZE }],
    });
  } catch (err) {
    log(`ERROR [LIQ] getProgramAccounts failed: ${err.message}`);
    trackRpcError();
    consecutiveLiqFails++;
    if (consecutiveLiqFails >= 3) {
      sendAlert("CRITICAL", "Liquidation loop failed 3x consecutively", {
        "Consecutive failures": consecutiveLiqFails,
        "Error": err.message,
      });
    }
    return;
  }

  consecutiveLiqFails = 0;
  resetRpcFailStreak();
  liquidationChecks1h++;
  lastLiqCheck = new Date();
  accountsMonitored = accounts.length;

  accounts = accounts.filter(({ account }) => {
    const raw = account.data;
    return raw.length >= 8 && MARGIN_ACCOUNT_DISCRIMINATOR.every((b, i) => raw[i] === b);
  });

  let oraclePrice;
  try {
    const oracleInfo = await connection.getAccountInfo(ORACLE_PUBKEY);
    if (!oracleInfo) throw new Error("Oracle account not found");
    oraclePrice = oracleInfo.data.readBigUInt64LE(8);
  } catch (err) {
    log(`ERROR [LIQ] Failed to fetch oracle price: ${err.message}`);
    return;
  }

  const currentPrice = Number(oraclePrice);
  let underwaterCount = 0;
  let slTpTriggered = 0;
  const liquidatorAta = getAtaAddress(payer.publicKey, USDC_MINT_PUBKEY);

  await ensureLiquidatorAta(connection, payer, liquidatorAta);

  for (const { pubkey, account } of accounts) {
    let decoded;
    try {
      decoded = decodeMarginAccount(account.data);
    } catch {
      continue;
    }

    if (!decoded || decoded.positions.length === 0) continue;

    for (const pos of decoded.positions) {
      const entryPrice = Number(pos.entryPrice);
      const notional   = Number(pos.notional);
      const collateral = Number(pos.collateral);

      if (entryPrice === 0 || notional === 0) continue;

      const pnl = pos.direction === "Long"
        ? ((currentPrice - entryPrice) / entryPrice) * notional
        : ((entryPrice - currentPrice) / entryPrice) * notional;

      const equity      = collateral + pnl;
      const marginRatio = equity / notional;

      // Check SL/TP triggers first (before liquidation)
      let triggerType = null;
      if (pos.slPrice !== null) {
        const sl = Number(pos.slPrice);
        if (pos.direction === "Long" && currentPrice <= sl) triggerType = "SL";
        if (pos.direction === "Short" && currentPrice >= sl) triggerType = "SL";
      }
      if (!triggerType && pos.tpPrice !== null) {
        const tp = Number(pos.tpPrice);
        if (pos.direction === "Long" && currentPrice >= tp) triggerType = "TP";
        if (pos.direction === "Short" && currentPrice <= tp) triggerType = "TP";
      }

      if (triggerType) {
        slTpTriggered++;
        const priceUsd = currentPrice / 1e6;
        const triggerPrice = triggerType === "SL" ? Number(pos.slPrice) / 1e6 : Number(pos.tpPrice) / 1e6;
        log(
          `INFO  [SL/TP] ${triggerType} triggered: user=${decoded.owner.toBase58().slice(0, 8)}… slot=${pos.index} ` +
          `direction=${pos.direction} price=${formatUSD(priceUsd)} trigger=${formatUSD(triggerPrice)}`
        );

        try {
          const ix = buildExecuteSlTpIx(payer.publicKey, liquidatorAta, decoded.owner, pos.index);
          const tx = new Transaction().add(ix);
          const { blockhash } = await connection.getLatestBlockhash("confirmed");
          tx.recentBlockhash = blockhash;
          tx.feePayer        = payer.publicKey;
          tx.sign(payer);

          const sig = await connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          });
          await connection.confirmTransaction(sig, "confirmed");

          log(
            `${triggerType}_CLOSED user=${decoded.owner.toBase58().slice(0, 8)}… slot=${pos.index} ` +
            `direction=${pos.direction} price=${formatUSD(priceUsd)} tx=${sig}`
          );
        } catch (err) {
          log(`ERROR [SL/TP] Execute TX failed for ${decoded.owner.toBase58().slice(0, 8)}… slot=${pos.index}: ${err.message}`);
        }
        continue; // skip liquidation check for this position
      }

      if (marginRatio >= LIQUIDATION_THRESHOLD) continue;

      underwaterCount++;
      const collateralUsd = collateral / 1e6;
      log(
        `WARN  [LIQ] Underwater: user=${decoded.owner.toBase58().slice(0, 8)}… slot=${pos.index} ` +
        `direction=${pos.direction} marginRatio=${(marginRatio * 100).toFixed(2)}% ` +
        `collateral=${formatUSD(collateralUsd)}`
      );

      try {
        const ix = buildLiquidateIx(payer.publicKey, decoded.owner, liquidatorAta, pos.index);
        const tx = new Transaction().add(ix);
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer        = payer.publicKey;
        tx.sign(payer);

        const sig = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });
        await connection.confirmTransaction(sig, "confirmed");

        const rewardUsd = (collateral * 0.01) / 1e6;
        liquidations24h++;
        log(
          `LIQUIDATED user=${decoded.owner.toBase58().slice(0, 8)}… slot=${pos.index} ` +
          `margin_ratio=${(marginRatio * 100).toFixed(2)}% ` +
          `collateral_lost=${formatUSD(collateralUsd)} reward=${formatUSD(rewardUsd)} ` +
          `tx=${sig}`
        );
        sendAlert("WARN", "Position liquidated", {
          "User": decoded.owner.toBase58().slice(0, 8) + "...",
          "Direction": pos.direction,
          "Margin ratio": (marginRatio * 100).toFixed(2) + "%",
          "Collateral lost": formatUSD(collateralUsd),
        });
      } catch (err) {
        log(`ERROR [LIQ] Liquidation TX failed for ${decoded.owner.toBase58().slice(0, 8)}… slot=${pos.index}: ${err.message}`);
      }
    }
  }

  log(
    `INFO  [LIQ] CHECK: ${underwaterCount} liquidations, ${slTpTriggered} SL/TP triggers ` +
    `(${accounts.length} accounts scanned)`
  );
}

// ─── Funding settlement ──────────────────────────────────────────────────────

function buildSettleFundingIx(crankerPubkey, marginAccountPubkey) {
  const data = Buffer.from(SETTLE_FUNDING_DISCRIMINATOR);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: crankerPubkey,           isSigner: true,  isWritable: false },
      { pubkey: PROTOCOL_STATE_PUBKEY,   isSigner: false, isWritable: true  },
      { pubkey: ORACLE_PUBKEY,           isSigner: false, isWritable: false },
      { pubkey: marginAccountPubkey,     isSigner: false, isWritable: true  },
      { pubkey: FEE_VAULT_PUBKEY,        isSigner: false, isWritable: true  },
      { pubkey: INS_FUND_PUBKEY,         isSigner: false, isWritable: true  },
      { pubkey: TOKEN_PROGRAM,           isSigner: false, isWritable: false },
    ],
    data,
  });
}

async function runFundingSettlement(connection, payer) {
  let accounts;
  try {
    accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ dataSize: MARGIN_ACCOUNT_SIZE }],
    });
  } catch (err) {
    log(`ERROR [FUNDING] getProgramAccounts failed: ${err.message}`);
    trackRpcError();
    return;
  }

  accounts = accounts.filter(({ account }) => {
    const raw = account.data;
    return raw.length >= 8 && MARGIN_ACCOUNT_DISCRIMINATOR.every((b, i) => raw[i] === b);
  });

  let settledCount = 0;

  for (const { pubkey, account } of accounts) {
    let decoded;
    try {
      decoded = decodeMarginAccount(account.data);
    } catch {
      continue;
    }

    if (!decoded || decoded.positions.length === 0) continue;

    const nowSec = Math.floor(Date.now() / 1000);
    const hasSettleable = decoded.positions.some((pos) => {
      const lastFundTs = Number(account.data.readBigInt64LE(
        48 + pos.index * POSITION_SLOT_BYTES + 1 + 26
      ));
      return (nowSec - lastFundTs) >= 3600;
    });

    if (!hasSettleable) continue;

    try {
      const ix = buildSettleFundingIx(payer.publicKey, pubkey);
      const tx = new Transaction().add(ix);
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = payer.publicKey;
      tx.sign(payer);

      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(sig, "confirmed");

      settledCount++;
      fundingSettlements24h++;
      lastFundingSettlement = new Date();
      log(
        `INFO  [FUNDING] Settled funding for user=${decoded.owner.toBase58().slice(0, 8)}… ` +
        `positions=${decoded.positions.length} tx=${sig}`
      );
    } catch (err) {
      if (!err.message.includes("custom program error")) {
        fundingErrors24h++;
        log(`ERROR [FUNDING] Settlement TX failed for ${decoded.owner.toBase58().slice(0, 8)}…: ${err.message}`);
        sendAlert("WARN", "Funding settlement failed", {
          "User": decoded.owner.toBase58().slice(0, 8) + "...",
          "Error": err.message.slice(0, 100),
        });
      }
    }
  }

  log(
    `INFO  [FUNDING] FUNDING SETTLEMENT: ${settledCount} accounts settled ` +
    `(${accounts.length} accounts scanned)`
  );
}

// ─── Solana TX with retry + secondary keypair fallback ───────────────────────

let secondaryPayer = null;

function loadSecondaryKeypair() {
  try {
    const resolvedPath = path.resolve(__dirname, SECONDARY_KEYPAIR_PATH);
    secondaryPayer = loadKeypair(resolvedPath);
    log(`INFO  Secondary keypair loaded: ${secondaryPayer.publicKey.toBase58()}`);
  } catch {
    log(`WARN  No secondary keypair at ${SECONDARY_KEYPAIR_PATH} — fallback disabled`);
  }
}

async function submitOracleTx(connection, signer, onChainPrice) {
  const ix = buildUpdateOracleIx(signer.publicKey, onChainPrice);
  const tx = new Transaction().add(ix);
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer        = signer.publicKey;
  tx.sign(signer);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

async function submitUpdateOracle(connection, payer, onChainPrice) {
  const delays = [5_000, 15_000, 45_000];
  let primaryFails = 0;

  // Try primary keypair
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await submitOracleTx(connection, payer, onChainPrice);
    } catch (err) {
      primaryFails++;
      trackRpcError();
      if (attempt < delays.length) {
        log(`ERROR Solana RPC error (attempt ${attempt + 1}/3): ${err.message}. Retrying in ${delays[attempt] / 1000}s…`);
        await sleep(delays[attempt]);
      }
    }
  }

  // Primary failed 3+ times — try secondary
  if (secondaryPayer) {
    log(`WARN  PRIMARY oracle push failed ${primaryFails} times, trying SECONDARY keypair`);
    try {
      return await submitOracleTx(connection, secondaryPayer, onChainPrice);
    } catch (err) {
      log(`ERROR SECONDARY oracle push also failed: ${err.message}`);
    }
  }

  throw new Error(`Oracle push failed after ${primaryFails} primary attempts` +
    (secondaryPayer ? " + secondary fallback" : " (no secondary keypair)"));
}

// ─── Oracle staleness monitor ────────────────────────────────────────────────

function checkOracleStaleness() {
  if (!lastUpdateTime) return;
  const minutesSinceUpdate = (Date.now() - lastUpdateTime.getTime()) / 60000;

  if (minutesSinceUpdate > 30) {
    sendAlert("CRITICAL", "Oracle hasn't updated in 30+ minutes", {
      "Minutes stale": Math.floor(minutesSinceUpdate),
      "Last price": formatUSD(ewma),
      "Action": "Check keeper process immediately",
    });
  } else if (minutesSinceUpdate > 15) {
    sendAlert("CRITICAL", "Oracle hasn't updated in 15+ minutes", {
      "Minutes stale": Math.floor(minutesSinceUpdate),
      "Last price": formatUSD(ewma),
    });
  }
}

// ─── Trade event parsing ──────────────────────────────────────────────────────

function parseEventData(logLine) {
  // Anchor events appear as "Program data: <base64>"
  const match = logLine.match(/^Program data: (.+)$/);
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

function decodePositionOpened(buf) {
  // disc(8) + user(32) + direction(1) + collateral(8) + notional(8) + leverage(1) + entry_price(8) + fee_paid(8) + timestamp(8)
  if (buf.length < 82) return null;
  return {
    user: new PublicKey(buf.slice(8, 40)).toBase58(),
    direction: buf[40] === 0 ? "long" : "short",
    collateral: Number(buf.readBigUInt64LE(41)) / 1e6,
    notional: Number(buf.readBigUInt64LE(49)) / 1e6,
    leverage: buf[57],
    entryPrice: Number(buf.readBigUInt64LE(58)) / 1e6,
    feePaid: Number(buf.readBigUInt64LE(66)) / 1e6,
    timestamp: Number(buf.readBigInt64LE(74)),
  };
}

function decodePositionClosed(buf) {
  // disc(8) + user(32) + direction(1) + entry_price(8) + exit_price(8) + pnl(i64=8) + funding_paid(8) + fee_paid(8) + settlement(8) + reason(1) + timestamp(8)
  if (buf.length < 98) return null;
  const reasonByte = buf[89];
  const reasons = ["manual", "stop_loss", "take_profit", "liquidation"];
  return {
    user: new PublicKey(buf.slice(8, 40)).toBase58(),
    direction: buf[40] === 0 ? "long" : "short",
    entryPrice: Number(buf.readBigUInt64LE(41)) / 1e6,
    exitPrice: Number(buf.readBigUInt64LE(49)) / 1e6,
    pnl: Number(buf.readBigInt64LE(57)) / 1e6,
    fundingPaid: Number(buf.readBigUInt64LE(65)) / 1e6,
    feePaid: Number(buf.readBigUInt64LE(73)) / 1e6,
    settlement: Number(buf.readBigUInt64LE(81)) / 1e6,
    reason: reasons[reasonByte] || "manual",
    timestamp: Number(buf.readBigInt64LE(90)),
  };
}

function decodePositionLiquidated(buf) {
  // disc(8) + user(32) + liquidator(32) + entry_price(8) + exit_price(8) + collateral_lost(8) + timestamp(8)
  if (buf.length < 104) return null;
  return {
    user: new PublicKey(buf.slice(8, 40)).toBase58(),
    liquidator: new PublicKey(buf.slice(40, 72)).toBase58(),
    entryPrice: Number(buf.readBigUInt64LE(72)) / 1e6,
    exitPrice: Number(buf.readBigUInt64LE(80)) / 1e6,
    collateralLost: Number(buf.readBigUInt64LE(88)) / 1e6,
    timestamp: Number(buf.readBigInt64LE(96)),
  };
}

async function parseRecentTrades(connection) {
  try {
    const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, { limit: 50 }, "confirmed");
    if (!sigs || sigs.length === 0) return;

    // Filter to only new transactions
    const newSigs = sigs.filter(s => s.slot > lastParsedSlot);
    if (newSigs.length === 0) return;

    let parsed = 0;

    for (const sigInfo of newSigs) {
      if (sigInfo.err) continue;

      let tx;
      try {
        tx = await connection.getTransaction(sigInfo.signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
      } catch {
        continue;
      }

      if (!tx || !tx.meta || !tx.meta.logMessages) continue;

      for (const logLine of tx.meta.logMessages) {
        const data = parseEventData(logLine);
        if (!data || data.length < 8) continue;

        const disc = data.slice(0, 8);

        if (disc.equals(EVENT_DISC_POSITION_OPENED)) {
          const evt = decodePositionOpened(data);
          if (!evt) {
            log(`WARN  [TRADES] Failed to decode PositionOpened, raw=${data.toString("hex").slice(0, 80)}…`);
            continue;
          }
          insertTrade.run(
            evt.timestamp, evt.user, -1, "open", evt.direction,
            evt.collateral, evt.notional, evt.leverage,
            evt.entryPrice, null, null, null, evt.feePaid,
            sigInfo.signature, null
          );
          insertEvent.run(
            evt.timestamp, "PositionOpened", JSON.stringify(evt), sigInfo.signature
          );
          parsed++;
          log(`INFO  [TRADES] EVENT DECODED: PositionOpened { user: ${evt.user.slice(0, 8)}…, direction: ${evt.direction}, notional: ${evt.notional.toFixed(2)}, entry_price: ${evt.entryPrice.toFixed(2)} }`);
        }

        else if (disc.equals(EVENT_DISC_POSITION_CLOSED)) {
          const evt = decodePositionClosed(data);
          if (!evt) {
            log(`WARN  [TRADES] Failed to decode PositionClosed, raw=${data.toString("hex").slice(0, 80)}…`);
            continue;
          }
          const action = evt.reason === "stop_loss" ? "sl" : evt.reason === "take_profit" ? "tp" : "close";
          insertTrade.run(
            evt.timestamp, evt.user, -1, action, evt.direction,
            0, 0, 0,
            evt.entryPrice, evt.exitPrice, evt.pnl, evt.fundingPaid, evt.feePaid,
            sigInfo.signature, evt.reason
          );
          insertEvent.run(
            evt.timestamp, "PositionClosed", JSON.stringify(evt), sigInfo.signature
          );
          parsed++;
          log(`INFO  [TRADES] EVENT DECODED: PositionClosed { user: ${evt.user.slice(0, 8)}…, reason: ${evt.reason}, pnl: ${evt.pnl.toFixed(2)}, exit_price: ${evt.exitPrice.toFixed(2)} }`);
        }

        else if (disc.equals(EVENT_DISC_POSITION_LIQUIDATED)) {
          const evt = decodePositionLiquidated(data);
          if (!evt) {
            log(`WARN  [TRADES] Failed to decode PositionLiquidated, raw=${data.toString("hex").slice(0, 80)}…`);
            continue;
          }
          insertTrade.run(
            evt.timestamp, evt.user, -1, "liquidate", "long",
            evt.collateralLost, 0, 0,
            evt.entryPrice, evt.exitPrice, -evt.collateralLost, null, 0,
            sigInfo.signature, "liquidation"
          );
          insertEvent.run(
            evt.timestamp, "PositionLiquidated", JSON.stringify(evt), sigInfo.signature
          );
          parsed++;
          log(`INFO  [TRADES] EVENT DECODED: PositionLiquidated { user: ${evt.user.slice(0, 8)}…, lost: ${evt.collateralLost.toFixed(2)} }`);
        }
      }
    }

    // Update last parsed slot
    const maxSlot = Math.max(...newSigs.map(s => s.slot));
    if (maxSlot > lastParsedSlot) lastParsedSlot = maxSlot;

    if (parsed > 0) {
      log(`INFO  [TRADES] Parsed ${parsed} trade events from ${newSigs.length} transactions`);
    }
  } catch (err) {
    log(`ERROR [TRADES] Failed to parse recent trades: ${err.message}`);
  }
}

// ─── Event decoder validation ─────────────────────────────────────────────────

const EVENT_DISC_ORACLE_UPDATED = createHash("sha256").update("event:OracleUpdated").digest().slice(0, 8);

let eventDecoderValidated = false;

async function validateEventDecoder(connection, txSig) {
  if (eventDecoderValidated) return;
  try {
    const tx = await connection.getTransaction(txSig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || !tx.meta || !tx.meta.logMessages) {
      log(`WARN  [EVENTS] Cannot validate decoder — no logs for tx ${txSig.slice(0, 16)}…`);
      return;
    }

    let foundEvents = 0;
    for (const logLine of tx.meta.logMessages) {
      const data = parseEventData(logLine);
      if (!data || data.length < 8) continue;
      const disc = data.slice(0, 8);

      if (disc.equals(EVENT_DISC_ORACLE_UPDATED)) {
        // OracleUpdated: disc(8) + old_price(8) + new_price(8) + timestamp(8)
        if (data.length >= 32) {
          const oldPrice = Number(data.readBigUInt64LE(8)) / 1e6;
          const newPrice = Number(data.readBigUInt64LE(16)) / 1e6;
          const timestamp = Number(data.readBigInt64LE(24));
          log(`INFO  [EVENTS] EVENT DECODED: OracleUpdated { old_price: ${oldPrice.toFixed(2)}, new_price: ${newPrice.toFixed(2)}, timestamp: ${timestamp} }`);
          insertEvent.run(timestamp, "OracleUpdated", JSON.stringify({ oldPrice, newPrice, timestamp }), txSig);
          foundEvents++;
        } else {
          log(`WARN  [EVENTS] OracleUpdated decode failed — raw bytes: ${data.toString("hex")}`);
        }
      } else if (disc.equals(EVENT_DISC_POSITION_OPENED)) {
        const evt = decodePositionOpened(data);
        if (evt) {
          log(`INFO  [EVENTS] EVENT DECODED: PositionOpened { user: ${evt.user.slice(0, 8)}…, entry_price: ${evt.entryPrice.toFixed(2)} }`);
          foundEvents++;
        } else {
          log(`WARN  [EVENTS] PositionOpened decode failed — raw bytes: ${data.toString("hex").slice(0, 80)}…`);
        }
      } else if (disc.equals(EVENT_DISC_POSITION_CLOSED)) {
        const evt = decodePositionClosed(data);
        if (evt) {
          log(`INFO  [EVENTS] EVENT DECODED: PositionClosed { user: ${evt.user.slice(0, 8)}…, reason: ${evt.reason}, pnl: ${evt.pnl.toFixed(2)} }`);
          foundEvents++;
        } else {
          log(`WARN  [EVENTS] PositionClosed decode failed — raw bytes: ${data.toString("hex").slice(0, 80)}…`);
        }
      }
    }

    if (foundEvents > 0) {
      log(`INFO  [EVENTS] Event decoder validated: ${foundEvents} events decoded from tx ${txSig.slice(0, 16)}…`);
    } else {
      log(`INFO  [EVENTS] No trade/oracle events in tx ${txSig.slice(0, 16)}… (normal for oracle-only tx)`);
    }
    eventDecoderValidated = true;
  } catch (err) {
    log(`WARN  [EVENTS] Event decoder validation failed: ${err.message}`);
  }
}

// ─── Main cycle ───────────────────────────────────────────────────────────────

async function runCycle(connection, payer) {
  let rawPrice = null;
  try {
    rawPrice = await fetchPriceWithRetry();
  } catch (err) {
    totalErrors++;
    errors24h++;
    scrapeErrors24h++;
    log(`ERROR TCGPlayer scrape failed: ${err.message}`);
    sendAlert("WARN", "TCGPlayer scrape failed after retries", {
      "Error": err.message.slice(0, 100),
    });
  }

  let ewmaMode = null;
  let ewmaAlpha = 0;
  let ewmaDeviation = 0;

  if (rawPrice === null) {
    log(`WARN  No raw price — skipping EWMA update, re-pushing last ewma=${formatUSD(ewma)}`);
  } else {
    rawHistory.push(rawPrice);
    if (rawHistory.length > RAW_HISTORY_SIZE) rawHistory.shift();

    hourRawMin    = Math.min(hourRawMin, rawPrice);
    hourRawMax    = Math.max(hourRawMax, rawPrice);
    hourRawSum   += rawPrice;
    hourRawCount++;

    const { newEwma, alpha, mode, deviationPct, rejected, reason } = applyEwma(rawPrice);
    ewmaMode = mode;
    ewmaAlpha = alpha;
    ewmaDeviation = parseFloat(deviationPct);

    if (rejected) {
      totalErrors++;
      errors24h++;
      log(`CRITICAL EWMA update rejected: ${reason}. Holding ewma=${formatUSD(ewma)}`);
    } else {
      // Alert on >10% price deviation in single cycle
      if (ewmaDeviation > 10) {
        sendAlert("WARN", "Price deviation > 10% in single cycle", {
          "Raw price": formatUSD(rawPrice),
          "Previous EWMA": formatUSD(ewma),
          "New EWMA": formatUSD(newEwma),
          "Deviation": ewmaDeviation.toFixed(2) + "%",
          "Mode": mode,
        });
      }
      ewma = newEwma;
    }
  }

  const onChainPrice = scalePrice(ewma);

  let sig;
  try {
    sig = await submitUpdateOracle(connection, payer, onChainPrice);
  } catch (err) {
    totalErrors++;
    errors24h++;
    log(`ERROR Solana TX failed after retries: ${err.message}. Skipping cycle.`);
    return;
  }

  saveState();
  if (rawPrice !== null) {
    recordPrice(rawPrice, ewma, ewmaDeviation, ewmaAlpha, sig);
  }

  // Validate event decoder on first successful oracle update
  if (!eventDecoderValidated) {
    await validateEventDecoder(connection, sig);
  }

  // Parse trade events from recent transactions
  await parseRecentTrades(connection);

  totalUpdates++;
  hourUpdates++;
  oracleUpdates1h++;
  oracleUpdates24h++;
  lastUpdateTime = new Date();
  resetRpcFailStreak();

  const rawStr  = rawPrice !== null ? formatUSD(rawPrice) : "n/a";
  const devStr  = rawPrice !== null
    ? `${rawPrice >= ewma ? "+" : ""}${(((rawPrice - ewma) / ewma) * 100).toFixed(2)}%`
    : "n/a";

  log(`raw=${rawStr} ewma=${formatUSD(ewma)} deviation=${devStr} mode=${ewmaMode ?? "n/a"} on_chain=${onChainPrice} tx=${sig}`);
}

// ─── Health summary ───────────────────────────────────────────────────────────

function logHealth() {
  const raw1hAvg = hourRawCount > 0 ? (hourRawSum / hourRawCount).toFixed(2) : "n/a";
  const raw1hLow = hourRawCount > 0 ? formatUSD(hourRawMin) : "n/a";
  const raw1hHigh = hourRawCount > 0 ? formatUSD(hourRawMax) : "n/a";

  console.log(
    `[HEALTH] ewma=${formatUSD(ewma)} raw_1h_low=${raw1hLow} ` +
    `raw_1h_high=${raw1hHigh} raw_1h_avg=$${raw1hAvg} ` +
    `spikes_detected=${spikesDetected} updates=${hourUpdates}`
  );

  // Reset hourly counters
  spikesDetected = 0;
  hourUpdates    = 0;
  hourRawMin     = Infinity;
  hourRawMax     = -Infinity;
  hourRawSum     = 0;
  hourRawCount   = 0;
  oracleUpdates1h = 0;
  liquidationChecks1h = 0;
  rpcErrors1h = [];
}

// ─── Daily digest ─────────────────────────────────────────────────────────

async function sendDailyDigestReport(connection, payer) {
  const nowSec = Math.floor(Date.now() / 1000);

  // Get trade stats from DB
  let stats24;
  try {
    stats24 = queryStats24h.get(nowSec - 86400);
  } catch {
    stats24 = { total_volume: 0, total_trades: 0, total_liquidations: 0, unique_traders: 0 };
  }

  // Get vault balance
  let vaultBalance = 0;
  let relayerSol = 0;
  try {
    const conn = connection || new Connection(RPC_URL, "confirmed");
    const balance = await conn.getBalance(payer.publicKey);
    relayerSol = balance / 1e9;

    const vaultAta = getAtaAddress(FEE_VAULT_PUBKEY, USDC_MINT_PUBKEY);
    const vaultInfo = await conn.getTokenAccountBalance(vaultAta);
    if (vaultInfo?.value) vaultBalance = parseFloat(vaultInfo.value.uiAmountString || "0");
  } catch {}

  await sendDailyDigest({
    oracleUpdates: oracleUpdates24h,
    liquidations: liquidations24h,
    fundingSettlements: fundingSettlements24h,
    uniqueTraders: stats24.unique_traders || 0,
    totalVolume: stats24.total_volume || 0,
    vaultBalance,
    relayerSol,
    errors: errors24h,
    uptimeHours: (Date.now() - uptimeStart) / 3600000,
  });

  // Reset 24h counters
  oracleUpdates24h = 0;
  liquidations24h = 0;
  fundingSettlements24h = 0;
  fundingErrors24h = 0;
  scrapeErrors24h = 0;
  errors24h = 0;

  log("INFO  Daily digest sent to Telegram");
}

// ─── Vault balance monitor ────────────────────────────────────────────────

async function checkVaultBalance(connection) {
  try {
    const vaultAta = getAtaAddress(FEE_VAULT_PUBKEY, USDC_MINT_PUBKEY);
    const vaultInfo = await connection.getTokenAccountBalance(vaultAta);
    if (!vaultInfo?.value) return;

    const balance = parseFloat(vaultInfo.value.uiAmountString || "0");
    if (balance < 10) {
      sendAlert("CRITICAL", "Vault balance critically low", {
        "Balance": formatUSD(balance),
        "Threshold": "$10",
        "Action": "Add USDC to vault immediately",
      });
    } else if (balance < 50) {
      sendAlert("WARN", "Vault balance low", {
        "Balance": formatUSD(balance),
        "Threshold": "$50",
      });
    }
  } catch {}
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  loadState();
  loadSecondaryKeypair();
  startApiServer();

  const payer      = loadKeypair(ADMIN_KEYPAIR_PATH);
  const connection = new Connection(RPC_URL, "confirmed");

  // ── FIX 2: Verify MARGIN_ACCOUNT_SIZE at startup ──
  try {
    const marginAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [{ dataSize: MARGIN_ACCOUNT_SIZE }],
      dataSlice: { offset: 0, length: 8 },
    });
    log(`INFO  MARGIN_ACCOUNT_SIZE verification: found ${marginAccounts.length} accounts at size ${MARGIN_ACCOUNT_SIZE}`);

    if (marginAccounts.length === 0) {
      // Try to find accounts at any size
      const allAccounts = await connection.getProgramAccounts(PROGRAM_ID, {
        dataSlice: { offset: 0, length: 8 },
      });
      const sizes = [...new Set(allAccounts.map(a => a.account.data.length))];
      if (sizes.length > 0) {
        const marginSized = allAccounts.filter(a => {
          return MARGIN_ACCOUNT_DISCRIMINATOR.every((b, i) => a.account.data[i] === b);
        });
        if (marginSized.length > 0) {
          const actualSize = allAccounts.find(a =>
            MARGIN_ACCOUNT_DISCRIMINATOR.every((b, i) => a.account.data[i] === b)
          );
          if (actualSize) {
            const raw = await connection.getAccountInfo(actualSize.pubkey);
            if (raw && raw.data.length !== MARGIN_ACCOUNT_SIZE) {
              log(`CRITICAL MARGIN_ACCOUNT_SIZE mismatch! Expected ${MARGIN_ACCOUNT_SIZE}, found ${raw.data.length}. Exiting.`);
              process.exit(1);
            }
          }
        }
      }
    }
  } catch (err) {
    log(`WARN  Margin account size verification failed: ${err.message} — continuing anyway`);
  }

  log(`PRISMATIC-ETB-PERP keeper starting (adaptive EWMA)`);
  log(`  Product:     Prismatic Evolutions Elite Trainer Box`);
  log(`  Source:      TCGPlayer (product 593355)`);
  log(`  Smoothing:   Adaptive EWMA (alpha=0.05 normal, 0.01 on >5% spike)`);
  log(`  History:     last ${RAW_HISTORY_SIZE} raw prices (~1 hour)`);
  log(`  Program:     ${PROGRAM_ID.toBase58()}`);
  log(`  Oracle:      ${ORACLE_PUBKEY.toBase58()}`);
  log(`  Admin:       ${payer.publicKey.toBase58()}`);
  log(`  Secondary:   ${secondaryPayer ? secondaryPayer.publicKey.toBase58() : "none"}`);
  log(`  RPC:         ${RPC_URL}`);
  log(`  Price interval:  ${UPDATE_INTERVAL_MS / 1000}s`);
  log(`  Liq interval:    ${LIQUIDATION_INTERVAL_MS / 1000}s`);
  log(`  Liq threshold:   margin_ratio < ${LIQUIDATION_THRESHOLD * 100}%`);
  log(`  Funding interval: ${FUNDING_INTERVAL_MS / 1000}s`);
  log(`  Floor:           ${formatUSD(PRICE_MIN_USD)} (no upper cap)`);
  log(`  Initial EWMA:    ${formatUSD(ewma)}`);
  log(`  Telegram alerts: ${TELEGRAM_BOT_TOKEN ? "enabled" : "disabled"}`);

  await runCycle(connection, payer);

  // Price oracle loop
  setInterval(async () => {
    try {
      await runCycle(connection, payer);
    } catch (err) {
      totalErrors++;
      log(`ERROR Unexpected error in cycle: ${err.message}`);
    }
  }, UPDATE_INTERVAL_MS);

  // Liquidation loop
  await runLiquidationCheck(connection, payer);
  setInterval(async () => {
    try {
      await runLiquidationCheck(connection, payer);
    } catch (err) {
      log(`ERROR [LIQ] Unexpected error in liquidation check: ${err.message}`);
    }
  }, LIQUIDATION_INTERVAL_MS);

  // Funding settlement loop
  await runFundingSettlement(connection, payer);
  setInterval(async () => {
    try {
      await runFundingSettlement(connection, payer);
    } catch (err) {
      log(`ERROR [FUNDING] Unexpected error in funding settlement: ${err.message}`);
    }
  }, FUNDING_INTERVAL_MS);

  // Health + staleness monitor every hour
  setInterval(() => {
    logHealth();
    checkOracleStaleness();
    checkVaultBalance(connection);
  }, 60 * 60 * 1_000);

  // Check staleness every 5 minutes
  setInterval(checkOracleStaleness, 5 * 60 * 1_000);

  // Daily digest at midnight UTC
  function scheduleDailyDigest() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0); // next midnight UTC
    const msUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
      sendDailyDigestReport(connection, payer);
      // Then repeat every 24h
      setInterval(() => sendDailyDigestReport(connection, payer), 24 * 60 * 60 * 1000);
    }, msUntilMidnight);

    log(`INFO  Daily digest scheduled in ${Math.floor(msUntilMidnight / 60000)} minutes (midnight UTC)`);
  }
  scheduleDailyDigest();

  // Startup alert
  sendAlert("INFO", "Keeper started", {
    "EWMA": formatUSD(ewma),
    "RPC": RPC_URL,
    "Admin": payer.publicKey.toBase58().slice(0, 8) + "...",
  });
}

// ─── Unhandled exception / rejection handlers ──────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("FATAL uncaughtException:", err);
  sendAlert("CRITICAL", "Unhandled exception in keeper", {
    "Error": err.message,
    "Stack": (err.stack || "").split("\n").slice(0, 3).join(" | "),
  });
  // Give telegram time to send, then exit
  setTimeout(() => process.exit(1), 3000);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  console.error("FATAL unhandledRejection:", reason);
  sendAlert("CRITICAL", "Unhandled promise rejection in keeper", {
    "Reason": msg.slice(0, 200),
  });
});

main().catch((err) => {
  console.error("FATAL:", err);
  sendAlert("CRITICAL", "Keeper crashed on startup", { "Error": err.message });
  setTimeout(() => process.exit(1), 3000);
});
