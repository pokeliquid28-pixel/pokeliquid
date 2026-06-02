"use client";

export function DevnetBanner() {
  return (
    <div
      className="badge-devnet w-full flex items-center justify-center"
      style={{
        background: "rgba(255,51,85,.08)",
        border: "1px solid rgba(255,51,85,.4)",
        color: "#ff8099",
        fontSize: "9px",
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        padding: "4px 0",
      }}
    >
      <span className="hidden md:inline">DEVNET — NOT REAL MONEY — TESTNET ONLY</span>
      <span className="md:hidden">DEVNET — TEST ONLY</span>
    </div>
  );
}
