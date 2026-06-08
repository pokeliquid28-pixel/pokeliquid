"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { TradeHistory } from "@/components/TradeHistory";
import { PnlExportButton } from "@/components/PnlExport";

export default function TradesPage() {
  return (
    <AuthGuard>
      <div
        style={{
          minHeight: "100vh",
          backgroundColor: "#0a0a0a",
          fontFamily: "'JetBrains Mono', 'Fira Mono', 'Consolas', monospace",
          padding: "32px 16px 100px",
        }}
      >
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "0.05em" }}>
                TRADE HISTORY
              </div>
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                Full history of all your trades. Auto-refreshes every 15s.
              </div>
            </div>
            <PnlExportButton />
          </div>
          <TradeHistory expanded />
        </div>
      </div>
    </AuthGuard>
  );
}
