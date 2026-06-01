"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import {
  setSessionFromPrivateKey,
  setSavedEmail,
  saveSessionKeypair,
  getSavedEmail,
  SessionWalletName,
} from "@/lib/session-wallet";

type Mode = "login" | "signup" | "reset";

export function LandingAuth() {
  const { select } = useWallet();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function clearFields() {
    setPassword("");
    setConfirmPassword("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setError("");
    setSuccess("");
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

  async function handleResetPassword() {
    if (!email || !currentPassword || !newPassword || !confirmNewPassword || loading) return;

    if (newPassword !== confirmNewPassword) {
      setError("New passwords don't match");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");

      setSuccess("Password updated! You can now log in.");
      setTimeout(() => { setMode("login"); clearFields(); }, 2000);
    } catch (e: any) {
      setError(e?.message ?? "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  function handleGuest() {
    select(SessionWalletName);
  }

  const signupValid = email && password && confirmPassword && password.length >= 6 && password === confirmPassword;
  const resetValid = email && currentPassword && newPassword && confirmNewPassword && newPassword.length >= 6 && newPassword === confirmNewPassword;

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <h1 className="holo-text text-3xl font-bold tracking-tight">
            Pokeliquid
          </h1>
          <p className="text-sm text-secondary">
            Pokemon card perpetual futures on Solana
          </p>
        </div>

        <div className="border border-border bg-panel p-6 space-y-4">
          <h2 className="text-sm font-bold text-primary text-center">
            {mode === "login" ? "Log In" : mode === "signup" ? "Create Account" : "Reset Password"}
          </h2>

          {success ? (
            <div className="border border-long bg-long/10 p-4 text-center">
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

              {mode === "login" && (
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
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
                    onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                  />
                  {password && confirmPassword && password !== confirmPassword && (
                    <div className="text-xs text-short">Passwords don't match</div>
                  )}
                </>
              )}

              {mode === "reset" && (
                <>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 characters)"
                    className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
                  />
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
                    onKeyDown={(e) => e.key === "Enter" && handleResetPassword()}
                  />
                  {newPassword && confirmNewPassword && newPassword !== confirmNewPassword && (
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
                onClick={
                  mode === "login"
                    ? handleLogin
                    : mode === "signup"
                    ? handleSignup
                    : handleResetPassword
                }
                disabled={
                  loading ||
                  (mode === "login" && (!email || !password)) ||
                  (mode === "signup" && !signupValid) ||
                  (mode === "reset" && !resetValid)
                }
                className="w-full py-3 text-sm font-bold holo-bg text-black hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? "..."
                  : mode === "login"
                  ? "Log In"
                  : mode === "signup"
                  ? "Create Account"
                  : "Update Password"}
              </button>

              <div className="text-center space-y-1.5">
                {mode === "login" && (
                  <>
                    <button
                      onClick={() => { setMode("signup"); clearFields(); }}
                      className="text-xs text-secondary hover:text-primary transition-colors block w-full"
                    >
                      Don't have an account? Sign up
                    </button>
                    <button
                      onClick={() => { setMode("reset"); clearFields(); }}
                      className="text-xs text-secondary/60 hover:text-primary transition-colors block w-full"
                    >
                      Forgot password?
                    </button>
                  </>
                )}
                {mode === "signup" && (
                  <button
                    onClick={() => { setMode("login"); clearFields(); }}
                    className="text-xs text-secondary hover:text-primary transition-colors"
                  >
                    Already have an account? Log in
                  </button>
                )}
                {mode === "reset" && (
                  <button
                    onClick={() => { setMode("login"); clearFields(); }}
                    className="text-xs text-secondary hover:text-primary transition-colors"
                  >
                    Back to log in
                  </button>
                )}
              </div>
            </>
          )}
        </div>

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
