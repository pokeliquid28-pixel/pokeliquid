/**
 * SV151 Keeper Module
 *
 * This file is uploaded to /root/keeper/sv151.js on the Hetzner server.
 * It exports fetchSV151Price() which the keeper calls for the SV 151 index.
 *
 * Usage in keeper.js:
 *   const { fetchSV151Price } = require('./sv151');
 *   // Call fetchSV151Price() to get the summed index value
 *
 * Scrapes the TCGPlayer SV 151 price guide page using Playwright,
 * sums all card prices to produce the index value.
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const PRICE_GUIDE_URL =
  "https://www.tcgplayer.com/categories/trading-and-collectible-card-games/pokemon/price-guides/sv-scarlet-and-violet-151";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Fallback snapshot data
const SNAPSHOT_PATH = path.join(__dirname, "sv151-cards.json");
let SNAPSHOT_CARDS = [];
try {
  SNAPSHOT_CARDS = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf-8"));
} catch (e) {
  console.log("[SV151] No snapshot file found, will rely on live scrape only");
}

// Cache: avoid re-scraping within 30s
let cachedPrice = null;
let cacheTime = 0;
const CACHE_TTL = 30_000;

async function scrapePriceGuide() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();

    console.log("[SV151] Navigating to TCGPlayer price guide...");
    await page.goto(PRICE_GUIDE_URL, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    // Wait for the price guide table to render
    try {
      await page.waitForSelector("table", { timeout: 15_000 });
    } catch {
      await page.waitForTimeout(5_000);
    }

    // Scroll to load all rows (the table may lazy-load)
    let previousHeight = 0;
    for (let i = 0; i < 20; i++) {
      const currentHeight = await page.evaluate(() => document.body.scrollHeight);
      if (currentHeight === previousHeight) break;
      previousHeight = currentHeight;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
    }

    // Extra pause for any final rendering
    await page.waitForTimeout(1_000);

    // Extract card names and prices from table rows
    const cards = await page.evaluate(() => {
      function parseUSD(text) {
        if (!text) return null;
        const m = text.match(/\$([\d,]+(?:\.\d{1,2})?)/);
        if (!m) return null;
        const v = parseFloat(m[1].replace(/,/g, ""));
        return isNaN(v) || v <= 0 ? null : v;
      }

      const rows = document.querySelectorAll("table tbody tr");
      const results = [];

      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        if (cells.length < 2) continue;

        // Card name is typically in the first cell
        const name = cells[0]?.textContent?.trim() || "";

        // Look for a price in any cell (usually the "Market Price" column)
        let price = null;
        for (const cell of cells) {
          const p = parseUSD(cell.textContent);
          if (p !== null) {
            price = p;
            break; // Take the first price found (market price column)
          }
        }

        if (name) {
          results.push({ name, price });
        }
      }

      return results;
    });

    await page.close();
    return cards;
  } finally {
    await browser.close();
  }
}

async function fetchSV151Price() {
  if (cachedPrice !== null && Date.now() - cacheTime < CACHE_TTL) {
    return cachedPrice;
  }

  let liveCards = [];
  try {
    liveCards = await scrapePriceGuide();
  } catch (e) {
    console.error("[SV151] Scrape failed:", e.message);
  }

  // Build a lookup from live cards by name
  const liveLookup = {};
  for (const card of liveCards) {
    if (card.name && card.price !== null) {
      liveLookup[card.name] = card.price;
    }
  }

  const liveCount = Object.keys(liveLookup).length;

  // If we got live data, sum it up (with snapshot fallback for missing cards)
  let total = 0;
  let usedLive = 0;
  let usedSnapshot = 0;
  let totalCards = 0;

  if (liveCards.length > 0 && liveCount > 0) {
    // Use live scraped data directly — sum all prices
    totalCards = liveCards.length;
    for (const card of liveCards) {
      if (card.price !== null) {
        total += card.price;
        usedLive++;
      }
    }
  } else if (SNAPSHOT_CARDS.length > 0) {
    // Fallback to snapshot
    totalCards = SNAPSHOT_CARDS.length;
    for (const snap of SNAPSHOT_CARDS) {
      const p = snap.snapshotPrice ?? snap.livePrice ?? 0;
      if (p > 0) {
        total += p;
        usedSnapshot++;
      }
    }
  } else if (liveCards.length > 0) {
    // No snapshot, use live data only
    totalCards = liveCards.length;
    for (const card of liveCards) {
      if (card.price !== null) {
        total += card.price;
        usedLive++;
      }
    }
  } else {
    console.error("[SV151] No live data and no snapshot available");
    return null;
  }

  const price = Math.round(total * 100) / 100;
  console.log(
    `[SV151] Index: $${price.toLocaleString()} (${usedLive}/${totalCards} cards live)`
  );

  cachedPrice = price;
  cacheTime = Date.now();

  return price;
}

module.exports = { fetchSV151Price };
