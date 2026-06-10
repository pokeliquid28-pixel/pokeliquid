"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { Keypair } from "@solana/web3.js";
import {
  setSessionFromPrivateKey,
  setSavedEmail,
  saveSessionKeypair,
  createGuestWallet,
  SessionWalletName,
} from "@/lib/session-wallet";
import { Logo } from "@/components/Logo";

/* eslint-disable @next/next/no-img-element */

type Mode = "signup" | "login";

export default function RefPage() {
  const params = useParams();
  const router = useRouter();
  const username = params.username as string;
  const { select, connected, wallets } = useWallet();

  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showWalletPicker, setShowWalletPicker] = useState(false);

  // Save referrer to localStorage on mount
  useEffect(() => {
    if (username) {
      localStorage.setItem("pokeliquid_referrer", username);
    }
  }, [username]);

  // If already connected, redirect to trade
  useEffect(() => {
    if (connected) {
      router.replace("/");
    }
  }, [connected, router]);

  const externalWallets = wallets.filter(
    (w) =>
      w.adapter.name !== SessionWalletName &&
      (w.adapter.readyState === WalletReadyState.Installed ||
        w.adapter.readyState === WalletReadyState.Loadable)
  );

  function clearFields() {
    setPassword("");
    setConfirmPassword("");
    setError("");
  }

  async function handleSignup() {
    if (!email || !password || !confirmPassword || loading) return;
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    setLoading(true);
    setError("");
    try {
      const kp = Keypair.generate();
      const privateKey = JSON.stringify(Array.from(kp.secretKey));
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, privateKey, publicKey: kp.publicKey.toBase58(), referrer: username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");
      saveSessionKeypair(kp);
      setSavedEmail(email);
      try {
        await fetch("/api/create-session-wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicKey: kp.publicKey.toBase58(), privateKey }),
        });
      } catch {}
      select(SessionWalletName);
    } catch (e: any) {
      setError(e?.message ?? "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (!email || !password || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      const secretKey: number[] = JSON.parse(data.privateKey);
      setSessionFromPrivateKey(secretKey);
      setSavedEmail(email);
      saveSessionKeypair(Keypair.fromSecretKey(new Uint8Array(secretKey)));
      select(SessionWalletName);
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGuest() {
    await createGuestWallet();
    select(SessionWalletName);
  }

  function handleSelectWallet(walletName: string) {
    try {
      select(walletName as any);
      setShowWalletPicker(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to connect wallet");
    }
  }

  const signupValid =
    email && password && confirmPassword && password.length >= 6 && password === confirmPassword;

  // ── Wallet picker ──
  if (showWalletPicker) {
    return (
      <div
        className="h-[100dvh] flex items-center justify-center px-4 overflow-hidden"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="flex justify-center"><Logo width={280} /></div>
          </div>
          <div className="p-6 space-y-4" style={{ backgroundColor: "#111111", border: "1px solid #1a1a1a" }}>
            <h2 className="font-mono text-center text-lg font-bold" style={{ color: "#ffffff" }}>
              Connect Wallet
            </h2>
            <div className="space-y-2">
              {externalWallets.length === 0 ? (
                <p className="text-center text-xs" style={{ color: "#666" }}>
                  No wallets detected. Install{" "}
                  <a href="https://phantom.app" target="_blank" rel="noopener noreferrer" style={{ color: "#00ff41" }}>Phantom</a> or{" "}
                  <a href="https://solflare.com" target="_blank" rel="noopener noreferrer" style={{ color: "#00ff41" }}>Solflare</a>.
                </p>
              ) : (
                externalWallets.map((w) => (
                  <button
                    key={w.adapter.name}
                    onClick={() => handleSelectWallet(w.adapter.name)}
                    className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
                    style={{
                      background: "transparent",
                      border: "1px solid #1a1a1a",
                      cursor: "pointer",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 13,
                      color: "#ccc",
                    }}
                  >
                    {w.adapter.icon && (
                      <img src={w.adapter.icon} alt={w.adapter.name} width={24} height={24} style={{ borderRadius: 4 }} />
                    )}
                    <span>{w.adapter.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          <div className="text-center space-y-3">
            <button
              onClick={() => setShowWalletPicker(false)}
              className="text-xs block w-full hover:opacity-80"
              style={{ color: "#555" }}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main auth page ──
  return (
    <div
      className="h-[100dvh] flex items-center justify-center px-4 overflow-hidden"
      style={{ backgroundColor: "#0a0a0a" }}
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center"><Logo width={280} /></div>
          <p className="text-sm" style={{ color: "#666" }}>
            Pok&eacute;mon card perpetual futures on Solana
          </p>
        </div>

        {/* Referral banner */}
        <div
          style={{
            background: "rgba(0,255,65,0.06)",
            border: "1px solid rgba(0,255,65,0.2)",
            padding: "10px 16px",
            textAlign: "center",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <span style={{ fontSize: 11, color: "#888" }}>Referred by </span>
          <span style={{ fontSize: 12, color: "#00ff41", fontWeight: 700 }}>{username}</span>
        </div>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            mode === "login" ? handleLogin() : handleSignup();
          }}
          className="p-6 space-y-4"
          style={{ backgroundColor: "#111111", border: "1px solid #1a1a1a" }}
        >
          <h2
            className="font-mono text-center text-lg font-bold"
            style={{ color: "#ffffff" }}
          >
            {mode === "login" ? "Log In" : "Create Account"}
          </h2>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="field-input w-full"
          />

          {mode === "login" && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="field-input w-full"
            />
          )}

          {mode === "signup" && (
            <>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                className="field-input w-full"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="field-input w-full"
              />
              {password && confirmPassword && password !== confirmPassword && (
                <div className="text-xs" style={{ color: "#ff3333" }}>
                  Passwords don&apos;t match
                </div>
              )}
            </>
          )}

          {error && (
            <div
              className="text-xs px-3 py-2"
              style={{
                color: "#ff3333",
                border: "1px solid rgba(255,51,85,0.3)",
                backgroundColor: "rgba(255,51,85,0.1)",
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={
              loading ||
              (mode === "login" && (!email || !password)) ||
              (mode === "signup" && !signupValid)
            }
            className="btn-green w-full py-3 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "..." : mode === "login" ? "Log In" : "Create Account"}
          </button>

          <div className="text-center space-y-1.5">
            {mode === "login" && (
              <button
                type="button"
                onClick={() => { setMode("signup"); clearFields(); }}
                className="text-xs block w-full hover:opacity-80"
                style={{ color: "#666" }}
              >
                Don&apos;t have an account? Sign up
              </button>
            )}
            {mode === "signup" && (
              <button
                type="button"
                onClick={() => { setMode("login"); clearFields(); }}
                className="text-xs hover:opacity-80"
                style={{ color: "#666" }}
              >
                Already have an account? Log in
              </button>
            )}
          </div>
        </form>

        <div className="text-center space-y-3">
          {externalWallets.length > 0 && (
            <button
              onClick={() => setShowWalletPicker(true)}
              className="text-xs underline underline-offset-2 hover:opacity-80"
              style={{ color: "#00ff41" }}
            >
              Connect wallet instead
            </button>
          )}
          <button
            onClick={handleGuest}
            className="text-xs underline underline-offset-2 hover:opacity-80"
            style={{ color: "#666" }}
          >
            Continue as guest (no account)
          </button>
        </div>
      </div>
    </div>
  );
}
