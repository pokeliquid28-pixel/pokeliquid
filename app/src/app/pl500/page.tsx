"use client";

import { useState, useMemo } from "react";
import cardsData from "@/data/pl500-cards.json";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Card {
  rank: number;
  productId: number | null;
  cardName: string;
  setName: string;
  number: string;
  snapshotPrice: number;
  livePrice: number | null;
  matchType: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPrice(card: Card): number {
  return card.livePrice ?? card.snapshotPrice;
}

function fmt(n: number): string {
  if (n >= 1000) return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return "$" + n.toFixed(2);
  return "$" + n.toFixed(4);
}

// ─── Precomputed stats ──────────────────────────────────────────────────────

const cards = (cardsData as Card[]).map((c, i) => ({ ...c, price: getPrice(c) }));
const sortedByPrice = [...cards].sort((a, b) => b.price - a.price);
const totalValue = cards.reduce((s, c) => s + c.price, 0);
const mostExpensive = sortedByPrice[0];
const cheapest = sortedByPrice[sortedByPrice.length - 1];
const top10Value = sortedByPrice.slice(0, 10).reduce((s, c) => s + c.price, 0);
const top10Pct = ((top10Value / totalValue) * 100).toFixed(1);

// Unique Pokemon
const pokemonMaxMap: Record<string, number> = {};
cards.forEach((c) => {
  let name = c.cardName.split(" - ")[0].trim();
  name = name.replace(/\s*\(.*\)$/, "");
  const price = c.price;
  if (!pokemonMaxMap[name] || price > pokemonMaxMap[name]) pokemonMaxMap[name] = price;
});
const uniquePokemonCount = Object.keys(pokemonMaxMap).length;
const top50Pokemon = Object.entries(pokemonMaxMap)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 50);

// ═════════════════════════════════════════════════════════════════════════════
// PL500 PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function PL500Page() {
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filteredCards = useMemo(() => {
    const q = search.toLowerCase().trim();
    let filtered = q
      ? cards.filter(
          (c) =>
            c.cardName.toLowerCase().includes(q) ||
            c.setName.toLowerCase().includes(q)
        )
      : cards;

    return [...filtered].sort((a, b) =>
      sortDir === "desc" ? b.price - a.price : a.price - b.price
    );
  }, [search, sortDir]);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0a0a",
        fontFamily: "'JetBrains Mono', 'Fira Mono', 'Consolas', monospace",
        color: "#fff",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 16px" }}>
        {/* ── Back link ──────────────────────────────────────── */}
        <div style={{ paddingTop: 24 }}>
          <a
            href="/"
            style={{
              fontSize: 12,
              color: "#888",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>&larr;</span> Back to Home
          </a>
        </div>

        {/* ── Header ─────────────────────────────────────────── */}
        <div
          style={{
            textAlign: "center",
            padding: "48px 0 32px",
            borderBottom: "1px solid #222",
          }}
        >
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#fff",
              margin: 0,
              letterSpacing: "0.08em",
            }}
          >
            PL500 INDEX
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#888",
              marginTop: 8,
              marginBottom: 0,
            }}
          >
            The Pokemon Card Market Index
          </p>
        </div>

        {/* ── What is PL500? ─────────────────────────────────── */}
        <Section title="What is PL500?">
          <P>
            The PL500 is analogous to the S&amp;P 500, but for Pokemon cards. It
            tracks the combined market value of the top 500 best-selling Pokemon
            cards on TCGPlayer &mdash; the largest Pokemon card marketplace.
          </P>
          <P>
            Rather than trading individual cards, the PL500 gives you exposure to
            the entire Pokemon card market in a single tradeable perpetual market
            on Pokeliquid. When the Pokemon card market goes up, the PL500 goes
            up. When it goes down, the PL500 goes down.
          </P>
        </Section>

        {/* ── Methodology ────────────────────────────────────── */}
        <Section title="Methodology">
          <BulletList
            items={[
              "Fixed basket of 500 cards selected from TCGPlayer's bestseller rankings",
              "Index value = sum of all 500 individual card market prices",
              "Prices fetched from TCGPlayer's market price API every 60 seconds",
              "Periodic rebalancing: cards may be swapped in or out based on updated TCGPlayer rankings",
              "8 cards (~$110 of ~$103K total) use snapshot pricing due to API limitations on certain products",
            ]}
          />
        </Section>

        {/* ── Index Statistics ────────────────────────────────── */}
        <Section title="Index Statistics">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <StatBox label="Index Value" value={fmt(totalValue)} accent />
            <StatBox label="Cards in Index" value="500" />
            <StatBox
              label="Unique Pokemon"
              value={`${uniquePokemonCount}+`}
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <StatBox
              label="Most Expensive"
              value={fmt(mostExpensive.price)}
              sub={mostExpensive.cardName}
            />
            <StatBox
              label="Cheapest"
              value={fmt(cheapest.price)}
              sub={cheapest.cardName}
            />
            <StatBox
              label="Top 10 Cards"
              value={`${top10Pct}% of index`}
              sub={fmt(top10Value)}
            />
          </div>
        </Section>

        {/* ── All 500 Cards ──────────────────────────────────── */}
        <Section title="All 500 Cards">
          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 16,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              placeholder="Search cards or sets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                minWidth: 200,
                background: "#111",
                border: "1px solid #333",
                color: "#fff",
                padding: "10px 14px",
                fontSize: 13,
                fontFamily: "'JetBrains Mono', monospace",
                outline: "none",
              }}
            />
            <button
              onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
              style={{
                background: "#111",
                border: "1px solid #333",
                color: "#888",
                padding: "10px 14px",
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Price {sortDir === "desc" ? "\u2193 High" : "\u2191 Low"}
            </button>
          </div>

          <div style={{ fontSize: 11, color: "#666", marginBottom: 12 }}>
            Showing {filteredCards.length} of 500 cards
          </div>

          <div
            style={{
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <table
              style={{
                width: "100%",
                minWidth: 500,
                borderCollapse: "collapse",
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              <thead>
                <tr>
                  {["#", "Card", "Set", "Price"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: h === "Price" ? "right" : "left",
                        padding: "10px 10px",
                        borderBottom: "1px solid #333",
                        color: "#666",
                        fontWeight: 600,
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        whiteSpace: "nowrap",
                        position: "sticky",
                        top: 0,
                        background: "#0a0a0a",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCards.map((card) => (
                  <tr
                    key={`${card.rank}-${card.productId}`}
                    style={{
                      borderBottom: "1px solid #1a1a1a",
                    }}
                  >
                    <td
                      style={{
                        padding: "8px 10px",
                        color: "#555",
                        whiteSpace: "nowrap",
                        width: 40,
                      }}
                    >
                      {card.rank}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        color: "#ccc",
                      }}
                    >
                      {card.cardName}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        color: "#888",
                        fontSize: 11,
                      }}
                    >
                      {card.setName}
                    </td>
                    <td
                      style={{
                        padding: "8px 10px",
                        color: "#00ff41",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                        fontWeight: 600,
                      }}
                    >
                      {fmt(card.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Top 50 Pokemon ─────────────────────────────────── */}
        <Section title="Top 50 Pokemon">
          <P>
            The 50 unique Pokemon (or named characters) with the highest-value
            single card in the index.
          </P>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 8,
              marginTop: 16,
            }}
          >
            {top50Pokemon.map(([name, price], i) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderBottom: "1px solid #1a1a1a",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: "#555",
                      width: 24,
                      textAlign: "right",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}.
                  </span>
                  <span style={{ fontSize: 12, color: "#ccc" }}>{name}</span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: "#00ff41",
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {fmt(price)}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Footer spacer ──────────────────────────────────── */}
        <div style={{ height: 80 }} />
      </div>
    </div>
  );
}

// ─── Reusable components ────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid #1a1a1a" }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "#fff",
          marginBottom: 16,
          marginTop: 0,
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 13,
        color: "#999",
        lineHeight: 1.7,
        marginBottom: 12,
      }}
    >
      {children}
    </p>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        margin: 0,
      }}
    >
      {items.map((item, i) => (
        <li
          key={i}
          style={{
            fontSize: 13,
            color: "#999",
            lineHeight: 1.7,
            padding: "4px 0",
            paddingLeft: 16,
            position: "relative",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: 0,
              color: "#00ff41",
            }}
          >
            &bull;
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

function StatBox({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #222",
        padding: "16px 20px",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#666",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: accent ? "#00ff41" : "#fff",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: "#888",
            marginTop: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
