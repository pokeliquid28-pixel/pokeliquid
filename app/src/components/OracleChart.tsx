"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { OracleReading } from "@/hooks/useOracle";
import { rawToPrice } from "@/lib/utils";

type Props = {
  readings: OracleReading[];
  width?: number;
  height?: number;
};

export function OracleChart({ readings, height = 120 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const width = containerWidth;

  const { points, minY, maxY, firstPrice, lastPrice } = useMemo(() => {
    if (readings.length === 0) {
      return { points: "", minY: 0, maxY: 0, firstPrice: 0, lastPrice: 0 };
    }

    const src = readings.length === 1 ? [readings[0], readings[0]] : readings;

    const prices = src.map((r) => rawToPrice(r.price));
    const minY = Math.min(...prices);
    const maxY = Math.max(...prices);
    const range = maxY - minY || prices[0] * 0.001;
    const padded = range * 0.1;

    const lo = minY - padded;
    const hi = maxY + padded;
    const totalRange = hi - lo || 1;

    const pts = src
      .map((r, i) => {
        const x = (i / (src.length - 1)) * width;
        const y = height - ((rawToPrice(r.price) - lo) / totalRange) * height;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return {
      points: pts,
      minY,
      maxY,
      firstPrice: prices[0],
      lastPrice: prices[prices.length - 1],
    };
  }, [readings, width, height]);

  if (readings.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex items-center justify-center text-secondary text-xs font-mono w-full"
        style={{ height }}
      >
        Collecting price history...
      </div>
    );
  }

  const trending = lastPrice >= firstPrice;
  const strokeColor = trending ? "#00ff41" : "#ff3333";

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {readings.length >= 2 && (
          <polygon
            points={`${points} ${width},${height} 0,${height}`}
            fill="url(#chart-fill)"
          />
        )}

        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {(() => {
          const last = readings[readings.length - 1];
          const x = width;
          const prices = readings.map((r) => rawToPrice(r.price));
          const lo = Math.min(...prices) - (Math.max(...prices) - Math.min(...prices)) * 0.1;
          const hi = Math.max(...prices) + (Math.max(...prices) - Math.min(...prices)) * 0.1;
          const y = height - ((rawToPrice(last.price) - lo) / (hi - lo)) * height;
          return (
            <circle cx={x} cy={y.toFixed(1)} r="3" fill={strokeColor} />
          );
        })()}
      </svg>

      {/* Y-axis labels */}
      <div className="absolute top-0 right-0 flex flex-col justify-between h-full text-right pr-1">
        <span className="text-[10px] md:text-xs font-mono text-secondary">
          ${maxY.toFixed(2)}
        </span>
        <span className="text-[10px] md:text-xs font-mono text-secondary">
          ${minY.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
