#!/usr/bin/env node
// Resolve TCGPlayer product IDs for all 500 PL500 cards
// Uses the search API with card number + set name for precise matching

const fs = require("fs");

// Load the parsed cards from inline data (same as pl500-parse.js)
const raw = fs.readFileSync(__dirname + "/pl500-raw.txt", "utf-8");

function parseCards(text) {
  const cards = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const priceMatch = line.match(/Market Price:\$([0-9,]+\.\d+)/);
    if (!priceMatch) continue;
    const price = parseFloat(priceMatch[1].replace(/,/g, ""));

    const rankMatch = line.match(/^(\d+)\.\s*/);
    const rank = rankMatch ? parseInt(rankMatch[1]) : cards.length + 1;

    // Extract set name (everything between "N. " and the rarity keyword)
    const rarities = [
      "Special Illustration Rare", "Illustration Rare", "Mega Hyper Rare",
      "Mega Attack Rare", "Black White Rare", "Ultra Rare", "Holo Rare",
      "Double Rare", "Hyper Rare", "Secret Rare", "Radiant Rare",
      "Amazing Rare", "Shiny Holo Rare", "ACE SPEC Rare", "Classic Collection",
      "Common", "Uncommon", "Rare", "Promo"
    ];
    let setName = "";
    let rarity = "";
    const afterRank = line.replace(/^\d+\.\s*/, "");
    for (const r of rarities) {
      const idx = afterRank.indexOf(r);
      if (idx > 0) {
        setName = afterRank.substring(0, idx).trim();
        rarity = r;
        break;
      }
    }

    // Extract card number - between # and the card name
    const numMatch = line.match(/#([A-Za-z0-9/\-_]+?)([A-Z][a-z])/);
    const number = numMatch ? numMatch[1] : "";

    // Extract card name - after the number, before listing info
    const afterNum = line.substring(line.indexOf("#") + 1 + number.length);
    const nameEnd = afterNum.search(/\d+ listing|Out of Stock|Market Price/);
    const cardName = nameEnd > 0 ? afterNum.substring(0, nameEnd).trim() : "";

    cards.push({ rank, setName, rarity, number, cardName, price });
  }
  return cards;
}

async function searchCard(card) {
  // Build search query from card name and set
  let query = card.cardName;
  if (card.number) query += ` ${card.number}`;
  if (card.setName) query += ` ${card.setName}`;

  const url = `https://mp-search-api.tcgplayer.com/v1/search/request?q=${encodeURIComponent(query)}&isList=false&mpfev=2952`;
  const body = {
    algorithm: "",
    from: 0,
    size: 5,
    filters: {
      term: { productLineName: ["pokemon"] },
      range: {},
      match: {},
    },
    listingSearch: {
      filters: { term: {}, range: {}, exclude: { channelExclusion: 0 } },
    },
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
  const results = data?.results?.[0]?.results || [];

  // Try to match by card number
  if (card.number) {
    const numNorm = card.number.replace(/^0+/, "");
    for (const r of results) {
      const rNum = (r.customAttributes?.number || "").replace(/^0+/, "");
      if (rNum === numNorm) {
        return {
          productId: r.productId,
          productName: r.productName,
          setName: r.setName,
          number: r.customAttributes?.number,
          marketPrice: r.marketPrice,
          matchType: "number",
        };
      }
    }
  }

  // Fallback: closest price match
  if (results.length > 0) {
    let best = results[0];
    let bestDiff = Math.abs((results[0].marketPrice || 0) - card.price);
    for (const r of results) {
      const diff = Math.abs((r.marketPrice || 0) - card.price);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = r;
      }
    }
    return {
      productId: best.productId,
      productName: best.productName,
      setName: best.setName,
      number: best.customAttributes?.number,
      marketPrice: best.marketPrice,
      matchType: bestDiff < card.price * 0.1 ? "price" : "fuzzy",
    };
  }

  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const cards = parseCards(raw);
  console.log(`Loaded ${cards.length} cards`);

  const resolved = [];
  let matched = 0;
  let fuzzy = 0;
  let failed = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    process.stdout.write(`\r[${i + 1}/${cards.length}] Resolving ${card.cardName.substring(0, 30).padEnd(30)}...`);

    try {
      const result = await searchCard(card);
      if (result) {
        resolved.push({
          rank: card.rank,
          productId: result.productId,
          cardName: result.productName,
          setName: result.setName,
          number: result.number,
          snapshotPrice: card.price,
          livePrice: result.marketPrice,
          matchType: result.matchType,
        });
        if (result.matchType === "number" || result.matchType === "price") matched++;
        else fuzzy++;
      } else {
        resolved.push({
          rank: card.rank,
          productId: null,
          cardName: card.cardName,
          setName: card.setName,
          number: card.number,
          snapshotPrice: card.price,
          livePrice: null,
          matchType: "failed",
        });
        failed++;
      }
    } catch (err) {
      console.error(`\nError on card ${i + 1}: ${err.message}`);
      resolved.push({
        rank: card.rank,
        productId: null,
        cardName: card.cardName,
        setName: card.setName,
        number: card.number,
        snapshotPrice: card.price,
        livePrice: null,
        matchType: "error",
      });
      failed++;
    }

    // Rate limit: ~5 req/sec
    await sleep(200);
  }

  console.log(`\n\nResults: ${matched} exact, ${fuzzy} fuzzy, ${failed} failed`);

  // Save results
  const outPath = __dirname + "/pl500-cards.json";
  fs.writeFileSync(outPath, JSON.stringify(resolved, null, 2));
  console.log(`Saved to ${outPath}`);

  // Show fuzzy/failed matches for manual review
  const issues = resolved.filter(r => r.matchType === "fuzzy" || r.matchType === "failed" || r.matchType === "error");
  if (issues.length > 0) {
    console.log(`\n--- ${issues.length} cards need review ---`);
    for (const r of issues) {
      console.log(`  #${r.rank} ${r.cardName} | snap=$${r.snapshotPrice} live=$${r.livePrice} | ${r.matchType}`);
    }
  }
}

main().catch(console.error);
