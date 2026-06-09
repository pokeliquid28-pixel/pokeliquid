/**
 * PL500 Keeper Module
 *
 * This file is uploaded to /root/keeper/pl500.js on the Hetzner server.
 * It exports fetchPL500Price() which the keeper calls instead of scraping TCGPlayer.
 *
 * Usage in keeper.js:
 *   const { fetchPL500Price } = require('./pl500');
 *   // In scrapeAllMarkets, skip PL500 from Playwright scrape
 *   // Instead call fetchPL500Price() separately
 */

const fs = require("fs");
const path = require("path");

// Product IDs for 492 resolved cards (loaded from pl500-product-ids.json)
const IDS_PATH = path.join(__dirname, "pl500-product-ids.json");
let PRODUCT_IDS = [];
try {
  PRODUCT_IDS = JSON.parse(fs.readFileSync(IDS_PATH, "utf-8"));
} catch (e) {
  console.error("[PL500] Failed to load product IDs:", e.message);
}

const CONCURRENCY = 10;
const DELAY_MS = 100;
const TIMEOUT_MS = 8000;
const FALLBACK_VALUE = 110.51; // sum of 8 unresolved cards' snapshot prices

async function fetchPrice(productId) {
  const url = `https://mpapi.tcgplayer.com/v2/product/${productId}/pricepoints`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (PL500 Index Scraper)" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data)) {
      const normal = data.find(p => p.printingType === "Normal");
      const foil = data.find(p => p.printingType === "Foil");
      return normal?.marketPrice ?? foil?.marketPrice ?? null;
    }
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// Cache: avoid re-fetching within 30s
let cachedPrice = null;
let cacheTime = 0;
const CACHE_TTL = 30_000;

async function fetchPL500Price() {
  if (cachedPrice !== null && Date.now() - cacheTime < CACHE_TTL) {
    return cachedPrice;
  }

  if (PRODUCT_IDS.length === 0) {
    console.error("[PL500] No product IDs loaded");
    return null;
  }

  let total = 0;
  let fetched = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < PRODUCT_IDS.length; i += CONCURRENCY) {
    const batch = PRODUCT_IDS.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(item => fetchPrice(item.productId)));

    for (let j = 0; j < batch.length; j++) {
      const price = results[j];
      if (price !== null && price > 0) {
        total += price;
        fetched++;
      } else {
        // Use snapshot as fallback
        total += batch[j].snapshotPrice || 0;
        errors++;
      }
    }

    if (i + CONCURRENCY < PRODUCT_IDS.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // Add fallback for 8 unresolved cards
  total += FALLBACK_VALUE;

  const price = Math.round(total * 100) / 100;
  console.log(`[PL500] Index: $${price.toLocaleString()} (${fetched}/${PRODUCT_IDS.length} live, ${errors} fallback)`);

  cachedPrice = price;
  cacheTime = Date.now();

  return price;
}

module.exports = { fetchPL500Price };
