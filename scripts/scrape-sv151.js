#!/usr/bin/env node
/**
 * Scrape all Scarlet & Violet 151 card prices from TCGPlayer price guide.
 * Uses Playwright (same as keeper) to render the JS-heavy page.
 *
 * Usage: node scripts/scrape-sv151.js
 * Output: scripts/sv151-cards.json
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = "https://www.tcgplayer.com/categories/trading-and-collectible-card-games/pokemon/price-guides/sv-scarlet-and-violet-151";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const OUTPUT = path.join(__dirname, "sv151-cards.json");

async function main() {
  console.log("Launching browser...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();

    console.log("Navigating to TCGPlayer price guide...");
    await page.goto(URL, { waitUntil: "networkidle", timeout: 60_000 });

    // Wait for the price table to render
    try {
      await page.waitForSelector("table", { timeout: 20_000 });
    } catch {
      await page.waitForTimeout(10_000);
    }

    // Try to load all cards by scrolling or clicking "show more" if present
    let lastCount = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      const showMore = await page.$('button:has-text("Show More"), a:has-text("Show More"), button:has-text("Load More")');
      if (showMore) {
        try {
          await showMore.click();
          await page.waitForTimeout(2000);
        } catch { break; }
      } else {
        // Scroll to bottom to trigger lazy loading
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(2000);
      }
      const currentCount = await page.evaluate(() => document.querySelectorAll("tr").length);
      if (currentCount === lastCount) break;
      lastCount = currentCount;
      console.log(`  Loaded ${currentCount} rows...`);
    }

    // Extract card data from the price guide table
    const cards = await page.evaluate(() => {
      const rows = document.querySelectorAll("table tbody tr");
      const results = [];

      for (const row of rows) {
        const cells = row.querySelectorAll("td");
        if (cells.length < 2) continue;

        // Try to get card name from link or first cell
        const link = row.querySelector("a");
        const name = link?.textContent?.trim() || cells[0]?.textContent?.trim() || "";
        if (!name) continue;

        // Get the href for product ID extraction
        const href = link?.href || "";
        let productId = null;
        const pidMatch = href.match(/\/product\/(\d+)/);
        if (pidMatch) productId = parseInt(pidMatch[1]);

        // Parse prices from cells - look for dollar amounts
        function parseUSD(text) {
          if (!text) return null;
          const m = text.match(/\$([\d,]+(?:\.\d{1,2})?)/);
          if (!m) return null;
          const v = parseFloat(m[1].replace(/,/g, ""));
          return isNaN(v) || v <= 0 ? null : v;
        }

        let marketPrice = null;
        for (const cell of cells) {
          const p = parseUSD(cell.textContent);
          if (p !== null) {
            marketPrice = p; // Take the first price found (usually market price)
            break;
          }
        }

        // Extract set number from name if possible
        let number = null;
        const numMatch = name.match(/(\d+\/\d+)/);
        if (numMatch) number = numMatch[1];

        results.push({ name, productId, number, marketPrice, href });
      }

      return results;
    });

    console.log(`\nScraped ${cards.length} cards`);

    // Also try alternative selectors if table didn't work
    if (cards.length === 0) {
      console.log("Table selector returned 0 cards, trying alternative selectors...");
      const html = await page.content();
      fs.writeFileSync("/tmp/sv151-debug.html", html);
      console.log("Page HTML saved to /tmp/sv151-debug.html for debugging");

      // Try price guide specific selectors
      const altCards = await page.evaluate(() => {
        const results = [];
        // Try product list items
        const items = document.querySelectorAll('[class*="product"], [class*="price-guide"], [class*="row"]');
        for (const item of items) {
          const text = item.textContent?.trim() || "";
          if (text.length > 5 && text.includes("$")) {
            results.push({ raw: text.slice(0, 200) });
          }
        }
        return results.slice(0, 10); // First 10 for debugging
      });
      console.log("Alt selector samples:", JSON.stringify(altCards, null, 2));
    }

    // Build output — extract card name from URL slug if page name is broken
    const output = cards.filter(c => c.marketPrice !== null).map((c, i) => {
      let cardName = c.name;
      // If name looks like "Select table row N", parse from URL instead
      if (cardName.startsWith("Select table row") && c.href) {
        const slugMatch = c.href.match(/pokemon-sv-scarlet-and-violet-151-(.+?)(?:\?|$)/);
        if (slugMatch) {
          cardName = slugMatch[1]
            .replace(/---/g, " - ")
            .replace(/-/g, " ")
            .replace(/\b\w/g, l => l.toUpperCase());
        }
      }
      // Extract set number from name or URL
      let number = c.number;
      if (!number) {
        const numMatch = cardName.match(/(\d+)\s*[\/-]\s*(\d+)/);
        if (numMatch) number = `${numMatch[1]}/${numMatch[2]}`;
      }
      return {
        rank: i + 1,
        productId: c.productId,
        cardName,
        number,
        snapshotPrice: c.marketPrice,
        livePrice: c.marketPrice,
      };
    });

    // Sort by price descending
    output.sort((a, b) => b.snapshotPrice - a.snapshotPrice);
    output.forEach((c, i) => c.rank = i + 1);

    const totalValue = output.reduce((s, c) => s + c.snapshotPrice, 0);
    console.log(`\nCards with prices: ${output.length}`);
    console.log(`Total index value: $${totalValue.toFixed(2)}`);
    console.log(`\nTop 10:`);
    output.slice(0, 10).forEach(c => console.log(`  ${c.rank}. ${c.cardName} — $${c.snapshotPrice}`));

    fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
    console.log(`\nSaved to ${OUTPUT}`);

  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
