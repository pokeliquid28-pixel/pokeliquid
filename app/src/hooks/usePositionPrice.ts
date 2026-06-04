"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getReadonlyProgram } from "@/lib/program";

export function usePositionPrice(oracleAddress: string): number {
  const { connection } = useConnection();
  const [price, setPrice] = useState(0);

  useEffect(() => {
    if (!oracleAddress) return;
    let cancelled = false;
    let pubkey: PublicKey;
    try {
      pubkey = new PublicKey(oracleAddress);
    } catch {
      return;
    }

    const fetch = async () => {
      try {
        const program = getReadonlyProgram(connection);
        const oracle = await (program.account as any).oracleAccount.fetch(pubkey);
        if (!cancelled) setPrice(oracle.price.toNumber());
      } catch { /* ignore */ }
    };

    fetch();
    const id = setInterval(fetch, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [connection, oracleAddress]);

  return price;
}
