"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "pokeliquid_risk_accepted";

export function RiskDisclaimer() {
  const [accepted, setAccepted] = useState(true); // default true to avoid flash

  useEffect(() => {
    setAccepted(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  if (accepted) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-bg flex items-center justify-center p-4">
      <div className="max-w-md w-full border border-border bg-panel p-6 md:p-8">
        <h1 className="text-lg font-bold text-primary mb-4">Risk Disclosure</h1>

        <div className="text-[11px] text-secondary leading-relaxed space-y-3 mb-6">
          <p>
            Pokeliquid is experimental software.
            Trading perpetual futures involves substantial
            risk of loss including loss of your entire deposit.
          </p>
          <p>By continuing you confirm:</p>
          <ul className="space-y-1.5 ml-1">
            <li className="flex gap-2">
              <span className="text-primary shrink-0">-</span>
              <span>You are not a US person as defined by applicable law</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary shrink-0">-</span>
              <span>You are legally permitted to use this service in your jurisdiction</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary shrink-0">-</span>
              <span>You understand smart contracts may contain bugs</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary shrink-0">-</span>
              <span>You understand the oracle may fail or be manipulated</span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary shrink-0">-</span>
              <span>You accept all risks associated with experimental DeFi software</span>
            </li>
          </ul>
          <p className="text-primary/80 italic">This is not financial advice.</p>
        </div>

        <button
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "1");
            setAccepted(true);
          }}
          className="w-full py-3 bg-long text-bg font-bold text-[12px] uppercase tracking-wider hover:opacity-90 transition-opacity"
        >
          I understand, let me trade
        </button>

        <p className="text-[9px] text-secondary/50 text-center mt-3 leading-relaxed">
          If you are a US person or resident of a restricted
          jurisdiction please do not use this platform.
        </p>
      </div>
    </div>
  );
}
