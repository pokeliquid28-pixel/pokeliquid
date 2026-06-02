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
    <div className="min-h-[80vh] flex items-center justify-center px-4" style={{ backgroundColor: "#0a0a0a" }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <Logo size={160} />
          </div>
          <p className="text-sm" style={{ color: "#666" }}>
            Pok&eacute;mon card perpetual futures on Solana
          </p>
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
          <h2 className="font-mono text-center text-lg font-bold" style={{ color: "#ffffff" }}>
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
                <div className="text-xs" style={{ color: "#ff3333" }}>Passwords don&apos;t match</div>
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
                  className="text-xs block w-full transition-colors hover:opacity-80"
                  style={{ color: "#666" }}
                >
                  Don&apos;t have an account? Sign up
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/reset-password")}
                  className="text-xs block w-full transition-colors hover:opacity-80"
                  style={{ color: "#666" }}
                >
                  Forgot password?
                </button>
              </>
            )}
            {mode === "signup" && (
              <button
                type="button"
                onClick={() => { setMode("login"); clearFields(); }}
                className="text-xs transition-colors hover:opacity-80"
                style={{ color: "#666" }}
              >
                Already have an account? Log in
              </button>
            )}
          </div>
        </form>

        <div className="text-center">
          <button
            onClick={handleGuest}
            className="text-xs underline underline-offset-2 transition-colors hover:opacity-80"
            style={{ color: "#666" }}
          >
            Continue as guest (no account)
          </button>
        </div>

        <p className="text-[10px] text-center" style={{ color: "#666" }}>
          DEVNET ONLY — NOT REAL MONEY — TESTNET ONLY
        </p>
      </div>
    </div>
  );
}
