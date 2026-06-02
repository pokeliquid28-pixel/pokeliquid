"use client";

import { useState, useEffect } from "react";
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

/* eslint-disable @next/next/no-img-element */

type Mode = "login" | "signup";

const CARD_IMAGES = [
  "https://product-images.tcgplayer.com/fit-in/400x400/593355.jpg",
  "https://product-images.tcgplayer.com/fit-in/400x400/662184.jpg",
  "https://product-images.tcgplayer.com/fit-in/400x400/684462.jpg",
  "https://product-images.tcgplayer.com/fit-in/400x400/676088.jpg",
  "https://product-images.tcgplayer.com/fit-in/400x400/659612.jpg",
];

const CARD_ROTATIONS = [-16, -8, 0, 8, 16];
const CARD_OFFSETS_Y = [12, 4, 0, 4, 12];

export function LandingAuth() {
  const { select } = useWallet();
  const router = useRouter();
  const [showAuth, setShowAuth] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Animation state
  const [logoVisible, setLogoVisible] = useState(false);
  const [cardsVisible, setCardsVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLogoVisible(true), 100);
    const t2 = setTimeout(() => setCardsVisible(true), 400);
    const t3 = setTimeout(() => setCtaVisible(true), 800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

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

  function handleStartTrading() {
    // Check if already logged in
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.email) {
          // Already logged in, just connect
          select(SessionWalletName);
          window.location.reload();
        } else {
          setShowAuth(true);
        }
      })
      .catch(() => {
        setShowAuth(true);
      });
  }

  const signupValid = email && password && confirmPassword && password.length >= 6 && password === confirmPassword;

  // Auth modal overlay
  if (showAuth) {
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

          <div className="text-center space-y-3">
            <button
              onClick={handleGuest}
              className="text-xs underline underline-offset-2 transition-colors hover:opacity-80"
              style={{ color: "#666" }}
            >
              Continue as guest (no account)
            </button>
            <button
              onClick={() => setShowAuth(false)}
              className="text-xs block w-full transition-colors hover:opacity-80"
              style={{ color: "#555" }}
            >
              Back
            </button>
          </div>

          <p className="text-[10px] text-center" style={{ color: "#666" }}>
            DEVNET ONLY — NOT REAL MONEY — TESTNET ONLY
          </p>
        </div>
      </div>
    );
  }

  // Landing page with card fan
  return (
    <div
      className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-8"
      style={{ backgroundColor: "#0a0a0a" }}
    >
      {/* Logo */}
      <div
        className="mb-8 transition-all duration-700"
        style={{
          opacity: logoVisible ? 1 : 0,
          transform: logoVisible ? "translateY(0)" : "translateY(-20px)",
        }}
      >
        <Logo size={120} />
      </div>

      {/* Card fan */}
      <div
        className="relative mb-10 flex items-end justify-center"
        style={{
          height: "clamp(200px, 35vw, 340px)",
          width: "100%",
          maxWidth: 600,
        }}
      >
        {CARD_IMAGES.map((src, i) => (
          <div
            key={i}
            className="absolute transition-all duration-700 ease-out"
            style={{
              opacity: cardsVisible ? 1 : 0,
              transform: cardsVisible
                ? `rotate(${CARD_ROTATIONS[i]}deg) translateY(${CARD_OFFSETS_Y[i]}px)`
                : `rotate(0deg) translateY(60px)`,
              transitionDelay: `${i * 100}ms`,
              left: `${12 + i * 16}%`,
              bottom: 0,
              width: "clamp(90px, 16vw, 140px)",
              zIndex: i === 2 ? 10 : 5 - Math.abs(i - 2),
            }}
          >
            <img
              src={src}
              alt={`Card ${i + 1}`}
              className="w-full h-auto transition-transform duration-200 hover:-translate-y-2"
              style={{
                filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.6))",
              }}
              draggable={false}
            />
          </div>
        ))}
      </div>

      {/* Tagline */}
      <p
        className="text-center mb-8 font-mono transition-all duration-700"
        style={{
          color: "#666",
          fontSize: "clamp(12px, 2vw, 14px)",
          opacity: ctaVisible ? 1 : 0,
          transform: ctaVisible ? "translateY(0)" : "translateY(10px)",
        }}
      >
        Pok&eacute;mon card perpetual futures on Solana
      </p>

      {/* CTA button */}
      <button
        onClick={handleStartTrading}
        className="transition-all duration-700 uppercase tracking-wider font-bold"
        style={{
          opacity: ctaVisible ? 1 : 0,
          transform: ctaVisible ? "translateY(0)" : "translateY(10px)",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "clamp(13px, 2vw, 15px)",
          padding: "14px 48px",
          background: "#00ff41",
          color: "#000000",
          border: "none",
          boxShadow: "4px 4px 0 #009926, 0 0 30px rgba(0,255,65,0.15)",
          cursor: "pointer",
          letterSpacing: "0.08em",
          width: "100%",
          maxWidth: 320,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = "2px 2px 0 #009926, 0 0 40px rgba(0,255,65,0.25)";
          e.currentTarget.style.transform = "translate(2px, 2px)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "4px 4px 0 #009926, 0 0 30px rgba(0,255,65,0.15)";
          e.currentTarget.style.transform = "translate(0, 0)";
        }}
      >
        Start Trading
      </button>

      {/* DEVNET notice */}
      <p
        className="mt-6 text-[10px] text-center font-mono transition-all duration-700"
        style={{
          color: "#444",
          opacity: ctaVisible ? 1 : 0,
        }}
      >
        DEVNET ONLY — NOT REAL MONEY — TESTNET ONLY
      </p>
    </div>
  );
}
