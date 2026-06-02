"use strict";

const https = require("https");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID || "";

const EMOJI = { INFO: "\u2139\ufe0f", WARN: "\u26a0\ufe0f", CRITICAL: "\ud83d\udea8" };

// Per-level rate limits (ms)
const RATE_LIMITS = {
  CRITICAL: 60 * 1000,         // 1 min (urgent)
  WARN:     5 * 60 * 1000,     // 5 min
  INFO:     0,                 // no limit (used for daily digest only)
};

const lastSent = { CRITICAL: 0, WARN: 0, INFO: 0 };

/**
 * Send a Telegram alert.
 * @param {"INFO"|"WARN"|"CRITICAL"} level
 * @param {string} message  - main alert text
 * @param {Record<string, string|number>} data - optional key-value pairs
 * @returns {Promise<boolean>} true if sent
 */
async function sendAlert(level, message, data = {}) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;

  const now = Date.now();
  const limit = RATE_LIMITS[level] || 0;
  if (limit > 0 && now - lastSent[level] < limit) return false;

  const emoji = EMOJI[level] || "";
  const dataLines = Object.entries(data)
    .map(([k, v]) => `<b>${k}:</b> ${v}`)
    .join("\n");

  const text = [
    `${emoji} <b>Pokeliquid ${level}</b>`,
    "",
    message,
    dataLines ? `\n${dataLines}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return new Promise((resolve) => {
    const body = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });

    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        lastSent[level] = Date.now();
        if (res.statusCode !== 200) {
          console.log(`[${new Date().toISOString()}] WARN  Telegram ${level} alert failed: HTTP ${res.statusCode}`);
          resolve(false);
        } else {
          resolve(true);
        }
        res.resume();
      }
    );
    req.on("error", (err) => {
      console.log(`[${new Date().toISOString()}] WARN  Telegram error: ${err.message}`);
      resolve(false);
    });
    req.write(body);
    req.end();
  });
}

/**
 * Send the daily digest (bypasses rate limits).
 */
async function sendDailyDigest(stats) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;

  const text = [
    `\ud83d\udcca <b>Pokeliquid Daily Digest</b>`,
    `<i>${new Date().toISOString().slice(0, 10)}</i>`,
    "",
    `Oracle updates: <b>${stats.oracleUpdates}</b> (expected ~288)`,
    `Liquidations: <b>${stats.liquidations}</b>`,
    `Funding settlements: <b>${stats.fundingSettlements}</b>`,
    `Unique traders: <b>${stats.uniqueTraders}</b>`,
    `Total volume: <b>$${stats.totalVolume.toFixed(2)}</b>`,
    `Vault balance: <b>$${stats.vaultBalance.toFixed(2)}</b>`,
    `Relayer SOL: <b>${stats.relayerSol.toFixed(4)} SOL</b>`,
    `Errors: <b>${stats.errors}</b>`,
    `Uptime: <b>${stats.uptimeHours.toFixed(1)}h</b>`,
  ].join("\n");

  return new Promise((resolve) => {
    const body = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });

    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      }
    );
    req.on("error", () => resolve(false));
    req.write(body);
    req.end();
  });
}

module.exports = { sendAlert, sendDailyDigest };
