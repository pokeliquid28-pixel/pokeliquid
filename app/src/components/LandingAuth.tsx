"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import {
  setSessionFromPrivateKey,
  setSavedEmail,
  saveSessionKeypair,
  SessionWalletName,
} from "@/lib/session-wallet";
import { Logo } from "./Logo";

type Mode = "login" | "signup";

export function LandingAuth() {
  const { select } = useWallet();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function clearFields() {
    setPassword("");
    setConfirmPassword("");
    setError("");
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
      const kp = Keypair.fromSecretKey(new Uint8Array(secretKey));
      saveSessionKeypair(kp);

      select(SessionWalletName);
      window.location.reload();
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    if (!email || !password || !confirmPassword || loading) return;

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const kp = Keypair.generate();
      const privateKey = JSON.stringify(Array.from(kp.secretKey));

      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          privateKey,
          publicKey: kp.publicKey.toBase58(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      saveSessionKeypair(kp);
      setSavedEmail(email);

      try {
        await fetch("/api/create-session-wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: kp.publicKey.toBase58(),
            privateKey,
          }),
        });
      } catch {}

      select(SessionWalletName);
      window.location.reload();
    } catch (e: any) {
      setError(e?.message ?? "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  function handleGuest() {
    select(SessionWalletName);
  }

  const signupValid = email && password && confirmPassword && password.length >= 6 && password === confirmPassword;

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <Logo size={160} />
          </div>
          <p className="text-sm text-secondary">
            Pokemon card perpetual futures on Solana
          </p>
        </div>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            mode === "login" ? handleLogin() : handleSignup();
          }}
          className="border border-border bg-panel p-6 space-y-4"
        >
          <h2 className="text-sm font-bold text-primary text-center">
            {mode === "login" ? "Log In" : "Create Account"}
          </h2>

          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
          />

          {mode === "login" && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
            />
          )}

          {mode === "signup" && (
            <>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
              />
              {password && confirmPassword && password !== confirmPassword && (
                <div className="text-xs text-short">Passwords don't match</div>
              )}
            </>
          )}

          {error && (
            <div className="text-xs text-short border border-short/30 bg-short/10 px-3 py-2">
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
            className="w-full py-3 text-sm font-bold holo-bg text-black hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? "..."
              : mode === "login"
              ? "Log In"
              : "Create Account"}
          </button>

          <div className="text-center space-y-1.5">
            {mode === "login" && (
              <>
                <button
                  type="button"
                  onClick={() => { setMode("signup"); clearFields(); }}
                  className="text-xs text-secondary hover:text-primary transition-colors block w-full"
                >
                  Don't have an account? Sign up
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/reset-password")}
                  className="text-xs text-secondary/60 hover:text-primary transition-colors block w-full"
                >
                  Forgot password?
                </button>
              </>
            )}
            {mode === "signup" && (
              <button
                type="button"
                onClick={() => { setMode("login"); clearFields(); }}
                className="text-xs text-secondary hover:text-primary transition-colors"
              >
                Already have an account? Log in
              </button>
            )}
          </div>
        </form>

        <div className="text-center">
          <button
            onClick={handleGuest}
            className="text-xs text-secondary hover:text-primary transition-colors underline underline-offset-2"
          >
            Continue as guest (no account)
          </button>
        </div>

        <p className="text-[10px] text-secondary/50 text-center">
          DEVNET ONLY — NOT REAL MONEY — TESTNET ONLY
        </p>
      </div>
    </div>
  );
}
