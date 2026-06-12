"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

const API_BASE = process.env.NEXT_PUBLIC_PRICE_API || "/api/keeper";

/**
 * After a trade, check if the user unlocked a free spin.
 * Shows a popup linking to /rewards.
 */
export function useSpinCheck() {
  const { publicKey } = useWallet();
  const [showSpinPopup, setShowSpinPopup] = useState(false);

  const checkSpin = async () => {
    if (!publicKey) return;
    try {
      const res = await fetch(`${API_BASE}/spin-eligible?user=${publicKey.toBase58()}`);
      const data = await res.json();
      if (data.free_spin_available) {
        setShowSpinPopup(true);
      }
    } catch {}
  };

  return { showSpinPopup, setShowSpinPopup, checkSpin };
}

export function SpinPopup({ show, onClose }: { show: boolean; onClose: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      // Small delay so it appears after the trade success message
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [show]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="bg-panel border border-accent p-6 max-w-sm mx-4 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-3xl mb-3">🎰</div>
        <div className="text-lg font-bold font-mono text-accent mb-2">
          FREE SPIN UNLOCKED
        </div>
        <div className="text-xs text-secondary font-mono mb-4">
          You made a qualifying trade today. Spin the Poke Roulette for a chance to win a $50 graded Pokemon card!
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-xs font-mono border border-border text-secondary hover:text-primary transition-colors"
          >
            LATER
          </button>
          <a
            href="/rewards"
            className="flex-1 py-2 text-xs font-mono font-bold border-2 border-accent text-accent hover:bg-accent/10 transition-colors text-center"
          >
            SPIN NOW
          </a>
        </div>
      </div>
    </div>
  );
}
