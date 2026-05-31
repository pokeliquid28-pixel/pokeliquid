"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOracle } from "@/hooks/useOracle";
import { useProtocolState } from "@/hooks/useProtocolState";
import { useMarginAccount } from "@/hooks/useMarginAccount";
import { OracleChart } from "@/components/OracleChart";
import { LongShortBar } from "@/components/LongShortBar";
import { TradingPanel } from "@/components/TradingPanel";
import { PositionPanel } from "@/components/PositionPanel";
import { TradeHistory } from "@/components/TradeHistory";
import { CollateralPanel } from "@/components/CollateralPanel";
import { Skeleton } from "@/components/Skeleton";
import { formatPrice, rawToPrice, timeSince } from "@/lib/utils";

function PriceTicker({ price, isLoading }: { price: number; isLoading: boolean }) {
  const prevPrice = useRef(price);
  const [flashClass, setFlashClass] = useState("");

  useEffect(() => {
    if (price === prevPrice.current || prevPrice.current === 0) {
      prevPrice.current = price;
      return;
    }
    setFlashClass(price > prevPrice.current ? "price-flash-up" : "price-flash-down");
    prevPrice.current = price;
    const t = setTimeout(() => setFlashClass(""), 800);
    return () => clearTimeout(t);
  }, [price]);

  if (isLoading) {
    return <Skeleton height="h-10" width="w-48 md:w-64" />;
  }

  return (
    <div className={`inline-block rounded-sm ${flashClass}`}>
      <span className="holo-text font-mono text-3xl md:text-4xl font-bold">
        ${rawToPrice(price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

export default function TradePage() {
  const oracle = useOracle();
  const protocol = useProtocolState();
  const margin = useMarginAccount();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="mb-4 md:mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:gap-4">
          {/* Product image */}
          <div className="flex-shrink-0 flex flex-row sm:flex-col items-center gap-3 sm:gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://product-images.tcgplayer.com/fit-in/400x400/593355.jpg"
              alt="Prismatic Evolutions ETB"
              width={120}
              height={120}
              className="etb-image rounded-sm object-contain w-16 h-16 md:w-[120px] md:h-[120px]"
            />
            <span className="text-[10px] font-mono text-secondary tracking-wider uppercase">
              Prismatic Evolutions ETB
            </span>
          </div>

          {/* Ticker + status */}
          <div>
            <p className="text-[10px] md:text-xs text-secondary font-mono uppercase tracking-wider mb-1">
              PRISMATIC-ETB-PERP
            </p>
            <PriceTicker price={oracle.price} isLoading={oracle.isLoading} />
            <div className="flex items-center gap-2 md:gap-3 text-[10px] md:text-xs font-mono text-secondary mt-2 flex-wrap">
              {oracle.isStale && (
                <span className="text-short border border-short px-2 py-0.5">
                  STALE
                </span>
              )}
              {oracle.lastUpdated > 0 && (
                <span>Updated {timeSince(oracle.lastUpdated)}</span>
              )}
              {protocol.isPaused && (
                <span className="text-short border border-short px-2 py-0.5 font-bold">
                  PAUSED
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main layout: stacked on mobile, 60/40 on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-6">
        {/* Left: chart + analytics */}
        <div className="lg:col-span-3 space-y-4 md:space-y-6">
          {/* Price chart */}
          <div className="border border-border bg-panel p-3 md:p-5">
            <div className="flex justify-between items-center mb-3 md:mb-4">
              <h2 className="text-[10px] md:text-xs font-semibold text-secondary uppercase tracking-wider">
                <span className="hidden md:inline">PRISMATIC-ETB-PERP · Price Chart (last 50 readings)</span>
                <span className="md:hidden">Price Chart</span>
              </h2>
              <span className="text-[10px] md:text-xs font-mono text-secondary">
                {oracle.readings.length} / 50
              </span>
            </div>
            {oracle.isLoading ? (
              <Skeleton height="h-[200px] md:h-28" />
            ) : (
              <div className="h-[200px] md:h-auto">
                <OracleChart readings={oracle.readings} height={200} />
              </div>
            )}
          </div>

          {/* Long/short ratio */}
          <div className="border border-border bg-panel p-3 md:p-5">
            <h2 className="text-[10px] md:text-xs font-semibold text-secondary uppercase tracking-wider mb-3 md:mb-4">
              Open Interest
            </h2>
            {protocol.isLoading ? (
              <Skeleton height="h-8" />
            ) : (
              <LongShortBar
                totalLong={protocol.totalLongExposure}
                totalShort={protocol.totalShortExposure}
                maxLong={protocol.maxLongExposure}
                maxShort={protocol.maxShortExposure}
              />
            )}
          </div>

          {/* Position panel below chart */}
          <PositionPanel oracle={oracle} margin={margin} protocol={protocol} onRefresh={handleRefresh} />

          {/* Trade history */}
          <TradeHistory />
        </div>

        {/* Right: collateral + trading panel */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          <CollateralPanel margin={margin} onRefresh={handleRefresh} />
          <TradingPanel
            key={refreshKey}
            oracle={oracle}
            protocol={protocol}
            margin={margin}
            onRefresh={handleRefresh}
          />
        </div>
      </div>
    </div>
  );
}
