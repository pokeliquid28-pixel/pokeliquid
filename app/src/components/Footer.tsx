"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-panel px-4 py-3 text-center text-[9px] text-secondary/50 leading-relaxed hidden md:block">
      <p>
        Experimental software. Not financial advice. Not available to US persons. Use at your own risk.
      </p>
      <p className="mt-1">
        <Link href="/terms" className="underline hover:text-secondary">Terms of Service</Link>
        <span className="mx-2">|</span>
        <Link href="/privacy" className="underline hover:text-secondary">Privacy Policy</Link>
      </p>
    </footer>
  );
}
