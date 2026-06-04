import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/providers/AppProviders";
import { Header } from "@/components/Header";
import { SaveWalletSheet } from "@/components/SaveWalletSheet";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Pokeliquid | Pokemon Card Perps",
  description: "Pokémon card perpetual futures on Solana",
  icons: {
    icon: "/favicon.png",
    apple: "/logo-192.png",
  },
  openGraph: {
    title: "Pokeliquid | Pokemon Card Perps",
    description: "Pokémon card perpetual futures on Solana",
    siteName: "Pokeliquid",
    images: [{ url: "/logo-512.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary",
    title: "Pokeliquid | Pokemon Card Perps",
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
      <body className="overflow-x-hidden bg-bg">
        <AppProviders>
          <Header />
          <main className="pb-[60px] md:pb-0">
            <ErrorBoundary>{children}</ErrorBoundary>
          </main>
          <SaveWalletSheet />
        </AppProviders>
      </body>
    </html>
  );
}
