"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { SessionWalletAdapter } from "@/lib/session-wallet";
import { SessionWalletProvider } from "@/providers/SessionWalletProvider";
import { NotificationProvider } from "@/providers/NotificationProvider";
import { ToastContainer } from "@/components/ToastContainer";

const RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT ?? "https://api.mainnet-beta.solana.com";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const wallets = useMemo(
    () => [new SessionWalletAdapter()],
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
