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
    width: 160px;
    height: 160px;
    pointer-events: none;
  }

  .sparkles.active .sparkle {
    animation: sparkle-fly 0.9s ease-out forwards;
  }

  .sparkle {
    position: absolute;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    opacity: 0;
    top: 50%;
    left: 50%;
    margin: -5px 0 0 -5px;
  }

  .sparkle:nth-child(3n+1) { background: #ffcc00; box-shadow: 0 0 10px 3px #ffcc00; }
  .sparkle:nth-child(3n+2) { background: #ffffff; box-shadow: 0 0 10px 3px #ffffff; }
  .sparkle:nth-child(3n+3) { background: #00ff41; box-shadow: 0 0 10px 3px #00ff41; }

  .sparkle:nth-child(1)  { --tx: 100px;  --ty: 0px;     animation-delay: 0s; }
  .sparkle:nth-child(2)  { --tx: 70px;   --ty: -70px;   animation-delay: 0.05s; }
  .sparkle:nth-child(3)  { --tx: 0px;    --ty: -100px;  animation-delay: 0.1s; }
  .sparkle:nth-child(4)  { --tx: -70px;  --ty: -70px;   animation-delay: 0.03s; }
  .sparkle:nth-child(5)  { --tx: -100px; --ty: 0px;     animation-delay: 0.08s; }
  .sparkle:nth-child(6)  { --tx: -70px;  --ty: 70px;    animation-delay: 0.12s; }
  .sparkle:nth-child(7)  { --tx: 0px;    --ty: 100px;   animation-delay: 0.02s; }
  .sparkle:nth-child(8)  { --tx: 70px;   --ty: 70px;    animation-delay: 0.07s; }
  .sparkle:nth-child(9)  { --tx: 90px;   --ty: -40px;   animation-delay: 0.15s; }
  .sparkle:nth-child(10) { --tx: -40px;  --ty: -90px;   animation-delay: 0.18s; }
  .sparkle:nth-child(11) { --tx: -90px;  --ty: 40px;    animation-delay: 0.2s; }
  .sparkle:nth-child(12) { --tx: 40px;   --ty: 90px;    animation-delay: 0.22s; }

  @keyframes sparkle-fly {
    0% {
      opacity: 1;
      transform: translate(0, 0) scale(0.5);
    }
    50% {
      opacity: 1;
      transform: translate(calc(var(--tx) * 0.7), calc(var(--ty) * 0.7)) scale(1.8);
    }
    100% {
      opacity: 0;
      transform: translate(var(--tx), var(--ty)) scale(0);
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

  .pokeball.glow {
    box-shadow:
      0 0 15px rgba(0, 255, 65, 0.4),
      0 0 30px rgba(0, 255, 65, 0.2),
      0 0 60px rgba(0, 255, 65, 0.1),
      inset -8px 8px 0 8px rgba(0,0,0,0.05);
    animation: pokeball-glow-pulse 2s ease-in-out infinite;
  }

  @keyframes pokeball-glow-pulse {
    0%, 100% { box-shadow: 0 0 15px rgba(0,255,65,0.3), 0 0 30px rgba(0,255,65,0.15), 0 0 60px rgba(0,255,65,0.05), inset -8px 8px 0 8px rgba(0,0,0,0.05); }
    50%      { box-shadow: 0 0 20px rgba(0,255,65,0.5), 0 0 40px rgba(0,255,65,0.25), 0 0 80px rgba(0,255,65,0.1), inset -8px 8px 0 8px rgba(0,0,0,0.05); }
  }
`;

// ── Pokeball Component ───────────────────────────────────────────────────────

type PokeballState = "idle" | "shaking" | "won" | "lost";

function PokeballSpin({
  onResult,
  freeEligible,
  onWin,
  wheelType = "free",
}: {
  onResult: (r: SpinRecord | null) => void;
  freeEligible: boolean;
  onWin: (spinId: number) => void;
  wheelType?: string;
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

    try {
      const res = await fetch(`${API_BASE}/spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: publicKey.toBase58(), wheel: wheelType }),
      });
      const data = await res.json();

      if (!data.success) {
        alert(data.error || "Spin failed");
        setState("idle");
        return;
      }

      await new Promise((r) => setTimeout(r, 1800));

      const won = data.tier !== "nothing";
      setState(won ? "won" : "lost");
      if (won) onWin(data.spin_id);

      const spinRecord: SpinRecord = {
        id: data.spin_id,
        timestamp: Math.floor(Date.now() / 1000),
        wheel_type: wheelType,
        tier: data.tier,
        prize_description: data.prize_description,
        prize_usd: data.prize_usd,
        fulfilled: 0,
      };
      setResult(spinRecord);
      onResult(spinRecord);

      setTimeout(() => setState("idle"), 4000);
    } catch {
      alert("Failed to connect to server");
      setState("idle");
    }
  }, [publicKey, state, freeEligible, onResult]);

  const disabled = state !== "idle" || !publicKey || !freeEligible;
  const pokeballClass = [
    "pokeball",
    state === "shaking" ? "shaking" : "",
    state === "won" ? "won" : "",
    state === "lost" ? "lost" : "",
    disabled && state === "idle" ? "locked" : "",
    freeEligible && state === "idle" ? "glow" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="pokeball-container">
      <div style={{ position: "relative", width: 172, height: 172 }}>
        <div className={`sparkles ${state === "won" ? "active" : ""}`}
          style={{ position: "absolute", top: 0, left: 0, width: 172, height: 172 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="sparkle" />
          ))}
        </div>

        <div className={pokeballClass} onClick={!disabled ? spin : undefined}>
          <div className="pokeball__button" />
        </div>
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

// ── Won Card Display ─────────────────────────────────────────────────────────

function WonCardReveal({ spinId, userPubkey, onClose }: { spinId: number; userPubkey: string; onClose: () => void }) {
  const [card, setCard] = useState<{ name: string; image: string; nft: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      for (let i = 0; i < 20; i++) {
        try {
          const res = await fetch(`${API_BASE}/spins?user=${userPubkey}&limit=10`);
          const data = await res.json();
          const spin = (data.spins || []).find((s: { id: number; nft_mint?: string; fulfilled: number }) => s.id === spinId);
          if (spin?.nft_mint && spin.fulfilled === 2) {
            const rpcUrl = "https://mainnet.helius-rpc.com/?api-key=358c9ec3-db8b-46a1-ac6c-d702d3a19340";
            const metaRes = await fetch(rpcUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: spin.nft_mint } }),
            });
            const metaData = await metaRes.json();
            const asset = metaData.result;
            if (!cancelled && asset) {
              setCard({
                name: asset.content?.metadata?.name || "Pokemon Card",
                image: asset.content?.links?.image || asset.content?.files?.[0]?.uri || "",
                nft: spin.nft_mint,
              });
              setLoading(false);
              setTimeout(() => setRevealed(true), 300);
              return;
            }
          }
        } catch {}
        await new Promise(r => setTimeout(r, 3000));
      }
      if (!cancelled) setLoading(false);
    };
    poll();
    return () => { cancelled = true; };
  }, [spinId, userPubkey]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.85)", backdropFilter: "blur(8px)" }}
      onClick={!loading ? onClose : undefined}
    >
      <div
        className="flex flex-col items-center max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="text-center">
            <div className="text-2xl mb-4">✨</div>
            <div className="text-sm font-mono text-accent animate-pulse">Opening your pack...</div>
            <div className="text-xs font-mono text-secondary mt-2">Your card is being revealed</div>
          </div>
        ) : card ? (
          <div
            className="text-center"
            style={{
              opacity: revealed ? 1 : 0,
              transform: revealed ? "scale(1) translateY(0)" : "scale(0.8) translateY(20px)",
              transition: "all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <div className="text-xs font-mono text-accent font-bold tracking-widest mb-4">
              YOU WON!
            </div>

            {card.image && (
              <div
                className="relative mx-auto mb-4"
                style={{
                  maxWidth: 280,
                  boxShadow: "0 0 30px rgba(0, 255, 65, 0.3), 0 0 60px rgba(0, 255, 65, 0.1), 0 20px 60px rgba(0, 0, 0, 0.5)",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <img
                  src={card.image}
                  alt={card.name}
                  className="w-full"
                  style={{ display: "block" }}
                />
              </div>
            )}

            <div className="text-sm font-mono text-primary font-bold mb-1">
              {card.name}
            </div>
            <div className="text-xs font-mono text-secondary mb-4">
              Graded Pokemon Card — delivered to your wallet
            </div>

            <div className="flex gap-2 justify-center">
              <a
                href={`https://collectorcrypt.com/assets/solana/${card.nft}`}
                target="_blank"
                rel="noopener"
                className="px-4 py-2 text-xs font-mono font-bold border-2 border-accent text-accent hover:bg-accent/10 transition-colors"
              >
                VIEW CARD
              </a>
              <button
                onClick={onClose}
                className="px-4 py-2 text-xs font-mono border border-border text-secondary hover:text-primary transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-sm font-mono text-secondary">Could not load card details</div>
            <button onClick={onClose} className="mt-4 px-4 py-2 text-xs font-mono border border-border text-secondary">CLOSE</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function RewardsPage() {
  const { publicKey, connected } = useWallet();
  const [history, setHistory] = useState<SpinRecord[]>([]);
  const [freeEligible, setFreeEligible] = useState(false);
  const [wonSpinId, setWonSpinId] = useState<number | null>(null);
  const [streakBonusAvailable, setStreakBonusAvailable] = useState(false);
  const [eligibility, setEligibility] = useState<{
    has_traded_today: boolean;
    has_used_free_spin: boolean;
    current_streak?: number;
    next_streak_bonus?: number;
    streak_bonus_available?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    const check = () => {
      fetch(`${API_BASE}/spin-eligible?user=${publicKey.toBase58()}`)
        .then((r) => r.json())
        .then((data) => {
          setFreeEligible(data.free_spin_available);
          setStreakBonusAvailable(data.streak_bonus_available || false);
          setEligibility(data);
        })
        .catch(() => {});
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey) return;
    fetch(`${API_BASE}/spins?user=${publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((data) => setHistory(data.spins || []))
      .catch(() => {});
  }, [publicKey]);

  const handleResult = (r: SpinRecord | null) => {
    if (r) {
      setHistory((prev) => [r, ...prev]);
      if (r.wheel_type === "free") { setFreeEligible(false); }
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

          {/* ── 7-Day Streak Progress ── */}
          {connected && eligibility && typeof eligibility.current_streak === "number" && (
            <div className="border border-border bg-panel p-4 mb-6 max-w-lg mx-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono text-secondary uppercase tracking-wider">7-Day Streak</span>
                <span className="text-xs font-mono text-accent">
                  {eligibility.current_streak % 7}/7
                </span>
              </div>
              <div className="flex gap-1 mb-2">
                {Array.from({ length: 7 }).map((_, i) => {
                  const filled = i < (eligibility.current_streak! % 7 || (eligibility.current_streak! > 0 && eligibility.current_streak! % 7 === 0 ? 7 : 0));
                  return (
                    <div
                      key={i}
                      className="flex-1 h-2 rounded-full transition-all"
                      style={{
                        backgroundColor: filled ? "#00ff41" : "#1a1a1a",
                        boxShadow: filled ? "0 0 6px rgba(0,255,65,0.3)" : "none",
                      }}
                    />
                  );
                })}
              </div>
              <div className="text-[10px] font-mono text-secondary text-center">
                {eligibility.next_streak_bonus === 0 || (eligibility.current_streak! > 0 && eligibility.current_streak! % 7 === 0)
                  ? "Streak bonus unlocked! 🎉"
                  : `${eligibility.next_streak_bonus} more day${eligibility.next_streak_bonus === 1 ? "" : "s"} until bonus — 25% gacha / 75% $10 USDC`}
              </div>
            </div>
          )}

          {!connected ? (
            <div className="text-center py-16 text-secondary text-sm">
              Connect your wallet to spin
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center mb-10">
                <PokeballSpin onResult={handleResult} freeEligible={freeEligible} onWin={(id) => setWonSpinId(id)} />
              </div>

              {/* ── Streak Bonus Spin ── */}
              {streakBonusAvailable && (
                <div className="flex flex-col items-center mb-10 border border-accent/30 bg-accent/5 rounded-lg p-6">
                  <div className="text-xs font-mono text-accent font-bold tracking-widest mb-1">7-DAY STREAK BONUS</div>
                  <div className="text-[10px] font-mono text-secondary mb-4">25% gacha pack / 75% $10 USDC</div>
                  <PokeballSpin
                    onResult={(r) => {
                      if (r) {
                        setHistory((prev) => [r, ...prev]);
                        setStreakBonusAvailable(false);
                      }
                    }}
                    freeEligible={true}
                    onWin={(id) => setWonSpinId(id)}
                    wheelType="streak"
                  />
                </div>
              )}
            </>
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
              <div className="flex items-start gap-2">
                <span className="text-accent">5.</span>
                <span>
                  Spin 7 days in a row for a <span className="text-primary">streak bonus</span> — 25% chance at another gacha pack, otherwise $10 USDC
                </span>
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

      {wonSpinId && publicKey && (
        <WonCardReveal
          spinId={wonSpinId}
          userPubkey={publicKey.toBase58()}
          onClose={() => setWonSpinId(null)}
        />
      )}
    </>
  );
}
