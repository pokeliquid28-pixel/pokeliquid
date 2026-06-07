"use client";

import { useEffect, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getReadonlyProgram } from "@/lib/program";
import { getMarginAccountPDA } from "@/lib/addresses";

export type Position = {
  index: number;        // slot index 0–4
  oracle: string;       // oracle pubkey (base58) — identifies which market
  direction: "Long" | "Short";
  collateral: number;   // raw
  notional: number;     // raw
  leverage: number;
  entryPrice: number;   // raw
  openTimestamp: number;
  lastFundingTimestamp: number;
  slPrice: number | null;  // raw, or null if not set
  tpPrice: number | null;  // raw, or null if not set
};

export type MarginAccountData = {
  collateral: number;   // raw (free collateral)
  positions: Position[];
  hasOpenPosition: boolean;
  isLoading: boolean;
  exists: boolean;
  error: string | null;
};

const DEFAULT: MarginAccountData = {
  collateral: 0,
  positions: [],
  hasOpenPosition: false,
  isLoading: true,
  exists: false,
  error: null,
};

function decodeDirection(dir: any): "Long" | "Short" {
  if (!dir) return "Long";
  if ("long" in dir || "Long" in dir) return "Long";
  return "Short";
}

export function useMarginAccount(): MarginAccountData & { refresh: () => void } {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [data, setData] = useState<MarginAccountData>(DEFAULT);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const refresh = useCallback(() => setRefreshTrigger((n) => n + 1), []);

  useEffect(() => {
    if (!publicKey) {
      setData({ ...DEFAULT, isLoading: false, exists: false });
      return;
    }

    let cancelled = false;

    const fetch = async () => {
      try {
        const program = getReadonlyProgram(connection);
        const pda = getMarginAccountPDA(publicKey);
        const acc = await (program.account as any).marginAccount.fetch(pda);
        if (cancelled) return;

        const positions: Position[] = [];
        const posArray: any[] = acc.positions ?? [];
        for (let i = 0; i < posArray.length; i++) {
          const p = posArray[i];
          if (p) {
            positions.push({
              index: i,
              oracle: p.oracle?.toBase58?.() ?? "",
              direction: decodeDirection(p.direction),
              collateral: p.collateral.toNumber(),
              notional: p.notional.toNumber(),
              leverage: p.leverage,
              entryPrice: p.entryPrice.toNumber(),
              openTimestamp: p.openTimestamp.toNumber(),
              lastFundingTimestamp: p.lastFundingTimestamp.toNumber(),
              slPrice: p.slPrice ? p.slPrice.toNumber() : null,
              tpPrice: p.tpPrice ? p.tpPrice.toNumber() : null,
            });
          }
        }

        setData({
          collateral: acc.collateral.toNumber(),
          positions,
          hasOpenPosition: positions.length > 0,
          isLoading: false,
          exists: true,
          error: null,
        });
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.message ?? "";
        if (msg.includes("Account does not exist") || e?.code === 3012) {
          // Account not initialized yet — normal state
          setData({ ...DEFAULT, isLoading: false, exists: false, error: null });
        } else if (
          msg.includes("Invalid account discriminator") ||
          msg.includes("unexpected length") ||
          msg.includes("borsh") ||
          msg.includes("expected") && msg.includes("bytes")
        ) {
          // Schema mismatch — old account needs migration
          setData((prev) => ({
            ...prev,
            isLoading: false,
            exists: true,
            error: "schema_mismatch",
          }));
        } else {
          // Transient error (RPC timeout, network issue) — don't show reset popup
          setData((prev) => ({
            ...prev,
            isLoading: false,
            error: null,
          }));
        }
      }
    };

    fetch();
    const id = setInterval(fetch, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connection, publicKey, refreshTrigger]);

  return { ...data, refresh };
}
