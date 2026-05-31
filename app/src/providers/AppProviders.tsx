"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { NotificationProvider } from "@/providers/NotificationProvider";
import { ToastContainer } from "@/components/ToastContainer";

// Default styles for wallet modal
import "@solana/wallet-adapter-react-ui/styles.css";

const RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.devnet.solana.com";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      // Backpack uses standard wallet detection; add if package is installed:
      // new BackpackWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <NotificationProvider>
            {children}
            <ToastContainer />
          </NotificationProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
