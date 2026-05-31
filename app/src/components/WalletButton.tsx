"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { shortenAddress } from "@/lib/utils";

export function WalletButton() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    const addr = publicKey.toBase58();
    return (
      <div className="flex items-center gap-1.5 md:gap-2">
        <span className="text-[10px] md:text-xs font-mono text-secondary">
          {addr.slice(0, 4)}...{addr.slice(-4)}
        </span>
        <button
          onClick={() => disconnect()}
          className="px-2 md:px-3 py-1.5 text-[10px] md:text-xs border border-border text-secondary hover:text-primary hover:border-primary/50 transition-colors min-h-[36px] md:min-h-0"
        >
          <span className="hidden md:inline">Disconnect</span>
          <span className="md:hidden">✕</span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setVisible(true)}
      className="px-3 md:px-4 py-1.5 text-xs md:text-sm font-semibold holo-bg text-black hover:opacity-90 transition-opacity min-h-[36px] md:min-h-0"
    >
      <span className="hidden md:inline">Connect Wallet</span>
      <span className="md:hidden">Connect</span>
    </button>
  );
}
