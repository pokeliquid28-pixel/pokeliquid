"use client";

import { rawToUsdc } from "@/lib/utils";

type Props = {
  totalLong: number;  // raw
  totalShort: number; // raw
  maxLong: number;    // raw
  maxShort: number;   // raw
};

export function LongShortBar({ totalLong, totalShort, maxLong, maxShort }: Props) {
  const total = totalLong + totalShort;
  const hasPositions = total > 0;
  const longPct = hasPositions ? (totalLong / total) * 100 : 50;
  const shortPct = 100 - longPct;

  const fmt = (raw: number) =>
    "$" + rawToUsdc(raw).toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] md:text-xs font-mono">
        <span className={hasPositions ? "text-long font-semibold" : "text-secondary"}>
          LONG {hasPositions ? `${longPct.toFixed(1)}%` : "—"}
        </span>
        <span className={hasPositions ? "text-short font-semibold" : "text-secondary"}>
          SHORT {hasPositions ? `${shortPct.toFixed(1)}%` : "—"}
        </span>
      </div>
      <div className="h-2 flex overflow-hidden bg-border">
        {hasPositions ? (
          <>
            <div className="bg-long transition-all duration-500" style={{ width: `${longPct}%` }} />
            <div className="bg-short transition-all duration-500" style={{ width: `${shortPct}%` }} />
          </>
        ) : (
          <div className="bg-border w-full" />
        )}
      </div>
      <div className="flex justify-between text-[10px] md:text-xs font-mono text-secondary">
        <span>
          {fmt(totalLong)}
          {maxLong > 0 && <span className="hidden md:inline text-secondary/50"> / max {fmt(maxLong)}</span>}
        </span>
        <span>
          {maxShort > 0 && <span className="hidden md:inline text-secondary/50">max {fmt(maxShort)} / </span>}
          {fmt(totalShort)}
        </span>
      </div>
    </div>
  );
}
