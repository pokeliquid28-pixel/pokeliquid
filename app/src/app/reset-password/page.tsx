"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const mode = token ? "reset" : "request";
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleRequestReset() {
    if (!email || loading) return;
    setLoading(true);
    setError("");

    try {
      await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSuccess("If that email is registered, you'll receive a reset link shortly.");
    } catch {
      setSuccess("If that email is registered, you'll receive a reset link shortly.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetWithToken() {
    if (!newPassword || !confirmPassword || loading) return;

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/reset-password-with-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");

      setSuccess("Password reset successfully! Redirecting to login...");
      setTimeout(() => router.push("/"), 2000);
    } catch (e: any) {
      setError(e?.message ?? "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <Logo size={160} />
          </div>
          <p className="text-sm text-secondary">
            {mode === "request" ? "Reset your password" : "Set a new password"}
          </p>
        </div>

        <div className="border border-border bg-panel p-6 space-y-4">
          <h2 className="text-sm font-bold text-primary text-center">
            {mode === "request" ? "Forgot Password" : "New Password"}
          </h2>

          {success ? (
            <div className="border border-long bg-long/10 p-4 text-center">
              <div className="text-sm font-bold text-long">{success}</div>
            </div>
          ) : (
            <>
              {mode === "request" && (
                <>
                  <p className="text-xs text-secondary text-center">
                    Enter your email and we'll send you a reset link.
                  </p>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
                    onKeyDown={(e) => e.key === "Enter" && handleRequestReset()}
                  />
                </>
              )}

              {mode === "reset" && (
                <>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 characters)"
                    className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full bg-transparent border border-border px-3 py-2.5 text-sm font-mono text-primary outline-none placeholder:text-secondary/40 focus:border-secondary"
                    onKeyDown={(e) => e.key === "Enter" && handleResetWithToken()}
                  />
                  {newPassword && confirmPassword && newPassword !== confirmPassword && (
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
                onClick={mode === "request" ? handleRequestReset : handleResetWithToken}
                disabled={
                  loading ||
                  (mode === "request" && !email) ||
                  (mode === "reset" && (!newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6))
                }
                className="w-full py-3 text-sm font-bold holo-bg text-black hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "..." : mode === "request" ? "Send Reset Link" : "Reset Password"}
              </button>
            </>
          )}

          <div className="text-center">
            <button
              onClick={() => router.push("/")}
              className="text-xs text-secondary hover:text-primary transition-colors"
            >
              Back to log in
            </button>
          </div>
        </div>

        <p className="text-[10px] text-secondary/50 text-center">
          DEVNET ONLY — NOT REAL MONEY — TESTNET ONLY
        </p>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="text-secondary text-sm">Loading...</div>
      </div>
    }>
      <ResetPasswordInner />
    </Suspense>
  );
}
