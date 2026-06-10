"use client";

import { useState, useMemo } from "react";
import cardsData from "@/data/pf-cards.json";

interface Card {
  rank: number;
  productId: number | null;
  cardName: string;
  number: string | null;
  snapshotPrice: number;
  livePrice: number | null;
}

function getPrice(card: Card): number {
  return card.livePrice ?? card.snapshotPrice;
}

function fmt(n: number): string {
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return "$" + n.toFixed(2);
  return "$" + n.toFixed(4);
}

const cards = (cardsData as Card[]).map((c) => ({ ...c, price: getPrice(c) }));
const sortedByPrice = [...cards].sort((a, b) => b.price - a.price);
const totalValue = cards.reduce((s, c) => s + c.price, 0);
const mostExpensive = sortedByPrice[0];
const cheapest = sortedByPrice[sortedByPrice.length - 1];
const top10Value = sortedByPrice.slice(0, 10).reduce((s, c) => s + c.price, 0);
const top10Pct = ((top10Value / totalValue) * 100).toFixed(1);
const TOTAL_CARDS = cards.length;

export default function PFIndexPage() {
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filteredCards = useMemo(() => {
    const q = search.toLowerCase().trim();
    let filtered = q
      ? cards.filter((c) => c.cardName.toLowerCase().includes(q))
      : cards;
    return [...filtered].sort((a, b) =>
      sortDir === "desc" ? b.price - a.price : a.price - b.price
    );
  }, [search, sortDir]);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", fontFamily: "'JetBrains Mono', 'Fira Mono', 'Consolas', monospace", color: "#fff" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>
        <div style={{ paddingTop: 24 }}>
          <a href="/" style={{ fontSize: 12, color: "#888", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>&larr;</span> Back to Home
          </a>
        </div>

        <div style={{ textAlign: "center", padding: "48px 0 32px", borderBottom: "1px solid #222" }}>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "0.08em" }}>
            PALDEAN FATES INDEX
          </h1>
          <p style={{ fontSize: 14, color: "#888", marginTop: 8, marginBottom: 0 }}>
            Scarlet &amp; Violet &middot; Paldean Fates &middot; All {TOTAL_CARDS} Cards
          </p>
        </div>

        <Section title="What is PF-INDEX?">
          <P>
            The PF-INDEX tracks the combined market value of all {TOTAL_CARDS} cards in
            the Scarlet &amp; Violet Paldean Fates set on TCGPlayer &mdash; the largest
            Pokemon card marketplace.
          </P>
          <P>
            Rather than trading individual cards, PF-INDEX gives you exposure to the
            entire Paldean Fates set in a single tradeable perpetual market on
            Pokeliquid. When the set&apos;s value goes up, PF-INDEX goes up.
            When it goes down, PF-INDEX goes down.
          </P>
        </Section>

        <Section title="Methodology">
          <BulletList
            items={[
              `Complete basket of all ${TOTAL_CARDS} cards in the Paldean Fates set`,
              `Index value = sum of all ${TOTAL_CARDS} individual card market prices`,
              "Prices fetched from TCGPlayer's market price API every 60 seconds",
              `No rebalancing needed — the set is fixed at ${TOTAL_CARDS} cards`,
            ]}
          />
        </Section>

        <Section title="Index Statistics">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
            <StatBox label="Index Value" value={fmt(totalValue)} accent />
            <StatBox label="Cards in Index" value={`${TOTAL_CARDS}`} />
            <StatBox label="Most Expensive" value={fmt(mostExpensive.price)} sub={mostExpensive.cardName} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 16 }}>
            <StatBox label="Cheapest" value={fmt(cheapest.price)} sub={cheapest.cardName} />
            <StatBox label="Top 10 Cards" value={`${top10Pct}% of index`} sub={fmt(top10Value)} />
          </div>
        </Section>

        <Section title={`All ${TOTAL_CARDS} Cards`}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <input type="text" placeholder="Search cards..." value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: 200, background: "#111", border: "1px solid #333", color: "#fff", padding: "10px 14px", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", outline: "none" }} />
            <button onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
              style={{ background: "#111", border: "1px solid #333", color: "#888", padding: "10px 14px", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", cursor: "pointer", whiteSpace: "nowrap" }}>
              Price {sortDir === "desc" ? "\u2193 High" : "\u2191 Low"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#666", marginBottom: 12 }}>Showing {filteredCards.length} of {TOTAL_CARDS} cards</div>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: 400, borderCollapse: "collapse", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
              <thead>
                <tr>
                  {["#", "Card", "Price"].map((h) => (
                    <th key={h} style={{ textAlign: h === "Price" ? "right" : "left", padding: "10px 10px", borderBottom: "1px solid #333", color: "#666", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", position: "sticky", top: 0, background: "#0a0a0a" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((card) => (
                  <tr key={`${card.rank}-${card.productId}`} style={{ borderBottom: "1px solid #1a1a1a" }}>
                    <td style={{ padding: "8px 10px", color: "#555", whiteSpace: "nowrap", width: 40 }}>{card.rank}</td>
                    <td style={{ padding: "8px 10px", color: "#ccc" }}>{card.cardName}</td>
                    <td style={{ padding: "8px 10px", color: "#00ff41", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600 }}>{fmt(card.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
        <div style={{ height: 80 }} />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid #1a1a1a" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16, marginTop: 0 }}>{title}</h2>
      {children}
    </div>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: "#999", lineHeight: 1.7, marginBottom: 12 }}>{children}</p>;
}
function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{ fontSize: 13, color: "#999", lineHeight: 1.7, padding: "4px 0", paddingLeft: 16, position: "relative" }}>
          <span style={{ position: "absolute", left: 0, color: "#00ff41" }}>&bull;</span>{item}
        </li>
      ))}
    </ul>
  );
}
function StatBox({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{ background: "#111", border: "1px solid #222", padding: "16px 20px" }}>
      <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? "#00ff41" : "#fff" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#888", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
    </div>
  );
}
