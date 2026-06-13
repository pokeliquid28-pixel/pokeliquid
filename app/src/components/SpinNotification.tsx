"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

const API_BASE = process.env.NEXT_PUBLIC_PRICE_API || "/api/keeper";

export function SpinEligibilityBanner() {
  const { publicKey } = useWallet();
  const [eligible, setEligible] = useState(false);
  const [streakBonus, setStreakBonus] = useState(false);
  const [streak, setStreak] = useState(0);
  const [daysLeft, setDaysLeft] = useState(7);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!publicKey) return;
    const check = () => {
      fetch(`${API_BASE}/spin-eligible?user=${publicKey.toBase58()}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.free_spin_available) setEligible(true);
          if (data.streak_bonus_available) setStreakBonus(true);
          if (typeof data.current_streak === "number") setStreak(data.current_streak);
          if (typeof data.next_streak_bonus === "number") setDaysLeft(data.next_streak_bonus);
        })
        .catch(() => {});
    };
    check();
    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, [publicKey]);

  if ((!eligible && !streakBonus) || dismissed) return null;

  return (
    <div
      className="fixed bottom-16 md:bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-panel border border-accent px-4 py-3 shadow-lg"
      style={{ maxWidth: 440, boxShadow: "0 0 20px rgba(0, 255, 65, 0.2)" }}
    >
      <span className="text-xl">{streakBonus ? "🔥" : "🎰"}</span>
      <div className="flex-1">
        {streakBonus ? (
          <>
            <div className="text-xs font-mono font-bold text-accent">7-DAY STREAK BONUS!</div>
            <div className="text-[10px] font-mono text-secondary">Claim your bonus spin — 25% gacha / 75% $10 USDC</div>
          </>
        ) : (
          <>
            <div className="text-xs font-mono font-bold text-accent">FREE SPIN AVAILABLE</div>
            <div className="text-[10px] font-mono text-secondary">
              2% chance to win a graded Pokemon card
              {streak > 0 && <span className="text-accent"> · {streak % 7}/7 streak</span>}
            </div>
          </>
        )}
      </div>
      <a
        href="/rewards"
        className="px-3 py-1.5 text-[10px] font-mono font-bold border border-accent text-accent hover:bg-accent/10 transition-colors whitespace-nowrap"
      >
        {streakBonus ? "CLAIM" : "SPIN"}
      </a>
      <button
        onClick={() => setDismissed(true)}
        className="text-secondary hover:text-primary text-sm ml-1"
      >
        ✕
      </button>
    </div>
  );
}
