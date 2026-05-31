"use client";

export function DevnetBanner() {
  return (
    <div className="w-full bg-yellow-400 text-black py-1.5 text-center text-[10px] md:text-xs font-bold tracking-widest uppercase">
      <span className="hidden md:inline">⚠ DEVNET — NOT REAL MONEY — TESTNET ONLY ⚠</span>
      <span className="md:hidden">⚠ DEVNET — TEST ONLY ⚠</span>
    </div>
  );
}
