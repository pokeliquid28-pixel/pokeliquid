"use client";

import { useState, useEffect, useRef } from "react";

// ─── Sections ───────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "getting-started", label: "Getting Started" },
  { id: "trading", label: "Trading" },
  { id: "fees", label: "Fees & Costs" },
  { id: "risk", label: "Risk Management" },
  { id: "oracle", label: "Oracle" },
  { id: "lp", label: "Liquidity Pool" },
  { id: "protocol", label: "Protocol" },
  { id: "api", label: "API Reference" },
  { id: "faq", label: "FAQ" },
  { id: "roadmap", label: "Roadmap" },
];

// ─── Copy button ────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{
        fontSize: 10,
        color: copied ? "#00ff41" : "#666",
        background: "none",
        border: "1px solid #333",
        padding: "2px 8px",
        cursor: "pointer",
        fontFamily: "'JetBrains Mono', monospace",
        marginLeft: 8,
        flexShrink: 0,
      }}
    >
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}

// ─── Address row ────────────────────────────────────────────────────────────

function Addr({ label, address, desc }: { label: string; address: string; desc?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #1a1a1a", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "#888", minWidth: 160 }}>{label}</span>
      <a
        href={`https://explorer.solana.com/address/${address}?cluster=devnet`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 11, color: "#00ff41", fontFamily: "'JetBrains Mono', monospace", textDecoration: "none", wordBreak: "break-all" }}
      >
        {address}
      </a>
      <CopyBtn text={address} />
      {desc && <span style={{ fontSize: 10, color: "#555", width: "100%", marginTop: 2 }}>{desc}</span>}
    </div>
  );
}

// ─── Code block ─────────────────────────────────────────────────────────────

function Code({ children }: { children: string }) {
  return (
    <div style={{ position: "relative", background: "#0d0d0d", border: "1px solid #1a1a1a", padding: "12px 16px", marginTop: 8, marginBottom: 12 }}>
      <div style={{ position: "absolute", top: 8, right: 8 }}>
        <CopyBtn text={children.trim()} />
      </div>
      <pre style={{ fontSize: 11, color: "#ccc", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}>
        {children.trim()}
      </pre>
    </div>
  );
}

// ─── Table ──────────────────────────────────────────────────────────────────

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div style={{ overflowX: "auto", marginTop: 8, marginBottom: 16 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} style={{ textAlign: "left", padding: "8px 12px", borderBottom: "1px solid #333", color: "#666", fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "8px 12px", borderBottom: "1px solid #1a1a1a", color: "#ccc", whiteSpace: j === 0 ? "nowrap" : undefined }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section heading ────────────────────────────────────────────────────────

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginTop: 48, marginBottom: 16, paddingTop: 16, borderTop: "1px solid #1a1a1a", scrollMarginTop: 80 }}>
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 14, fontWeight: 600, color: "#ccc", marginTop: 24, marginBottom: 8 }}>{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: "#999", lineHeight: 1.7, marginBottom: 12 }}>{children}</p>;
}

// ─── FAQ item ───────────────────────────────────────────────────────────────

function FAQ({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid #1a1a1a" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          textAlign: "left",
          background: "none",
          border: "none",
          padding: "14px 0",
          cursor: "pointer",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          color: "#ccc",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{q}</span>
        <span style={{ color: "#666", fontSize: 16, flexShrink: 0, marginLeft: 12 }}>{open ? "\u2212" : "+"}</span>
      </button>
      {open && <div style={{ paddingBottom: 14, fontSize: 12, color: "#888", lineHeight: 1.7 }}>{children}</div>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DOCS PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Track active section on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px" }
    );

    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0a0a0a",
        fontFamily: "'JetBrains Mono', 'Fira Mono', 'Consolas', monospace",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", gap: 0 }}>
        {/* ── Desktop Sidebar ──────────────────────────────────── */}
        <nav
          className="hidden lg:block"
          style={{
            width: 200,
            flexShrink: 0,
            position: "sticky",
            top: 72,
            height: "calc(100vh - 72px)",
            overflowY: "auto",
            padding: "32px 0 32px 16px",
            borderRight: "1px solid #1a1a1a",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: "#666", letterSpacing: "0.1em", marginBottom: 16, textTransform: "uppercase" }}>
            Documentation
          </div>
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              style={{
                display: "block",
                fontSize: 12,
                padding: "6px 12px",
                color: activeSection === s.id ? "#00ff41" : "#666",
                borderLeft: activeSection === s.id ? "2px solid #00ff41" : "2px solid transparent",
                textDecoration: "none",
                transition: "color 0.15s",
                marginBottom: 2,
              }}
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* ── Mobile nav selector ──────────────────────────────── */}
        <div
          className="lg:hidden"
          style={{
            position: "sticky",
            top: 56,
            zIndex: 20,
            background: "#0a0a0a",
            borderBottom: "1px solid #1a1a1a",
            padding: "8px 16px",
          }}
        >
          <select
            value={activeSection}
            onChange={(e) => {
              const el = document.getElementById(e.target.value);
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
            style={{
              width: "100%",
              background: "#111",
              color: "#ccc",
              border: "1px solid #333",
              padding: "8px 12px",
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              outline: "none",
            }}
          >
            {SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* ── Content ──────────────────────────────────────────── */}
        <main style={{ flex: 1, padding: "32px 16px 80px", minWidth: 0 }}>
          <div style={{ maxWidth: 760 }}>

            {/* ════════════ OVERVIEW ════════════ */}
            <H2 id="overview">Overview</H2>
            <P>
              Pokeliquid is the first on-chain perpetual futures DEX for Pok&eacute;mon TCG products.
              Built on Solana using the Anchor framework, it lets traders go long or short on sealed products
              and single cards with up to 10x leverage. Prices are sourced from TCGPlayer market data via
              an automated Playwright scraper with adaptive EWMA smoothing.
            </P>
            <P>Currently live on Solana Devnet with test USDC. No real money.</P>

            <H3>Live Markets</H3>
            <Table
              headers={["Market", "Product", "TCGPlayer ID", "Status"]}
              rows={[
                ["PRISMATIC-ETB-PERP", "Prismatic Evolutions Elite Trainer Box", "593355", "LIVE"],
                ["CHARIZARD-X-PERP", "Mega Charizard X ex \u00B7 Phantasmal Flames", "662184", "LIVE"],
                ["CHARMANDER-PERP", "Charmander #038 \u00B7 Mega Evolution Promo", "684462", "LIVE"],
                ["PIKACHU-PERP", "Pikachu ex \u00B7 Ascended Heroes", "676088", "LIVE"],
              ]}
            />

            <H3>Network</H3>
            <P>Solana Devnet. All addresses are devnet PDAs derived from the program.</P>

            {/* ════════════ GETTING STARTED ════════════ */}
            <H2 id="getting-started">Getting Started</H2>
            <H3>1. Visit the app</H3>
            <P>Go to pokeliquid.xyz (or the current Vercel deployment URL).</P>

            <H3>2. Create an account</H3>
            <P>
              Click &ldquo;Start Trading&rdquo; on the landing page. You can create an account with email and password,
              or continue as a guest with no account.
            </P>

            <H3>3. Session Wallet</H3>
            <P>
              No browser wallet extension (Phantom, Solflare) is required. Pokeliquid automatically generates a
              Solana keypair stored in your browser&rsquo;s localStorage. This &ldquo;session wallet&rdquo; signs
              all transactions locally. If you create an account, your encrypted private key is stored server-side
              for email recovery (AES-256-GCM encryption).
            </P>

            <H3>4. Get Test USDC</H3>
            <P>
              Click &ldquo;GET TEST USDC&rdquo; in the trading interface. This calls the <code>mint_devnet_usdc</code> instruction
              which mints 1,000 test USDC to your wallet. This is devnet-only and requires no authorization.
            </P>

            <H3>5. Deposit Collateral</H3>
            <P>
              Click &ldquo;DEPOSIT/WITHDRAW&rdquo; and deposit USDC into your margin account. Your margin account
              is a PDA derived from your wallet address with the seed <code>margin</code>.
            </P>

            <H3>6. Open a Position</H3>
            <P>
              Select a market, choose Long or Short, set your collateral amount and leverage (1-10x),
              optionally set Stop Loss and Take Profit prices, then click to open your position.
            </P>

            {/* ════════════ TRADING ════════════ */}
            <H2 id="trading">Trading</H2>

            <H3>Opening a Position</H3>
            <P>The <code>open_position</code> instruction accepts:</P>
            <Table
              headers={["Parameter", "Type", "Description"]}
              rows={[
                ["direction", "Long | Short", "Trade direction"],
                ["collateral", "u64", "USDC collateral amount (6 decimals, e.g. 10_000_000 = $10)"],
                ["leverage", "u8", "Leverage multiplier (1\u201310)"],
                ["sl_price", "Option<u64>", "Optional stop-loss price (6 decimal scale)"],
                ["tp_price", "Option<u64>", "Optional take-profit price (6 decimal scale)"],
              ]}
            />
            <P>
              Notional value = collateral \u00D7 leverage. A 2% fee (200 bps) is deducted from collateral on open.
              The position is stored in your MarginAccount which supports up to 5 simultaneous positions.
            </P>

            <H3>Order Types</H3>
            <P>
              Currently only <strong>Market orders</strong> are supported on-chain. The frontend also shows
              Limit and Stop order UI, but these are executed as market orders when the price condition is met
              by the keeper.
            </P>

            <H3>Closing a Position</H3>
            <P>
              Call <code>close_position</code> with the position slot index (0\u20134). PnL is calculated as:
            </P>
            <Code>{`Long PnL  = notional * (exit_price - entry_price) / entry_price
Short PnL = notional * (entry_price - exit_price) / entry_price`}</Code>
            <P>
              A 2% close fee is deducted. Profit is capped at the profit cap (500%, or 50,000 bps).
              The settlement amount (collateral + PnL - fees) is transferred from/to the fee vault.
            </P>

            <H3>Stop Loss / Take Profit</H3>
            <P>
              Set SL/TP on any open position via <code>set_sl_tp</code>. The keeper monitors prices and
              calls <code>execute_sl_tp</code> permissionlessly when conditions are met. The executor
              receives a <strong>0.1% reward</strong> (10 bps of position collateral) for executing the order.
            </P>
            <P>
              For longs: SL must be below entry price, TP must be above. For shorts: SL must be above entry price,
              TP must be below.
            </P>

            <H3>Multiple Positions</H3>
            <P>
              Each MarginAccount supports up to <strong>5 simultaneous positions</strong> (MAX_POSITIONS = 5).
              Positions are stored in a fixed-size array with Option slots. MarginAccount size = 386 bytes.
            </P>

            {/* ════════════ FEES ════════════ */}
            <H2 id="fees">Fees &amp; Costs</H2>

            <Table
              headers={["Fee", "Rate", "Notes"]}
              rows={[
                ["Open Fee", "2% (200 bps)", "Deducted from collateral when opening"],
                ["Close Fee", "2% (200 bps)", "Deducted from settlement when closing"],
                ["Profit Cap", "500% (50,000 bps)", "Max profit per position"],
                ["Min Position Size", "$1.00 (1,000,000 raw)", "Minimum collateral"],
              ]}
            />

            <H3>Fee Distribution</H3>
            <P>Trading fees collected on open and close are distributed:</P>
            <Table
              headers={["Destination", "Share", "Description"]}
              rows={[
                ["LP Pool", "30% (3,000 bps)", "Distributed to liquidity providers"],
                ["Fee Vault", "60%", "Protocol revenue"],
                ["Insurance Fund", "10% (1,000 bps)", "Bad debt coverage"],
              ]}
            />

            <H3>Funding Rate</H3>
            <P>
              Funding is settled hourly by the keeper via <code>settle_funding</code> (permissionless crank).
              The funding rate has two components:
            </P>
            <Code>{`Base Rate:  30 / 100,000 per hour = 0.03%/hr = 0.72%/day
Skew Rate: skew_factor * (long_OI - short_OI) / (long_OI + short_OI)
           where skew_factor = 1,000 / 100,000 = 1%

Total Funding = base_rate + skew_rate (per hour)
Longs pay when long OI > short OI (and vice versa)`}</Code>
            <P>
              Funding is deducted from position collateral. If collateral drops below the liquidation
              threshold due to funding, the position becomes liquidatable.
            </P>

            {/* ════════════ RISK ════════════ */}
            <H2 id="risk">Risk Management</H2>

            <H3>Liquidation</H3>
            <P>
              A position is liquidatable when its margin ratio falls below <strong>5% (500 bps)</strong>.
            </P>
            <Code>{`Margin Ratio = (collateral + unrealized_PnL) / notional

Liquidation Price (Long):
  entry_price * (1 - (collateral - notional * 0.05) / notional)

Liquidation Price (Short):
  entry_price * (1 + (collateral - notional * 0.05) / notional)`}</Code>
            <P>
              Liquidation is <strong>permissionless</strong> — anyone can call <code>liquidate</code>.
              The keeper checks every 10 seconds and liquidates undercollateralized positions.
            </P>

            <H3>Liquidation Distribution</H3>
            <Table
              headers={["Recipient", "Share", "Description"]}
              rows={[
                ["Liquidator", "1% (100 bps)", "Reward for calling liquidate"],
                ["Insurance Fund", "9% (900 bps)", "Bad debt reserve"],
                ["Fee Vault", "90%", "Remaining collateral"],
              ]}
            />

            <H3>Add / Remove Margin</H3>
            <P>
              Use <code>add_margin</code> to move free collateral into a position (lowering liquidation price).
              Use <code>remove_margin</code> to withdraw margin back to free collateral (health-checked — cannot
              reduce margin ratio below the liquidation threshold).
            </P>

            <H3>Insurance Fund</H3>
            <P>
              The insurance fund covers bad debt when a liquidated position&rsquo;s collateral is insufficient.
              It&rsquo;s funded by 10% of trading fees and 9% of liquidation proceeds. The admin can withdraw
              from the insurance fund via <code>withdraw_insurance</code>.
            </P>

            {/* ════════════ ORACLE ════════════ */}
            <H2 id="oracle">Oracle</H2>

            <H3>Price Source</H3>
            <P>
              Prices are scraped from TCGPlayer product pages using Playwright (headless Chromium).
              The keeper runs a browser instance, navigates to each product page, and extracts the
              current market price from the TCGPlayer DOM.
            </P>
            <Table
              headers={["Market", "TCGPlayer Product ID"]}
              rows={[
                ["PRISMATIC-ETB-PERP", "593355"],
                ["CHARIZARD-X-PERP", "662184"],
                ["CHARMANDER-PERP", "684462"],
                ["PIKACHU-PERP", "676088"],
              ]}
            />

            <H3>Update Frequency</H3>
            <P>
              The oracle updates every <strong>5 minutes</strong> (300,000ms). All 4 markets are scraped
              in parallel using separate browser pages within a single Playwright context.
            </P>

            <H3>Adaptive EWMA Smoothing</H3>
            <P>
              Raw scraped prices are smoothed using an Adaptive Exponential Weighted Moving Average (EWMA)
              with 4 tiers based on price deviation from the current EWMA:
            </P>
            <Table
              headers={["Deviation", "Alpha", "Mode", "Behavior"]}
              rows={[
                ["< 3%", "1.0", "Direct", "Price passes through unchanged"],
                ["3\u20135%", "0.3", "Moderate", "Moderate smoothing applied"],
                ["5\u201315%", "0.1", "Heavy", "Heavy smoothing, slow convergence"],
                ["> 15%", "0.01", "Spike", "Near-total rejection, spike protection"],
              ]}
            />
            <Code>{`EWMA formula: new_ewma = alpha * raw_price + (1 - alpha) * prev_ewma

Price floor protection: if candidate < floor, update is rejected entirely.
  ETB floor: $100 | Charizard-X floor: $200
  Charmander floor: $1 | Pikachu floor: $10`}</Code>

            <H3>Staleness Protection</H3>
            <P>
              On-chain, the oracle has a <strong>staleness threshold of 30 minutes</strong> (1,800 seconds).
              If the oracle hasn&rsquo;t been updated within this window, trading instructions will fail
              with <code>PriceStale</code>.
            </P>
            <P>
              Additionally, anyone can call <code>check_and_pause</code> (permissionless) to automatically
              pause the protocol if the oracle is stale beyond the <strong>auto-pause threshold of 1 hour</strong> (3,600 seconds).
            </P>

            <H3>Secondary Authority</H3>
            <P>
              The oracle accepts updates from either the admin wallet or a secondary authority keypair.
              The keeper automatically fails over to the secondary keypair after 3 consecutive primary failures,
              and sends Telegram alerts when failover occurs.
            </P>

            {/* ════════════ LP ════════════ */}
            <H2 id="lp">Liquidity Pool</H2>

            <H3>How It Works</H3>
            <P>
              Liquidity providers deposit USDC into the pool via <code>lp_deposit</code> and receive LP shares.
              Shares represent proportional ownership of the pool. The share price = total_usdc / total_shares.
            </P>

            <H3>Earning Fees</H3>
            <P>
              <strong>30% of all trading fees</strong> (3,000 bps of the fee_bps allocation) are directed to the LP pool.
              LPs can claim their proportional share of accumulated fees via <code>claim_fees</code> at any time.
            </P>

            <H3>Withdrawing</H3>
            <P>
              Call <code>lp_withdraw</code> with the number of shares to burn. USDC is returned proportionally.
              There is no lockup period — withdraw anytime.
            </P>

            <H3>Risks</H3>
            <P>
              LP deposits are held in the protocol vault. If the vault is drained by profitable traders beyond
              the insurance fund&rsquo;s capacity, LPs could face losses. Smart contract risk also applies.
              This is devnet software — not audited.
            </P>

            {/* ════════════ PROTOCOL ════════════ */}
            <H2 id="protocol">Protocol</H2>

            <H3>Program Details</H3>
            <Table
              headers={["Property", "Value"]}
              rows={[
                ["Program ID", "7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ"],
                ["Network", "Solana Devnet"],
                ["Framework", "Anchor 1.0.2"],
                ["Rust Edition", "2021"],
                ["Test Framework", "litesvm 0.10.0"],
              ]}
            />

            <H3>Deployed Addresses</H3>
            <Addr label="Program" address="7DVf9oEMcKPV6VUUz5BpptbwqpgBfXunwxjTNNQmZvbJ" desc="Pokeliquid program" />
            <Addr label="ProtocolState" address="8cGem2Q8BrqYpvnwqscnGiKjoEZPXpyb8KziueJ24SiK" desc="Global protocol configuration PDA" />
            <Addr label="Oracle (ETB)" address="2euE9eMGTNwyW7jqG63JvRZfHeo7psKZgBCizfNMjW12" desc="PRISMATIC-ETB-PERP price feed" />
            <Addr label="Oracle (Charizard X)" address="8UWP5YpJh2bZAC24zNaQm9z4p6vLwJJPEGztRY4QHAfg" desc="CHARIZARD-X-PERP price feed" />
            <Addr label="Oracle (Charmander)" address="6WQUKKr2uLU4Pv7ZNwUEuLhCrQjEFCvsaZxfCwo2a3XD" desc="CHARMANDER-PERP price feed" />
            <Addr label="Oracle (Pikachu)" address="B1BWNQ2YdS7fgage61wFHc1Qs3aFMLtbYw7TPi6bQRYs" desc="PIKACHU-PERP price feed" />
            <Addr label="Fee Vault" address="GRFF44bR65tVUChnidAqZAgpFbg1Kw8GboWzUBQbW581" desc="Protocol revenue vault" />
            <Addr label="Insurance Fund" address="9NmpMraE2XCSUa1gKgwi9zxN8LLdT4o5Uiis5dKkKs1F" desc="Bad debt coverage fund" />
            <Addr label="USDC Mint" address="Gj9gBxmesYoNa4kvZUKJbiF85PduMKnHnppp4ikbWUUi" desc="Devnet test USDC mint (program-controlled)" />

            <H3>All Instructions</H3>
            <Table
              headers={["Instruction", "Auth", "Description"]}
              rows={[
                ["initialize", "Admin", "One-time protocol setup, creates all PDAs"],
                ["initialize_pool", "Admin", "One-time LP pool setup"],
                ["deposit_collateral", "User", "Deposit USDC into margin account"],
                ["withdraw_collateral", "User", "Withdraw free collateral"],
                ["close_margin_account", "User", "Close margin account, return rent"],
                ["open_position", "User", "Open a leveraged perpetual position"],
                ["close_position", "User", "Close a position, settle PnL"],
                ["add_margin", "User", "Add collateral to an open position"],
                ["remove_margin", "User", "Remove margin (health-checked)"],
                ["set_sl_tp", "User", "Set stop-loss / take-profit prices"],
                ["execute_sl_tp", "Permissionless", "Execute triggered SL/TP orders"],
                ["liquidate", "Permissionless", "Liquidate undercollateralized position"],
                ["settle_funding", "Permissionless", "Settle hourly funding on all positions"],
                ["check_and_pause", "Permissionless", "Pause protocol if oracle stale > 1hr"],
                ["lp_deposit", "User", "Deposit USDC into LP pool for shares"],
                ["lp_withdraw", "User", "Burn shares to withdraw USDC"],
                ["claim_fees", "User", "Claim accumulated LP fee share"],
                ["update_oracle", "Admin/Secondary", "Push price to default oracle"],
                ["init_market_oracle", "Admin", "Create a market-specific oracle PDA"],
                ["update_market_oracle", "Admin/Secondary", "Push price to market oracle"],
                ["update_params", "Admin", "Update protocol parameters"],
                ["withdraw_fees", "Admin", "Withdraw from fee vault"],
                ["withdraw_insurance", "Admin", "Withdraw from insurance fund"],
                ["mint_devnet_usdc", "Anyone", "Mint 1,000 test USDC (devnet only)"],
              ]}
            />

            <H3>Events</H3>
            <Table
              headers={["Event", "Key Fields", "When Emitted"]}
              rows={[
                ["PositionOpened", "user, direction, collateral, notional, leverage, entry_price, fee_paid", "Position opened"],
                ["PositionClosed", "user, direction, entry/exit price, pnl, funding_paid, fee_paid, reason", "Position closed (manual/SL/TP/liquidation)"],
                ["PositionLiquidated", "user, liquidator, entry/exit price, collateral_lost", "Position liquidated"],
                ["FundingSettled", "user, position_index, funding_owed, hours_settled, new_collateral", "Funding settled on position"],
                ["LpDeposited", "user, amount, shares, total_usdc", "LP deposit"],
                ["LpWithdrawn", "user, shares, usdc_out, total_usdc", "LP withdrawal"],
                ["FeesClaimed", "user, amount", "LP fees claimed"],
                ["SlTpSet", "user, position_index, sl_price, tp_price", "SL/TP prices updated"],
                ["OracleUpdated", "old_price, new_price, timestamp", "Oracle price pushed"],
                ["OracleStale", "last_updated, seconds_stale", "Oracle staleness detected"],
              ]}
            />

            <H3>Error Codes</H3>
            <Table
              headers={["Code", "Message"]}
              rows={[
                ["InsufficientCollateral", "Insufficient collateral"],
                ["PositionSlotsFull", "All position slots are full (max 5)"],
                ["NoOpenPosition", "No open position in that slot"],
                ["InvalidPositionIndex", "Invalid position index"],
                ["BelowMinLeverage", "Leverage must be at least 1"],
                ["AboveMaxLeverage", "Leverage cannot exceed 10"],
                ["BelowMinPositionSize", "Position size below minimum"],
                ["ExceedsMaxExposure", "Trade would exceed max exposure limit"],
                ["NotLiquidatable", "Position is not liquidatable"],
                ["Unauthorized", "Unauthorized"],
                ["ProtocolPaused", "Protocol is paused"],
                ["PriceStale", "Oracle price is stale"],
                ["InsufficientVaultBalance", "Insufficient vault balance"],
                ["MathOverflow", "Math overflow"],
                ["InsufficientShares", "Insufficient LP shares"],
                ["NoFeesToClaim", "No fees to claim"],
                ["PoolAlreadyInitialized", "Pool already initialized"],
                ["InsufficientPoolBalance", "Insufficient pool balance"],
                ["OracleNotStale", "Oracle is not stale \u2014 cannot pause"],
                ["InvalidStopLoss", "Invalid stop-loss price for position direction"],
                ["InvalidTakeProfit", "Invalid take-profit price for position direction"],
                ["NotTriggered", "SL/TP conditions not met"],
              ]}
            />

            {/* ════════════ API ════════════ */}
            <H2 id="api">API Reference</H2>
            <P>
              The keeper exposes an HTTP API on port 3001. On the frontend, endpoints are proxied
              via Vercel rewrites at <code>/api/keeper/*</code>.
            </P>

            <H3>GET /ping</H3>
            <P>Health check. Returns <code>{`{"ok":true,"timestamp":"..."}`}</code></P>

            <H3>GET /health</H3>
            <P>Comprehensive system health including oracle status, liquidation stats, funding stats, Solana RPC health, and per-market oracle data.</P>
            <Code>{`{
  "status": "healthy" | "degraded" | "critical",
  "oracle": {
    "last_update": "ISO timestamp",
    "seconds_since_update": 42,
    "ewma": 161.60,
    "updates_1h": 12,
    "updates_24h": 288
  },
  "markets": {
    "ETB": { "label": "PRISMATIC-ETB", "oracle": "2euE...", "ewma": 161.60, "seconds_since_update": 42 },
    "CHARIZARD-X": { ... },
    "CHARMANDER": { ... },
    "PIKACHU": { ... }
  },
  "liquidation": { "checks_1h": 360, "liquidations_24h": 0, "accounts_monitored": 5 },
  "funding": { "settlements_24h": 24, "errors_24h": 0 },
  "solana": { "rpc_url": "...", "slot": 123456, "rpc_latency_ms": 45 },
  "keeper": { "uptime_minutes": 1440, "total_updates": 288, "total_errors": 0 }
}`}</Code>

            <H3>GET /prices</H3>
            <P>Historical price data for charting.</P>
            <Table
              headers={["Param", "Type", "Default", "Description"]}
              rows={[
                ["market", "string", "ETB", "Market ID (ETB, CHARIZARD-X, CHARMANDER, PIKACHU)"],
                ["limit", "number", "50", "Number of rows (max 500)"],
                ["from", "number", "\u2014", "Unix timestamp range start"],
                ["to", "number", "\u2014", "Unix timestamp range end"],
              ]}
            />
            <Code>{`Response: [
  { "id": 1, "timestamp": 1717401600, "raw_price": 161.5, "ewma": 161.6, "deviation": 0.001, "alpha": 1, "tx_signature": "..." },
  ...
]`}</Code>

            <H3>GET /trades/recent</H3>
            <P>Recent trades across all users.</P>
            <Table
              headers={["Param", "Type", "Default", "Description"]}
              rows={[
                ["limit", "number", "50", "Number of trades (max 200)"],
              ]}
            />
            <Code>{`Response: {
  "trades": [
    { "id": 1, "timestamp": ..., "user_pubkey": "...", "direction": "long", "notional": 100, "entry_price": 161.5, "exit_price": 162.0, "pnl": 0.31, "action": "close" },
    ...
  ]
}`}</Code>

            <H3>GET /trades</H3>
            <P>Trades for a specific user. Requires <code>user</code> parameter.</P>
            <Table
              headers={["Param", "Type", "Required", "Description"]}
              rows={[
                ["user", "string", "Yes", "User public key"],
                ["limit", "number", "No", "Max trades (default 20, max 100)"],
              ]}
            />

            <H3>GET /events/recent</H3>
            <P>Recent decoded on-chain events.</P>
            <Table
              headers={["Param", "Type", "Default", "Description"]}
              rows={[
                ["limit", "number", "10", "Number of events (max 50)"],
              ]}
            />

            <H3>GET /stats</H3>
            <P>Protocol statistics.</P>
            <Code>{`Response: {
  "total_volume_24h": 27688,
  "total_volume_7d": 150000,
  "total_trades_24h": 12,
  "total_liquidations_24h": 0,
  "total_fees_24h": 553.76,
  "unique_traders_24h": 3
}`}</Code>

            {/* ════════════ FAQ ════════════ */}
            <H2 id="faq">FAQ</H2>

            <FAQ q="Do I need a crypto wallet extension?">
              No. Pokeliquid generates a session wallet automatically in your browser. No Phantom,
              Solflare, or any extension required. Your keypair is stored in localStorage and optionally
              backed up via email for recovery.
            </FAQ>

            <FAQ q="Is this real money?">
              No. Pokeliquid is on Solana Devnet with test USDC. You can mint free test USDC with one click.
              No real funds are at risk.
            </FAQ>

            <FAQ q="What happens if I close my browser?">
              Your session wallet keypair persists in localStorage. When you return, your wallet reconnects
              automatically. If you created an account with email/password, you can recover your wallet on
              any device by logging in.
            </FAQ>

            <FAQ q="Can I get liquidated?">
              Yes. If your margin ratio drops below 5%, your position can be liquidated by anyone (the keeper
              checks every 10 seconds). You lose your remaining collateral. Set a stop-loss to protect yourself.
            </FAQ>

            <FAQ q="How is the price determined?">
              Prices come from TCGPlayer market data, scraped every 5 minutes using Playwright. Raw prices
              are smoothed with an adaptive EWMA algorithm that protects against manipulation and price spikes.
            </FAQ>

            <FAQ q="What is the profit cap?">
              Maximum profit per position is 500% (50,000 bps) of your collateral. For example, with $10
              collateral, max profit is $50.
            </FAQ>

            <FAQ q="Can I provide liquidity?">
              Yes. Go to the Pool page to deposit USDC. You receive LP shares and earn 30% of all trading
              fees proportional to your share. No lockup period.
            </FAQ>

            <FAQ q="What are the fees?">
              2% fee on open and 2% fee on close (200 bps each). Plus hourly funding charges based on
              open interest skew.
            </FAQ>

            <FAQ q="When is mainnet?">
              Soon. Follow the roadmap on the Stats page for updates.
            </FAQ>

            {/* ════════════ ROADMAP ════════════ */}
            <H2 id="roadmap">Roadmap</H2>

            {[
              { phase: "Phase 1", status: "LIVE", active: true, items: ["Devnet deployment", "4 live markets (ETB, Charizard X, Charmander, Pikachu)", "10x max leverage", "Session wallet \u2014 no extension needed", "LP pool with 30% fee share", "Adaptive EWMA oracle", "Automated keeper (liquidations, funding, SL/TP)"] },
              { phase: "Phase 2", status: "Planned", active: false, items: ["Mainnet launch", "25x max leverage", "Additional card markets", "Mobile-optimized UI"] },
              { phase: "Phase 3", status: "Planned", active: false, items: ["50x max leverage", "Vintage card oracle committee", "Governance token"] },
              { phase: "Phase 4", status: "Planned", active: false, items: ["100x max leverage", "BASE-SET-CHARIZARD-PERP", "$PLIQ governance live"] },
            ].map((phase) => (
              <div
                key={phase.phase}
                style={{
                  border: phase.active ? "1px solid rgba(0,255,65,0.3)" : "1px solid #1a1a1a",
                  background: phase.active ? "rgba(0,255,65,0.03)" : "#111",
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: phase.active ? "#00ff41" : "#333", display: "inline-block" }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{phase.phase}</span>
                  <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", padding: "2px 8px", background: phase.active ? "rgba(0,255,65,0.15)" : "#1a1a1a", color: phase.active ? "#00ff41" : "#666" }}>
                    {phase.status}
                  </span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 28 }}>
                  {phase.items.map((item, i) => (
                    <li key={i} style={{ fontSize: 12, color: "#888", lineHeight: 1.8 }}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}

          </div>
        </main>
      </div>
    </div>
  );
}
