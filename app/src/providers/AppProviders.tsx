"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { SessionWalletAdapter } from "@/lib/session-wallet";
import { SessionWalletProvider } from "@/providers/SessionWalletProvider";
import { NotificationProvider } from "@/providers/NotificationProvider";
import { ToastContainer } from "@/components/ToastContainer";

const RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT!;

export function AppProviders({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new SessionWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={wallets} autoConnect>
        <SessionWalletProvider>
          <NotificationProvider>
            {children}
            <ToastContainer />
          </NotificationProvider>
        </SessionWalletProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
