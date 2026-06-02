import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/providers/AppProviders";
import { DevnetBanner } from "@/components/DevnetBanner";
import { Header } from "@/components/Header";
import { SaveWalletSheet } from "@/components/SaveWalletSheet";
import { PROGRAM_ID, USDC_MINT } from "@/lib/addresses";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Pokeliquid | PRISMATIC-ETB-PERP",
  description: "Pokémon card perpetual futures on Solana",
  icons: {
    icon: "/favicon.png",
    apple: "/logo-192.png",
  },
  openGraph: {
    title: "Pokeliquid | PRISMATIC-ETB-PERP",
    description: "Pokémon card perpetual futures on Solana",
    siteName: "Pokeliquid",
    images: [{ url: "/logo-512.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary",
    title: "Pokeliquid | PRISMATIC-ETB-PERP",
    description: "Pokémon card perpetual futures on Solana",
    images: ["/logo-512.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="overflow-x-hidden">
        <AppProviders>
          <DevnetBanner />
          <Header />
          <main className="min-h-screen">{children}</main>
          <SaveWalletSheet />
          <footer className="border-t border-border mt-8 md:mt-16 py-4 md:py-6 px-4 md:px-6">
            <div className="max-w-7xl mx-auto flex flex-col items-center gap-2 text-[10px] md:text-xs text-secondary font-mono text-center">
              <div className="flex items-center gap-2 md:gap-4 flex-wrap justify-center">
                <span className="text-short font-semibold">DEVNET ONLY</span>
                <span className="hidden md:inline">Program: {PROGRAM_ID.toBase58()}</span>
                <span className="md:hidden">Program: {PROGRAM_ID.toBase58().slice(0, 8)}...{PROGRAM_ID.toBase58().slice(-4)}</span>
              </div>
              <div className="flex items-center gap-2 md:gap-4 flex-wrap justify-center">
                <span className="hidden md:inline">USDC: {USDC_MINT.toBase58()}</span>
                <span className="md:hidden">USDC: {USDC_MINT.toBase58().slice(0, 8)}...{USDC_MINT.toBase58().slice(-4)}</span>
                <span>PRISMATIC-ETB-PERP</span>
              </div>
            </div>
          </footer>
        </AppProviders>
      </body>
    </html>
  );
}
