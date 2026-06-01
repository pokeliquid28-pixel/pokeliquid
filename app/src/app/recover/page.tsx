"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Keypair } from "@solana/web3.js";
import { setSessionFromPrivateKey } from "@/lib/session-wallet";

type Status = "loading" | "success" | "error" | "expired";

function RecoverContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");

  const [status, setStatus] = useState<Status>("loading");
  const [publicKey, setPublicKey] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No recovery token provided");
      return;
    }

    recoverWallet(token);
  }, [token]);

  async function recoverWallet(token: string) {
    try {
      const res = await fetch(`/api/recover-wallet?token=${encodeURIComponent(token)}`);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 404) {
          setStatus("expired");
        } else {
          setStatus("error");
          setErrorMsg(data.error || "Recovery failed");
        }
        return;
      }

      const secretKey: number[] = JSON.parse(data.privateKey);
      const kp = Keypair.fromSecretKey(new Uint8Array(secretKey));
      setSessionFromPrivateKey(secretKey);
      setPublicKey(kp.publicKey.toBase58());
      setStatus("success");

      setTimeout(() => router.push("/"), 3000);
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e?.message ?? "Recovery failed");
    }
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md border border-border bg-panel p-6 md:p-8">
        {status === "loading" && (
          <div className="text-center space-y-4">
            <div className="text-2xl">🔄</div>
            <h1 className="text-lg font-bold text-primary">Restoring your wallet...</h1>
            <p className="text-sm text-secondary">Please wait a moment.</p>
            <div className="skeleton h-2 w-48 mx-auto" />
          </div>
        )}

        {status === "success" && (
          <div className="text-center space-y-4">
            <div className="text-3xl">✅</div>
            <h1 className="text-lg font-bold text-long">Wallet restored!</h1>
            <p className="text-sm text-secondary">
              Your positions are back. Redirecting to trade...
            </p>
            <div className="bg-bg border border-border p-3 text-xs font-mono text-secondary break-all">
              {publicKey}
            </div>
          </div>
        )}

        {status === "expired" && (
          <div className="text-center space-y-4">
            <div className="text-3xl">⏰</div>
            <h1 className="text-lg font-bold text-yellow-400">Link expired</h1>
            <p className="text-sm text-secondary">
              This recovery link has already been used or has expired.
            </p>
            <p className="text-xs text-secondary">
              You can save your wallet again from the trade page to get a new link.
            </p>
            <button
              onClick={() => router.push("/")}
              className="w-full py-2.5 text-xs font-bold border border-border text-primary hover:bg-border/20 transition-colors"
            >
              Go to Trade
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="text-center space-y-4">
            <div className="text-3xl">❌</div>
            <h1 className="text-lg font-bold text-short">Recovery failed</h1>
            <p className="text-sm text-secondary">{errorMsg}</p>
            <button
              onClick={() => router.push("/")}
              className="w-full py-2.5 text-xs font-bold border border-border text-primary hover:bg-border/20 transition-colors"
            >
              Go to Trade
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecoverPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="skeleton h-8 w-48" />
        </div>
      }
    >
      <RecoverContent />
    </Suspense>
  );
}
