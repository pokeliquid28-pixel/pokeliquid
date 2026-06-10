"use client";

import { useOracle } from "@/hooks/useOracle";
import { Market } from "@/lib/markets";

/* eslint-disable @next/next/no-img-element */

export function BinderCard({
  market,
  onTrade,
}: {
  market: Market;
  onTrade: (m: Market) => void;
}) {
  const { price, readings, isLoading } = useOracle(market.oracleAddress, market.priceApiMarket);
  const priceUsd = price / 1_000_000;

  let pctChange = 0;
  if (readings.length >= 2) {
    const oldest = readings[0].price / 1_000_000;
    if (oldest > 0) pctChange = ((priceUsd - oldest) / oldest) * 100;
  }

  const noPrice = !isLoading && price === 0;
  const disabled = !market.live || noPrice;

  return (
    <button
      onClick={() => !disabled && onTrade(market)}
      disabled={disabled}
      className="group relative flex flex-col text-left transition-all duration-200"
      style={{
        background: "#111111",
        border: "1px solid #1a1a1a",
        borderRadius: 12,
        overflow: "hidden",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {/* SOON badge */}
      {!market.live && (
        <div
          className="absolute top-2 right-2 z-10 px-2 py-0.5 font-mono font-bold uppercase"
          style={{
            fontSize: 9,
            background: "rgba(0,0,0,0.7)",
            color: "#666",
            border: "1px solid #333",
            borderRadius: 4,
            letterSpacing: "0.1em",
          }}
        >
          SOON
        </div>
      )}

      {/* TRADE affordance */}
      {!disabled && (
        <div
          className="absolute top-2 right-2 z-10 px-2 py-0.5 font-mono font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            fontSize: 9,
            background: "#00ff41",
            color: "#000",
            borderRadius: 4,
            letterSpacing: "0.08em",
          }}
        >
          TRADE
        </div>
      )}

      {/* Card image */}
      <div
        className="relative flex items-center justify-center overflow-hidden group-hover:-translate-y-1 transition-transform duration-200"
        style={{
          padding: "12px 12px 4px",
        }}
      >
        {market.image ? (
          <img
            src={market.image}
            alt={market.name}
            className="w-full h-auto object-contain"
            style={{
              maxHeight: 220,
              filter: disabled ? "grayscale(100%)" : "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
              borderRadius: 6,
            }}
            draggable={false}
          />
        ) : (
          <div
            className="flex items-center justify-center font-mono text-secondary"
            style={{ height: 160, width: "100%", fontSize: 11 }}
          >
            No image
          </div>
        )}

        {/* Hover glow */}
        {!disabled && (
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at center, rgba(0,255,65,0.06) 0%, transparent 70%)",
            }}
          />
        )}
      </div>

      {/* Info section */}
      <div className="px-3 pb-3 pt-2 flex flex-col gap-0.5">
        {/* Card name */}
        <div
          className="font-mono font-bold truncate"
          style={{ color: "#fff", fontSize: 12, lineHeight: 1.3 }}
        >
          {market.name.replace("-PERP", "").split("-").slice(0, 1)[0]}
        </div>

        {/* Subtitle: set + number */}
        <div
          className="font-mono truncate"
          style={{ color: "#555", fontSize: 10, lineHeight: 1.3 }}
        >
          {market.subtitle}
        </div>

        {/* Badge / rarity */}
        {market.badge && (
          <div className="mt-0.5">
            <span
              className="font-mono font-bold uppercase"
              style={{
                fontSize: 8,
                color: "#00ff41",
                border: "1px solid rgba(0,255,65,0.3)",
                padding: "1px 5px",
                borderRadius: 3,
                letterSpacing: "0.1em",
              }}
            >
              {market.badge}
            </span>
          </div>
        )}

        {/* Price row */}
        {market.live && (
          <div className="flex items-baseline gap-2 mt-1.5">
            <span
              className="font-mono font-bold"
              style={{ color: "#fff", fontSize: 15 }}
            >
              {isLoading ? "-.--" : noPrice ? "--" : `$${priceUsd.toFixed(2)}`}
            </span>
            {!isLoading && !noPrice && (
              <span
                className="font-mono font-bold"
                style={{
                  fontSize: 11,
                  color: pctChange >= 0 ? "#00ff41" : "#ff3355",
                }}
              >
                {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(2)}%
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
