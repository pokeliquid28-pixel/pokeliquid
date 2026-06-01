"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import {
  getSessionPrivateKey,
  setSessionFromPrivateKey,
  setSavedEmail,
  saveSessionKeypair,
  SessionWalletName,
} from "@/lib/session-wallet";

type Mode = "login" | "signup";

export function AuthModal({
  onClose,
  defaultMode = "login",
}: {
  onClose: () => void;
  defaultMode?: Mode;
}) {
  const { select } = useWallet();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function clearFields() {
    setPassword("");
    setConfirmPassword("");
    setError("");
    setSuccess("");
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
      const privateKey = getSessionPrivateKey();
      if (!privateKey) throw new Error("No wallet found — refresh the page");

      const kp = Keypair.fromSecretKey(new Uint8Array(privateKey));

      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          privateKey: JSON.stringify(privateKey),
          publicKey: kp.publicKey.toBase58(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      setSavedEmail(email);
      setSuccess("Account created! Your wallet is now saved.");
      setTimeout(onClose, 2000);
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

      const kp = Keypair.fromSecretKey(new Uint8Array(secretKey));
      saveSessionKeypair(kp);

      setSuccess("Logged in! Restoring your wallet...");

      setTimeout(() => {
        select(SessionWalletName);
        window.location.reload();
      }, 1000);
    } catch (e: any) {
      setError(e?.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const signupValid = email && password && confirmPassword && password.length >= 6 && password === confirmPassword;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm border border-border bg-panel shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-sm font-bold text-primary">
            {mode === "login" ? "Log In" : "Create Account"}
          </h3>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pb-5 space-y-3">
          {success ? (
            <div className="border border-long bg-long/10 p-4 text-center space-y-1">
              <div className="text-sm font-bold text-long">{success}</div>
            </div>
          ) : (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Password (min 6 characters)" : "Password"}
                className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
                onKeyDown={(e) => e.key === "Enter" && mode === "login" && handleLogin()}
              />

              {mode === "signup" && (
                <>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
                    onKeyDown={(e) => e.key === "Enter" && handleSignup()}
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
                onClick={mode === "login" ? handleLogin : handleSignup}
                disabled={
                  loading ||
                  (mode === "login" && (!email || !password)) ||
                  (mode === "signup" && !signupValid)
                }
                className="w-full py-2.5 text-xs font-bold bg-[#a78bfa] text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? "..."
                  : mode === "login"
                  ? "Log In"
                  : "Create Account"}
              </button>

              <div className="text-center">
                <button
                  onClick={() => {
                    setMode(mode === "login" ? "signup" : "login");
                    clearFields();
                  }}
                  className="text-xs text-secondary hover:text-primary transition-colors"
                >
                  {mode === "login"
                    ? "Don't have an account? Sign up"
                    : "Already have an account? Log in"}
                </button>
              </div>

              <p className="text-[10px] text-secondary/60 text-center">
                Your private key is encrypted server-side. We never store it in plaintext.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
