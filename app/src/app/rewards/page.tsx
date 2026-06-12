"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

const API_BASE = process.env.NEXT_PUBLIC_PRICE_API || "/api/keeper";

type SpinRecord = {
  id: number;
  timestamp: number;
  wheel_type: string;
  tier: string;
  prize_description: string;
  prize_usd: number;
  fulfilled: number;
};

// ── Pokeball CSS ─────────────────────────────────────────────────────────────

const pokeballStyles = `
  .pokeball-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    position: relative;
  }

  .pokeball {
    position: relative;
    width: 160px;
    height: 160px;
    background: #fff;
    border: 6px solid #111;
    border-radius: 50%;
    overflow: hidden;
    box-shadow: inset -8px 8px 0 8px rgba(0,0,0,0.05), 0 8px 40px rgba(0,0,0,0.3);
    cursor: pointer;
    transition: transform 0.2s;
  }

  .pokeball:hover:not(.shaking):not(.locked) {
    transform: scale(1.05);
  }

  .pokeball.locked {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .pokeball::before {
    content: "";
    position: absolute;
    width: 100%;
    height: 50%;
    background: linear-gradient(180deg, #ff1a1a 0%, #cc0000 70%, #990000 100%);
  }

  .pokeball::after {
    content: "";
    position: absolute;
    top: calc(50% - 4px);
    width: 100%;
    height: 8px;
    background: #111;
  }

  .pokeball__button {
    position: absolute;
    width: 32px;
    height: 32px;
    border: 4px solid #333;
    border-radius: 50%;
    top: calc(50% - 16px);
    left: calc(50% - 16px);
    box-shadow: 0 0 0 6px #111;
    background: linear-gradient(135deg, #fff 0%, #ccc 100%);
    z-index: 10;
    transition: background 0.3s, box-shadow 0.3s;
  }

  .pokeball.shaking {
    animation: pokeball-shake 0.5s cubic-bezier(.36,.07,.19,.97) 3;
  }

  .pokeball.shaking .pokeball__button {
    animation: button-blink 0.4s alternate 6;
  }

  @keyframes pokeball-shake {
    0%   { transform: translate(0, 0) rotate(0deg); }
    15%  { transform: translate(-12px, 0) rotate(-18deg); }
    30%  { transform: translate(10px, 0) rotate(15deg); }
    45%  { transform: translate(-8px, 0) rotate(-12deg); }
    60%  { transform: translate(6px, 0) rotate(8deg); }
    75%  { transform: translate(-3px, 0) rotate(-4deg); }
    100% { transform: translate(0, 0) rotate(0deg); }
  }

  @keyframes button-blink {
    from { background: linear-gradient(135deg, #fff 0%, #ccc 100%); }
    to   { background: #e74c3c; box-shadow: 0 0 12px #e74c3c, 0 0 0 6px #111; }
  }

  .pokeball.won {
    animation: pokeball-click 0.3s ease-out forwards;
  }

  .pokeball.won .pokeball__button {
    background: #00ff41 !important;
    box-shadow: 0 0 20px #00ff41, 0 0 0 6px #111 !important;
  }

  @keyframes pokeball-click {
    0%   { transform: scale(1); box-shadow: 0 0 0 rgba(0,255,65,0); }
    50%  { transform: scale(1.12); box-shadow: 0 0 40px rgba(0,255,65,0.6), 0 0 80px rgba(0,255,65,0.3); }
    100% { transform: scale(1); box-shadow: 0 0 20px rgba(0,255,65,0.3); }
  }

  /* ── Sparkle particles on win ──────────────────────────── */
  .sparkles {
    position: absolute;
    width: 220px;
    height: 220px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .sparkles.active .sparkle {
    animation: sparkle-fly 1s ease-out forwards;
  }

  .sparkle {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    opacity: 0;
    top: 50%;
    left: 50%;
    margin: -3px 0 0 -3px;
  }

  /* Three colors like the games — gold, white, green */
  .sparkle:nth-child(3n+1) { background: #ffcc00; box-shadow: 0 0 6px #ffcc00; }
  .sparkle:nth-child(3n+2) { background: #ffffff; box-shadow: 0 0 6px #ffffff; }
  .sparkle:nth-child(3n+3) { background: #00ff41; box-shadow: 0 0 6px #00ff41; }

  /* Each sparkle flies in a different direction */
  .sparkle:nth-child(1)  { --angle: 0deg;   --dist: 90px;  animation-delay: 0s; }
  .sparkle:nth-child(2)  { --angle: 45deg;  --dist: 100px; animation-delay: 0.05s; }
  .sparkle:nth-child(3)  { --angle: 90deg;  --dist: 85px;  animation-delay: 0.1s; }
  .sparkle:nth-child(4)  { --angle: 135deg; --dist: 95px;  animation-delay: 0.03s; }
  .sparkle:nth-child(5)  { --angle: 180deg; --dist: 90px;  animation-delay: 0.08s; }
  .sparkle:nth-child(6)  { --angle: 225deg; --dist: 100px; animation-delay: 0.12s; }
  .sparkle:nth-child(7)  { --angle: 270deg; --dist: 88px;  animation-delay: 0.02s; }
  .sparkle:nth-child(8)  { --angle: 315deg; --dist: 95px;  animation-delay: 0.07s; }
  .sparkle:nth-child(9)  { --angle: 22deg;  --dist: 80px;  animation-delay: 0.15s; }
  .sparkle:nth-child(10) { --angle: 67deg;  --dist: 105px; animation-delay: 0.18s; }
  .sparkle:nth-child(11) { --angle: 112deg; --dist: 75px;  animation-delay: 0.2s; }
  .sparkle:nth-child(12) { --angle: 157deg; --dist: 110px; animation-delay: 0.22s; }

  @keyframes sparkle-fly {
    0% {
      opacity: 1;
      transform: translate(0, 0) scale(1);
    }
    60% {
      opacity: 1;
      transform: translate(
        calc(cos(var(--angle)) * var(--dist)),
        calc(sin(var(--angle)) * var(--dist))
      ) scale(1.5);
    }
    100% {
      opacity: 0;
      transform: translate(
        calc(cos(var(--angle)) * var(--dist) * 1.2),
        calc(sin(var(--angle)) * var(--dist) * 1.2)
      ) scale(0);
    }
  }

  .pokeball.lost {
    animation: pokeball-settle 0.4s ease-out forwards;
  }

  @keyframes pokeball-settle {
    0%   { transform: scale(1); }
    30%  { transform: scale(0.95); }
    100% { transform: scale(1); opacity: 0.7; }
  }

  .pokeball-glow {
    position: absolute;
    width: 190px;
    height: 190px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 2px solid rgba(0, 255, 65, 0.3);
    box-shadow: 0 0 20px rgba(0, 255, 65, 0.15), inset 0 0 20px rgba(0, 255, 65, 0.05);
    animation: glow-pulse 2s ease-in-out infinite;
  }

  @keyframes glow-pulse {
    0%, 100% { transform: scale(1); opacity: 0.3; }
    50%      { transform: scale(1.1); opacity: 0.6; }
  }

  .pokeball-glow.hidden { display: none; }
`;

// ── Pokeball Component ───────────────────────────────────────────────────────

type PokeballState = "idle" | "shaking" | "won" | "lost";

function PokeballSpin({
  onResult,
  freeEligible,
}: {
  onResult: (r: SpinRecord | null) => void;
  freeEligible: boolean;
}) {
  const { publicKey } = useWallet();
  const [state, setState] = useState<PokeballState>("idle");
  const [result, setResult] = useState<SpinRecord | null>(null);

  const spin = useCallback(async () => {
    if (!publicKey || state !== "idle") return;

    if (!freeEligible) {
      alert("Make a trade with at least $100 collateral today to unlock your free spin");
      return;
    }

    setState("shaking");
    setResult(null);

    // TEMP: fake spin result for testing animation
    await new Promise((r) => setTimeout(r, 1800));

    const won = Math.random() < 0.5; // 50% for testing
    setState(won ? "won" : "lost");

    const spinRecord: SpinRecord = {
      id: Math.floor(Math.random() * 1000),
      timestamp: Math.floor(Date.now() / 1000),
      wheel_type: "free",
      tier: won ? "rare" : "nothing",
      prize_description: won ? "$50 Elite Pokemon Gacha Pack" : "Nothing",
      prize_usd: won ? 50 : 0,
      fulfilled: 0,
    };
    setResult(spinRecord);
    onResult(spinRecord);

    setTimeout(() => setState("idle"), 4000);
  }, [publicKey, state, freeEligible, onResult]);

  const disabled = state !== "idle" || !publicKey || !freeEligible;
  const pokeballClass = [
    "pokeball",
    state === "shaking" ? "shaking" : "",
    state === "won" ? "won" : "",
    state === "lost" ? "lost" : "",
    disabled && state === "idle" ? "locked" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="pokeball-container">
      <div className={`pokeball-glow ${!freeEligible || state !== "idle" ? "hidden" : ""}`} />

      <div className={`sparkles ${state === "won" ? "active" : ""}`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="sparkle" />
        ))}
      </div>

      <div className={pokeballClass} onClick={!disabled ? spin : undefined}>
        <div className="pokeball__button" />
      </div>

      <div className="mt-6 text-center">
        {state === "idle" && !freeEligible && (
          <div className="text-xs font-mono text-secondary">TRADE $100+ TO UNLOCK</div>
        )}
        {state === "idle" && freeEligible && (
          <div className="text-xs font-mono text-accent animate-pulse">TAP THE POKEBALL TO SPIN</div>
        )}
        {state === "shaking" && (
          <div className="text-xs font-mono text-secondary animate-pulse">. . .</div>
        )}
      </div>

      {result && state !== "shaking" && (
        <div
          className="mt-4 border p-4 text-center max-w-[300px]"
          style={{
            borderColor: result.tier === "nothing" ? "#333" : "#00ff41",
            backgroundColor: result.tier === "nothing" ? "#111" : "#0a1a0a",
          }}
        >
          <div
            className="text-lg font-bold font-mono"
            style={{ color: result.tier === "nothing" ? "#666" : "#00ff41" }}
          >
            {result.tier === "nothing" ? "IT BROKE FREE..." : "GOTCHA!"}
          </div>
          {result.tier !== "nothing" ? (
            <>
              <div className="text-xs text-secondary mt-1 font-mono">
                {result.prize_description}
              </div>
              <div className="text-xs text-accent mt-2 font-mono animate-pulse">
                Opening pack — card incoming to your wallet...
              </div>
              <a
                href="https://collectorcrypt.com"
                target="_blank"
                rel="noopener"
                className="inline-block mt-3 px-4 py-2 text-xs font-mono border border-accent text-accent hover:bg-accent/10 transition-colors"
              >
                VIEW ON COLLECTOR CRYPT
              </a>
            </>
          ) : (
            <div className="text-xs text-secondary mt-1 font-mono">
              Better luck tomorrow
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RewardsPage() {
  const { publicKey, connected } = useWallet();
  const [history, setHistory] = useState<SpinRecord[]>([]);
  const [freeEligible, setFreeEligible] = useState(true); // TEMP: always eligible for testing
  const [eligibility, setEligibility] = useState<{
    has_traded_today: boolean;
    has_used_free_spin: boolean;
  } | null>({ has_traded_today: true, has_used_free_spin: false }); // TEMP: always show available

  // TEMP: disabled server checks for animation testing
  // useEffect(() => { ... }, [publicKey]);

  const handleResult = (r: SpinRecord | null) => {
    if (r) {
      setHistory((prev) => [r, ...prev]);
      if (r.wheel_type === "free") setFreeEligible(false);
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: pokeballStyles }} />
      <div className="min-h-screen bg-bg font-mono text-primary px-4 py-8">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-2xl md:text-3xl font-bold tracking-wider mb-2">
              DAILY CATCH
            </h1>
            <p className="text-sm text-secondary">
              Trade $100+. Spin once daily. Win a real graded Pokemon card.
            </p>
            <p className="text-xs text-secondary mt-1">
              Powered by{" "}
              <a
                href="https://collectorcrypt.com"
                target="_blank"
                rel="noopener"
                className="text-accent hover:underline"
              >
                Collector Crypt
              </a>{" "}
              — every card is redeemable for the physical card.
            </p>
          </div>

          {connected && eligibility && (
            <div className="text-center mb-6 text-xs font-mono">
              {eligibility.has_used_free_spin ? (
                <span className="text-secondary">
                  Spin used today — come back tomorrow
                </span>
              ) : eligibility.has_traded_today ? (
                <span className="text-accent">Spin available!</span>
              ) : (
                <span className="text-secondary">
                  Make a $100+ trade to unlock today&apos;s spin
                </span>
              )}
            </div>
          )}

          {!connected ? (
            <div className="text-center py-16 text-secondary text-sm">
              Connect your wallet to spin
            </div>
          ) : (
            <div className="flex flex-col items-center mb-10">
              <PokeballSpin onResult={handleResult} freeEligible={freeEligible} />
            </div>
          )}

          <div className="border border-border bg-panel p-4 mb-6">
            <h2 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
              HOW IT WORKS
            </h2>
            <div className="space-y-2 text-xs font-mono text-secondary">
              <div className="flex items-start gap-2">
                <span className="text-accent">1.</span>
                <span>Make a trade with $100+ collateral</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-accent">2.</span>
                <span>Tap the Pokeball — 2% chance to catch</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-accent">3.</span>
                <span>
                  Win a <span className="text-primary">$50 Elite Pack</span> from
                  Collector Crypt — a random graded Pokemon card worth $30-$5,000+
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-accent">4.</span>
                <span>Card delivered as pNFT — redeem for the physical card anytime</span>
              </div>
            </div>
          </div>

          {history.length > 0 && (
            <div className="border border-border bg-panel p-4">
              <h2 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
                YOUR CATCH HISTORY
              </h2>
              <div className="space-y-1.5">
                {history.slice(0, 20).map((spin) => (
                  <div
                    key={spin.id}
                    className="flex items-center justify-between text-xs font-mono py-1.5 border-b border-border/30 last:border-0"
                  >
                    <span className="text-secondary">
                      {new Date(spin.timestamp * 1000).toLocaleDateString()}
                    </span>
                    <span
                      style={{
                        color: spin.tier === "nothing" ? "#666" : "#00ff41",
                      }}
                    >
                      {spin.tier === "nothing" ? "Broke free" : spin.prize_description}
                    </span>
                    <span className="text-secondary">
                      {spin.fulfilled === 2
                        ? "✓"
                        : spin.fulfilled === 1
                          ? "..."
                          : spin.tier === "nothing"
                            ? ""
                            : "pending"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
