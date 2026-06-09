#!/usr/bin/env node
// Fix the 13 failed/fuzzy cards with manual searches
const fs = require("fs");

const cards = JSON.parse(fs.readFileSync(__dirname + "/pl500-cards.json", "utf-8"));

// Manual fixes: search with very specific queries
const fixes = [
  { rank: 50, query: "Pikachu 60/64 Jungle", expectedPrice: 28.58 },
  { rank: 52, query: "Charizard 4/102 Celebrations Classic Collection", expectedPrice: 208.82 },
  { rank: 61, query: "Pikachu 005/025 Celebrations", expectedPrice: 8.50 },
  { rank: 87, query: "Birthday Pikachu 24 Celebrations Classic", expectedPrice: 46.44 },
  { rank: 106, query: "Eevee 51/64 Jungle", expectedPrice: 17.04 },
  { rank: 179, query: "Kabuto 50/62 Fossil", expectedPrice: 19.06 },
  { rank: 199, query: "Entei 34 WOTC Promo", expectedPrice: 33.39 },
  { rank: 247, query: "Mew 011/025 Celebrations", expectedPrice: 4.17 },
  { rank: 303, query: "Cubone 50/64 Jungle", expectedPrice: 12.38 },
  { rank: 314, query: "Umbreon ex SVP 176 Scarlet Violet Promo", expectedPrice: 44.60 },
  { rank: 328, query: "Psyduck 53/62 Fossil", expectedPrice: 10.83 },
  { rank: 380, query: "Jigglypuff 54/64 Jungle", expectedPrice: 9.95 },
  { rank: 400, query: "Eevee 11 WOTC Promo", expectedPrice: 50.15 },
];

async function searchCard(query) {
  const url = `https://mp-search-api.tcgplayer.com/v1/search/request?q=${encodeURIComponent(query)}&isList=false&mpfev=2952`;
  const body = {
    algorithm: "", from: 0, size: 5,
    filters: { term: { productLineName: ["pokemon"] }, range: {}, match: {} },
    listingSearch: { filters: { term: {}, range: {}, exclude: { channelExclusion: 0 } } },
    context: { cart: {}, shippingCountry: "US", userProfile: {} },
    settings: { useFuzzySearch: true, didYouMean: {} },
    sort: {},
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data?.results?.[0]?.results || [];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  let fixed = 0;
  for (const fix of fixes) {
    const results = await searchCard(fix.query);
    // Find best match by price
    let best = null;
    let bestDiff = Infinity;
    for (const r of results) {
      const diff = Math.abs((r.marketPrice || 0) - fix.expectedPrice);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = r;
      }
    }

    if (best) {
      const idx = cards.findIndex(c => c.rank === fix.rank);
      if (idx >= 0) {
        cards[idx].productId = best.productId;
        cards[idx].cardName = best.productName;
        cards[idx].setName = best.setName;
        cards[idx].number = best.customAttributes?.number;
        cards[idx].livePrice = best.marketPrice;
        cards[idx].matchType = bestDiff < fix.expectedPrice * 0.3 ? "manual_fix" : "manual_fuzzy";
        console.log(`Fixed #${fix.rank}: ID=${best.productId} ${best.productName} (${best.setName}) $${best.marketPrice} (diff=$${bestDiff.toFixed(2)})`);
        fixed++;
      }
    } else {
      console.log(`FAILED #${fix.rank}: no results for "${fix.query}"`);
    }
    await sleep(250);
  }

  fs.writeFileSync(__dirname + "/pl500-cards.json", JSON.stringify(cards, null, 2));
  console.log(`\nFixed ${fixed}/${fixes.length} cards`);

  // Final stats
  const resolved = cards.filter(c => c.productId !== null);
  const failed = cards.filter(c => c.productId === null);
  console.log(`Total resolved: ${resolved.length}/500`);
  if (failed.length > 0) {
    console.log("Still failed:");
    failed.forEach(c => console.log(`  #${c.rank} ${c.cardName} $${c.snapshotPrice}`));
  }
}

main().catch(console.error);
