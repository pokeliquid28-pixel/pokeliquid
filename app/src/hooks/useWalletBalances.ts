"use client";

import { useEffect, useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { USDC_MINT } from "@/lib/addresses";

export type WalletBalances = {
  solLamports: number;
  usdcRaw: number;
  usdcAta: string | null;
  isLoading: boolean;
};

export function useWalletBalances(): WalletBalances & { refresh: () => void } {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [solLamports, setSolLamports] = useState(0);
  const [usdcRaw, setUsdcRaw] = useState(0);
  const [usdcAta, setUsdcAta] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = useCallback(() => setRefreshTrigger((n) => n + 1), []);

  useEffect(() => {
    if (!publicKey) {
      setSolLamports(0);
      setUsdcRaw(0);
      setUsdcAta(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetch = async () => {
      try {
        const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        if (cancelled) return;

        const [sol, tokenAccounts] = await Promise.all([
          connection.getBalance(publicKey),
          connection.getTokenAccountsByOwner(publicKey, { mint: USDC_MINT }),
        ]);

        if (cancelled) return;

        setSolLamports(sol);
        setUsdcAta(ata.toBase58());

        const ta = tokenAccounts.value[0];
        if (ta) {
          const info = await connection.getTokenAccountBalance(ta.pubkey);
          if (!cancelled) {
            setUsdcRaw(Number(info.value.amount));
          }
        } else {
          setUsdcRaw(0);
        }
        setIsLoading(false);
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetch();
    const id = setInterval(fetch, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connection, publicKey, refreshTrigger]);

  return { solLamports, usdcRaw, usdcAta, isLoading, refresh };
}
