#!/usr/bin/env node
/**
 * PL500 Index Scraper
 * Fetches market prices for all 500 cards from TCGPlayer and calculates the index value.
 * Designed to be imported by the keeper or run standalone.
 *
 * Usage:
 *   node pl500-scraper.js           # Standalone: prints index value
 *   const { fetchPL500 } = require('./pl500-scraper')  # Module: returns { price, cardsFetched, errors }
 */

const fs = require("fs");
const path = require("path");

// Load card data
const CARDS_PATH = path.join(__dirname, "pl500-cards.json");
let CARDS = [];
try {
  CARDS = JSON.parse(fs.readFileSync(CARDS_PATH, "utf-8"));
} catch (e) {
  console.error("Failed to load pl500-cards.json:", e.message);
}

const CONCURRENCY = 10;     // parallel requests
const DELAY_MS = 100;       // delay between batches
const TIMEOUT_MS = 8000;    // per-request timeout
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
    // Return the Normal printing marketPrice, or Foil if Normal is null
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

async function fetchPL500() {
  const resolved = CARDS.filter(c => c.productId !== null);
  const failed = CARDS.filter(c => c.productId === null);

  let total = 0;
  let fetched = 0;
  let errors = 0;
  let fallbackUsed = 0;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < resolved.length; i += CONCURRENCY) {
    const batch = resolved.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(c => fetchPrice(c.productId)));

    for (let j = 0; j < batch.length; j++) {
      const price = results[j];
      if (price !== null && price > 0) {
        total += price;
        fetched++;
      } else {
        // Use snapshot price as fallback
        total += batch[j].snapshotPrice;
        fallbackUsed++;
        errors++;
      }
    }

    if (i + CONCURRENCY < resolved.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // Add fallback for completely unresolved cards
  total += FALLBACK_VALUE;
  fallbackUsed += failed.length;

  return {
    price: Math.round(total * 100) / 100, // round to 2 decimals
    cardsFetched: fetched,
    cardsTotal: CARDS.length,
    fallbackUsed,
    errors,
    timestamp: Date.now(),
  };
}

// Standalone mode
if (require.main === module) {
  const start = Date.now();
  fetchPL500().then(result => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`PL500 Index: $${result.price.toLocaleString()}`);
    console.log(`Cards fetched: ${result.cardsFetched}/${result.cardsTotal}`);
    console.log(`Fallback used: ${result.fallbackUsed}`);
    console.log(`Errors: ${result.errors}`);
    console.log(`Time: ${elapsed}s`);
  }).catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}

module.exports = { fetchPL500 };
