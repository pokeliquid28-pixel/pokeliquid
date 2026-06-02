"use client";

import { useState } from "react";
import { MARKETS, Market } from "@/lib/markets";

export function useMarket() {
  const liveMarkets = MARKETS.filter((m) => m.live);
  const [selectedMarket, setSelectedMarket] = useState<Market>(
    liveMarkets[0] ?? MARKETS[0]
  );

  return { markets: MARKETS, selectedMarket, setSelectedMarket };
}
