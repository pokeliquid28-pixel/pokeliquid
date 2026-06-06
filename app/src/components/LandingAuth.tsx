"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { getLastWallet } from "@/providers/SessionWalletProvider";
import { Logo } from "./Logo";

/* eslint-disable @next/next/no-img-element */

type Mode = "login" | "signup";

const LANDING_CARDS = [
  {
    id: "charizard-promo",
    name: "Shadowless Charizard",
    image: "https://product-images.tcgplayer.com/fit-in/400x400/106999.jpg",
  },
  {
    id: "mega-charizard-x",
    name: "Mega Charizard X ex",
    image: "https://product-images.tcgplayer.com/fit-in/400x400/662184.jpg",
  },
  {
    id: "charmander-promo",
    name: "Charmander #038",
    image: "https://product-images.tcgplayer.com/fit-in/400x400/684462.jpg",
  },
  {
    id: "pikachu-ex",
    name: "Pikachu ex",
    image: "https://product-images.tcgplayer.com/fit-in/400x400/676088.jpg",
  },
  {
    id: "mega-charizard-promo",
    name: "Mega Charizard X ex",
    image: "https://product-images.tcgplayer.com/fit-in/400x400/659612.jpg",
  },
];

const CARD_ROTATIONS = [-20, -10, 0, 10, 20];
const CARD_OFFSETS_Y = [16, 6, -4, 6, 16];
const CARD_SCALES = [1, 1, 1.15, 1, 1];

export function LandingAuth({ onPass }: { onPass?: () => void } = {}) {
  const { select, connected, wallets, connect } = useWallet();
  const router = useRouter();
  const [showAuth, setShowAuth] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
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

  // When an external wallet connects, pass through
  useEffect(() => {
    if (connected) {
      onPass?.();
    }
  }, [connected, onPass]);

  // Get available external wallets (Phantom, Solflare, etc.)
  const externalWallets = wallets.filter(
    (w) => w.adapter.name !== SessionWalletName &&
           (w.adapter.readyState === WalletReadyState.Installed ||
            w.adapter.readyState === WalletReadyState.Loadable)
  );

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
      onPass?.();
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
      onPass?.();
    } catch (e: any) {
      setError(e?.message ?? "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGuest() {
    await createGuestWallet();
    select(SessionWalletName);
    onPass?.();
  }

  async function handleSelectWallet(walletName: string) {
    try {
      select(walletName as any);
      setShowWalletPicker(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to connect wallet");
    }
  }

  function handleStartTrading() {
    setChecking(true);
    const hasLocalWallet = typeof window !== "undefined" && !!localStorage.getItem("pokeliquid_session_wallet");
    const lastWallet = getLastWallet();

    // If user previously connected an external wallet, try to reconnect
    if (lastWallet && lastWallet !== SessionWalletName) {
      const ext = wallets.find((w) => w.adapter.name === lastWallet);
      if (ext && ext.adapter.readyState === WalletReadyState.Installed) {
        select(lastWallet as any);
        setChecking(false);
        return;
      }
    }

    if (hasLocalWallet) {
      if (!connected) select(SessionWalletName);
      onPass?.();
      setChecking(false);
      return;
    }

    // No local wallet — show auth form
    setShowAuth(true);
    setChecking(false);
  }

  const signupValid = email && password && confirmPassword && password.length >= 6 && password === confirmPassword;

  // Wallet picker modal
  if (showWalletPicker) {
    return (
      <div className="h-[100dvh] flex items-center justify-center px-4 overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="block md:hidden"><Logo width={240} /></div>
              <div className="hidden md:block"><Logo width={320} /></div>
            </div>
          </div>

          <div className="p-6 space-y-4" style={{ backgroundColor: "#111111", border: "1px solid #1a1a1a" }}>
            <h2 className="font-mono text-center text-lg font-bold" style={{ color: "#ffffff" }}>
              Connect Wallet
            </h2>

            <div className="space-y-2">
              {externalWallets.length === 0 ? (
                <p className="text-center text-xs" style={{ color: "#666" }}>
                  No wallets detected. Install{" "}
                  <a href="https://phantom.app" target="_blank" rel="noopener noreferrer" style={{ color: "#00ff41" }}>
                    Phantom
                  </a>
                  ,{" "}
                  <a href="https://jup.ag/download" target="_blank" rel="noopener noreferrer" style={{ color: "#00ff41" }}>
                    Jupiter
                  </a>{" "}
                  or{" "}
                  <a href="https://solflare.com" target="_blank" rel="noopener noreferrer" style={{ color: "#00ff41" }}>
                    Solflare
                  </a>{" "}
                  to connect.
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
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#00ff41";
                      e.currentTarget.style.color = "#fff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "#1a1a1a";
                      e.currentTarget.style.color = "#ccc";
                    }}
                  >
                    {w.adapter.icon && (
                      <img
                        src={w.adapter.icon}
                        alt={w.adapter.name}
                        width={24}
                        height={24}
                        style={{ borderRadius: 4 }}
                      />
                    )}
                    <span>{w.adapter.name}</span>
                    {w.adapter.readyState === WalletReadyState.Installed && (
                      <span style={{ marginLeft: "auto", fontSize: 10, color: "#00ff41" }}>Detected</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="text-center space-y-3">
            <button
              onClick={() => { setShowWalletPicker(false); setShowAuth(true); }}
              className="text-xs underline underline-offset-2 transition-colors hover:opacity-80"
              style={{ color: "#666" }}
            >
              Use email instead
            </button>
            <button
              onClick={() => setShowWalletPicker(false)}
              className="text-xs block w-full transition-colors hover:opacity-80"
              style={{ color: "#555" }}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Auth modal overlay (email/password)
  if (showAuth) {
    return (
      <div className="h-[100dvh] flex items-center justify-center px-4 overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="block md:hidden">
                <Logo width={240} />
              </div>
              <div className="hidden md:block">
                <Logo width={320} />
              </div>
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
            {externalWallets.length > 0 && (
              <button
                onClick={() => { setShowAuth(false); setShowWalletPicker(true); }}
                className="text-xs underline underline-offset-2 transition-colors hover:opacity-80"
                style={{ color: "#00ff41" }}
              >
                Connect wallet instead
              </button>
            )}
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

        </div>
      </div>
    );
  }

  // Landing page with card fan
  return (
    <div
      className="h-[100dvh] flex flex-col items-center justify-center px-4 overflow-hidden"
      style={{ backgroundColor: "#0a0a0a" }}
    >
      {/* Logo */}
      <div
        className="mb-4 md:mb-6 transition-all duration-700"
        style={{
          opacity: logoVisible ? 1 : 0,
          transform: logoVisible ? "translateY(0)" : "translateY(-20px)",
        }}
      >
        <div className="block md:hidden">
          <Logo size={120} />
        </div>
        <div className="hidden md:block">
          <Logo width={400} />
        </div>
      </div>

      {/* Card fan */}
      <div
        className="relative mb-8 md:mb-6 flex items-end justify-center"
        style={{
          height: "clamp(120px, 25vw, 300px)",
          width: "100%",
          maxWidth: 600,
        }}
      >
        {LANDING_CARDS.map((card, i) => {
          const isCenter = i === 2;
          return (
            <div
              key={card.id}
              className="absolute transition-all duration-700 ease-out"
              style={{
                opacity: cardsVisible ? 1 : 0,
                transform: cardsVisible
                  ? `rotate(${CARD_ROTATIONS[i]}deg) translateY(${CARD_OFFSETS_Y[i]}px) scale(${CARD_SCALES[i]})`
                  : `rotate(0deg) translateY(60px) scale(1)`,
                transitionDelay: `${i * 100}ms`,
                left: `${10 + i * 16}%`,
                bottom: 0,
                width: "clamp(70px, 14vw, 140px)",
                zIndex: isCenter ? 10 : 5 - Math.abs(i - 2),
                transformOrigin: "bottom center",
              }}
            >
              <img
                src={card.image}
                alt={card.name}
                className="w-full h-auto transition-transform duration-200 hover:-translate-y-3"
                style={{
                  filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.6))",
                }}
                draggable={false}
              />
            </div>
          );
        })}
      </div>

      {/* Tagline */}
      <p
        className="text-center mb-4 md:mb-6 font-mono transition-all duration-700"
        style={{
          color: "#666",
          fontSize: "clamp(12px, 2vw, 14px)",
          opacity: ctaVisible ? 1 : 0,
          transform: ctaVisible ? "translateY(0)" : "translateY(10px)",
        }}
      >
        Pok&eacute;mon card perpetual futures on Solana
      </p>

      {/* CTA buttons */}
      <div
        className="flex flex-col items-center gap-3 w-full transition-all duration-700"
        style={{
          opacity: ctaVisible ? 1 : 0,
          transform: ctaVisible ? "translateY(0)" : "translateY(10px)",
          maxWidth: 320,
        }}
      >
        <button
          onClick={handleStartTrading}
          className="uppercase tracking-wider font-bold w-full"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "clamp(13px, 2vw, 15px)",
            padding: "14px 48px",
            background: "#00ff41",
            color: "#000000",
            border: "none",
            boxShadow: "4px 4px 0 #009926, 0 0 30px rgba(0,255,65,0.15)",
            cursor: "pointer",
            letterSpacing: "0.08em",
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
          {checking ? "Checking..." : "Start Trading"}
        </button>

        {externalWallets.length > 0 && (
          <button
            onClick={() => setShowWalletPicker(true)}
            className="uppercase tracking-wider font-bold w-full"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "clamp(12px, 1.8vw, 13px)",
              padding: "12px 48px",
              background: "transparent",
              color: "#00ff41",
              border: "1px solid rgba(0,255,65,0.4)",
              cursor: "pointer",
              letterSpacing: "0.08em",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#00ff41";
              e.currentTarget.style.background = "rgba(0,255,65,0.06)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(0,255,65,0.4)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            Connect Wallet
          </button>
        )}
      </div>

      {/* Read Docs link */}
      <Link
        href="/docs"
        className="mt-4 text-xs font-mono transition-all duration-700 underline underline-offset-2"
        style={{
          color: "#666",
          opacity: ctaVisible ? 1 : 0,
          textDecoration: "none",
        }}
      >
        Read the Docs
      </Link>

    </div>
  );
}
