"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { Keypair } from "@solana/web3.js";
import { useOracle } from "@/hooks/useOracle";
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
  { id: "charizard-promo", name: "Shadowless Charizard", image: "https://product-images.tcgplayer.com/fit-in/400x400/106999.jpg" },
  { id: "mega-charizard-x", name: "Mega Charizard X ex", image: "https://product-images.tcgplayer.com/fit-in/400x400/662184.jpg" },
  { id: "charmander-promo", name: "Charmander #038", image: "https://product-images.tcgplayer.com/fit-in/400x400/684462.jpg" },
  { id: "pikachu-ex", name: "Pikachu ex", image: "https://product-images.tcgplayer.com/fit-in/400x400/676088.jpg" },
  { id: "mega-charizard-promo", name: "Mega Charizard X ex", image: "https://product-images.tcgplayer.com/fit-in/400x400/659612.jpg" },
];

const CARD_ROTATIONS = [-20, -10, 0, 10, 20];
const CARD_OFFSETS_Y = [16, 6, -4, 6, 16];
const CARD_SCALES = [1, 1, 1.15, 1, 1];

// Pikachu oracle for live price on landing
const PIKACHU_ORACLE = "Fx1rYyuEz91rqgpEWHs8MyH7kiLpNeXuDdcAJiSjhN87";

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

  // Live price
  const { price: rawPrice, readings, isLoading: priceLoading } = useOracle(PIKACHU_ORACLE, "PIKACHU");
  const livePrice = rawPrice / 1_000_000;
  let pctChange = 0;
  if (readings.length >= 2) {
    const oldest = readings[0].price / 1_000_000;
    if (oldest > 0) pctChange = ((livePrice - oldest) / oldest) * 100;
  }

  // Simulated PnL from live price (entry = price - 5%, 2x leverage)
  const entryPrice = livePrice > 0 ? livePrice * 0.95 : 0;
  const pnlPct = entryPrice > 0 ? ((livePrice - entryPrice) / entryPrice) * 2 * 100 : 0;
  const pnlUsd = entryPrice > 0 ? (100 * pnlPct) / 100 : 0;
  const liqPrice = entryPrice > 0 ? entryPrice * 0.65 : 0;

  const fmt = (n: number) => n.toFixed(2);

  // Animation state
  const [logoVisible, setLogoVisible] = useState(false);
  const [cardsVisible, setCardsVisible] = useState(false);
  const [stepsVisible, setStepsVisible] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setLogoVisible(true), 100);
    const t2 = setTimeout(() => setCardsVisible(true), 400);
    const t3 = setTimeout(() => setStepsVisible(true), 900);
    const t4 = setTimeout(() => setCtaVisible(true), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  useEffect(() => { if (connected) onPass?.(); }, [connected, onPass]);

  const externalWallets = wallets.filter(
    (w) => w.adapter.name !== SessionWalletName &&
           (w.adapter.readyState === WalletReadyState.Installed ||
            w.adapter.readyState === WalletReadyState.Loadable)
  );

  function clearFields() { setPassword(""); setConfirmPassword(""); setError(""); }

  async function handleLogin() {
    if (!email || !password || loading) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      const secretKey: number[] = JSON.parse(data.privateKey);
      setSessionFromPrivateKey(secretKey);
      setSavedEmail(email);
      saveSessionKeypair(Keypair.fromSecretKey(new Uint8Array(secretKey)));
      select(SessionWalletName);
      onPass?.();
    } catch (e: any) { setError(e?.message ?? "Login failed"); } finally { setLoading(false); }
  }

  async function handleSignup() {
    if (!email || !password || !confirmPassword || loading) return;
    if (password !== confirmPassword) { setError("Passwords don't match"); return; }
    setLoading(true); setError("");
    try {
      const kp = Keypair.generate();
      const privateKey = JSON.stringify(Array.from(kp.secretKey));
      const res = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, privateKey, publicKey: kp.publicKey.toBase58() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");
      saveSessionKeypair(kp); setSavedEmail(email);
      try { await fetch("/api/create-session-wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey: kp.publicKey.toBase58(), privateKey }) }); } catch {}
      select(SessionWalletName); onPass?.();
    } catch (e: any) { setError(e?.message ?? "Signup failed"); } finally { setLoading(false); }
  }

  async function handleGuest() { await createGuestWallet(); select(SessionWalletName); onPass?.(); }

  async function handleSelectWallet(walletName: string) {
    try { select(walletName as any); setShowWalletPicker(false); } catch (e: any) { setError(e?.message ?? "Failed to connect wallet"); }
  }

  function handleStartTrading() {
    setChecking(true);
    const hasLocalWallet = typeof window !== "undefined" && !!localStorage.getItem("pokeliquid_session_wallet");
    const lastWallet = getLastWallet();
    if (lastWallet && lastWallet !== SessionWalletName) {
      const ext = wallets.find((w) => w.adapter.name === lastWallet);
      if (ext && ext.adapter.readyState === WalletReadyState.Installed) { select(lastWallet as any); setChecking(false); return; }
    }
    if (hasLocalWallet) { if (!connected) select(SessionWalletName); onPass?.(); setChecking(false); return; }
    setShowAuth(true); setChecking(false);
  }

  const signupValid = email && password && confirmPassword && password.length >= 6 && password === confirmPassword;

  // ── Wallet picker modal ──
  if (showWalletPicker) {
    return (
      <div className="h-[100dvh] flex items-center justify-center px-4 overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center"><div className="flex justify-center"><Logo width={280} /></div></div>
          <div className="p-6 space-y-4" style={{ backgroundColor: "#111111", border: "1px solid #1a1a1a" }}>
            <h2 className="font-mono text-center text-lg font-bold" style={{ color: "#ffffff" }}>Connect Wallet</h2>
            <div className="space-y-2">
              {externalWallets.length === 0 ? (
                <p className="text-center text-xs" style={{ color: "#666" }}>
                  No wallets detected. Install <a href="https://phantom.app" target="_blank" rel="noopener noreferrer" style={{ color: "#00ff41" }}>Phantom</a>, <a href="https://jup.ag/download" target="_blank" rel="noopener noreferrer" style={{ color: "#00ff41" }}>Jupiter</a> or <a href="https://solflare.com" target="_blank" rel="noopener noreferrer" style={{ color: "#00ff41" }}>Solflare</a> to connect.
                </p>
              ) : externalWallets.map((w) => (
                <button key={w.adapter.name} onClick={() => handleSelectWallet(w.adapter.name)} className="w-full flex items-center gap-3 px-4 py-3 transition-colors" style={{ background: "transparent", border: "1px solid #1a1a1a", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: "#ccc" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#00ff41"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1a1a1a"; e.currentTarget.style.color = "#ccc"; }}>
                  {w.adapter.icon && <img src={w.adapter.icon} alt={w.adapter.name} width={24} height={24} style={{ borderRadius: 4 }} />}
                  <span>{w.adapter.name}</span>
                  {w.adapter.readyState === WalletReadyState.Installed && <span style={{ marginLeft: "auto", fontSize: 10, color: "#00ff41" }}>Detected</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="text-center space-y-3">
            <button onClick={() => { setShowWalletPicker(false); setShowAuth(true); }} className="text-xs underline underline-offset-2 hover:opacity-80" style={{ color: "#666" }}>Use email instead</button>
            <button onClick={() => setShowWalletPicker(false)} className="text-xs block w-full hover:opacity-80" style={{ color: "#555" }}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Auth modal ──
  if (showAuth) {
    return (
      <div className="h-[100dvh] flex items-center justify-center px-4 overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="flex justify-center"><Logo width={280} /></div>
            <p className="text-sm" style={{ color: "#666" }}>Pok&eacute;mon card perpetual futures on Solana</p>
          </div>
          <form noValidate onSubmit={(e) => { e.preventDefault(); mode === "login" ? handleLogin() : handleSignup(); }} className="p-6 space-y-4" style={{ backgroundColor: "#111111", border: "1px solid #1a1a1a" }}>
            <h2 className="font-mono text-center text-lg font-bold" style={{ color: "#ffffff" }}>{mode === "login" ? "Log In" : "Create Account"}</h2>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="field-input w-full" />
            {mode === "login" && <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="field-input w-full" />}
            {mode === "signup" && (<>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6 characters)" className="field-input w-full" />
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" className="field-input w-full" />
              {password && confirmPassword && password !== confirmPassword && <div className="text-xs" style={{ color: "#ff3333" }}>Passwords don&apos;t match</div>}
            </>)}
            {error && <div className="text-xs px-3 py-2" style={{ color: "#ff3333", border: "1px solid rgba(255,51,85,0.3)", backgroundColor: "rgba(255,51,85,0.1)" }}>{error}</div>}
            <button type="submit" disabled={loading || (mode === "login" && (!email || !password)) || (mode === "signup" && !signupValid)} className="btn-green w-full py-3 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "..." : mode === "login" ? "Log In" : "Create Account"}
            </button>
            <div className="text-center space-y-1.5">
              {mode === "login" && (<>
                <button type="button" onClick={() => { setMode("signup"); clearFields(); }} className="text-xs block w-full hover:opacity-80" style={{ color: "#666" }}>Don&apos;t have an account? Sign up</button>
                <button type="button" onClick={() => router.push("/reset-password")} className="text-xs block w-full hover:opacity-80" style={{ color: "#666" }}>Forgot password?</button>
              </>)}
              {mode === "signup" && <button type="button" onClick={() => { setMode("login"); clearFields(); }} className="text-xs hover:opacity-80" style={{ color: "#666" }}>Already have an account? Log in</button>}
            </div>
          </form>
          <div className="text-center space-y-3">
            {externalWallets.length > 0 && <button onClick={() => { setShowAuth(false); setShowWalletPicker(true); }} className="text-xs underline underline-offset-2 hover:opacity-80" style={{ color: "#00ff41" }}>Connect wallet instead</button>}
            <button onClick={handleGuest} className="text-xs underline underline-offset-2 hover:opacity-80" style={{ color: "#666" }}>Continue as guest (no account)</button>
            <button onClick={() => setShowAuth(false)} className="text-xs block w-full hover:opacity-80" style={{ color: "#555" }}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  // Price display helpers
  const priceStr = priceLoading || livePrice === 0 ? "-.--" : `$${fmt(livePrice)}`;
  const changeStr = priceLoading || livePrice === 0 ? "" : `${pctChange >= 0 ? "+" : ""}${fmt(pctChange)}%`;
  const entryStr = entryPrice > 0 ? `$${fmt(entryPrice)}` : "-.--";
  const currentStr = livePrice > 0 ? `$${fmt(livePrice)}` : "-.--";
  const liqStr = liqPrice > 0 ? `$${fmt(liqPrice)}` : "-.--";
  const pnlStr = pnlUsd > 0 ? `+$${fmt(pnlUsd)}` : pnlUsd < 0 ? `-$${fmt(Math.abs(pnlUsd))}` : "$0.00";
  const pnlPctStr = pnlPct !== 0 ? `(${pnlPct >= 0 ? "+" : ""}${fmt(pnlPct)}%)` : "";
  const pnlColor = pnlPct >= 0 ? "#00ff41" : "#ff3355";

  // ── Landing page ──
  return (
    <div
      className="h-[100dvh] flex flex-col items-center px-3 md:px-6 overflow-hidden"
      style={{ backgroundColor: "#0a0a0a" }}
    >
      {/* ── HERO ── */}
      <div className="flex flex-col items-center flex-shrink-0 pt-3 md:pt-6">
        <div
          className="mb-2 md:mb-3 transition-all duration-700"
          style={{ opacity: logoVisible ? 1 : 0, transform: logoVisible ? "translateY(0)" : "translateY(-20px)" }}
        >
          <div className="block md:hidden"><Logo size={100} /></div>
          <div className="hidden md:block"><Logo width={320} /></div>
        </div>

        {/* Card fan */}
        <div
          className="relative mb-1 flex items-end justify-center"
          style={{ height: "clamp(70px, 15vw, 160px)", width: "100%", maxWidth: 480 }}
        >
          {LANDING_CARDS.map((card, i) => (
            <div
              key={card.id}
              className="absolute transition-all duration-700 ease-out"
              style={{
                opacity: cardsVisible ? 1 : 0,
                transform: cardsVisible
                  ? `rotate(${CARD_ROTATIONS[i]}deg) translateY(${CARD_OFFSETS_Y[i]}px) scale(${CARD_SCALES[i]})`
                  : `rotate(0deg) translateY(60px) scale(1)`,
                transitionDelay: `${i * 100}ms`,
                left: `${10 + i * 16}%`, bottom: 0,
                width: "clamp(45px, 10vw, 95px)",
                zIndex: i === 2 ? 10 : 5 - Math.abs(i - 2),
                transformOrigin: "bottom center",
              }}
            >
              <img src={card.image} alt={card.name} className="w-full h-auto" style={{ filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.6))" }} draggable={false} />
            </div>
          ))}
        </div>

        <p className="text-center font-mono transition-all duration-700 mb-1" style={{ color: "#666", fontSize: "clamp(9px, 1.4vw, 11px)", opacity: cardsVisible ? 1 : 0 }}>
          Pok&eacute;mon card perpetual futures on Solana
        </p>

        <p className="text-center font-mono transition-all duration-700 mb-3 md:mb-4 px-2" style={{ color: "#777", fontSize: "clamp(10px, 1.3vw, 12px)", lineHeight: 1.5, maxWidth: 520, opacity: logoVisible ? 1 : 0 }}>
          Bet on Pok&eacute;mon card prices without owning the card. Go long if you think Charizard goes up. Go short if you think it drops. Set your USDC collateral, choose leverage, and manage risk with stop loss / take profit.
        </p>
      </div>

      {/* ── 3 STEPS ── */}
      <div className="w-full flex-1 min-h-0 flex flex-col transition-all duration-700" style={{ opacity: stepsVisible ? 1 : 0, transform: stepsVisible ? "translateY(0)" : "translateY(20px)", maxWidth: 960 }}>
        <h2 className="text-center font-mono font-bold mb-3 md:mb-4 flex-shrink-0" style={{ fontSize: "clamp(13px, 2.5vw, 18px)", color: "#fff" }}>
          TRADE POKEMON PERPS IN <span style={{ color: "#00ff41" }}>3 SIMPLE STEPS</span>
        </h2>

        <div className="flex flex-col md:flex-row items-stretch gap-3 md:gap-3 flex-1 min-h-0 overflow-hidden">

          {/* STEP 1 */}
          <div className="flex-1 flex flex-col min-h-0">
            <StepCard num={1} title="PICK CARD" subtitle="Browse the market and choose your card" delay={0} visible={stepsVisible}>
              <div style={{ padding: "8px 8px 6px" }}>
                <div style={{ background: "#1a1a1a", borderRadius: 3, padding: "4px 6px", marginBottom: 6 }}>
                  <span style={{ color: "#555", fontSize: 8, fontFamily: "monospace" }}>Search cards...</span>
                </div>
                <div className="flex gap-1 mb-2">
                  {["ALL", "SEALED", "CARDS"].map((f, i) => (
                    <span key={f} style={{ fontSize: 7, fontFamily: "monospace", fontWeight: 700, padding: "1px 5px", borderRadius: 2, border: i === 0 ? "1px solid #00ff41" : "1px solid #333", color: i === 0 ? "#00ff41" : "#555", background: i === 0 ? "rgba(0,255,65,0.08)" : "transparent" }}>{f}</span>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {LANDING_CARDS.slice(0, 3).map((c) => (
                    <div key={c.id} style={{ background: "#1a1a1a", borderRadius: 3, padding: 2 }}>
                      <img src={c.image} alt="" className="w-full" style={{ borderRadius: 2 }} draggable={false} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-1 mt-1.5">
                  {LANDING_CARDS.slice(0, 4).map((c) => (
                    <div key={c.id + "-t"} style={{ width: "25%", background: "#1a1a1a", borderRadius: 2, padding: 1 }}>
                      <img src={c.image} alt="" className="w-full" style={{ borderRadius: 1 }} draggable={false} />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-1.5 px-0.5">
                  <span style={{ fontSize: 7, color: "#555", fontFamily: "monospace" }}>MARKET PRICE</span>
                  <div className="flex items-center gap-1.5">
                    <span style={{ fontSize: 10, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>{priceStr}</span>
                    {changeStr && <span style={{ fontSize: 8, color: pctChange >= 0 ? "#00ff41" : "#ff3355", fontFamily: "monospace", fontWeight: 700 }}>{changeStr}</span>}
                  </div>
                </div>
              </div>
            </StepCard>
            <div className="hidden md:flex items-center justify-end mt-2">
              <span style={{ color: "#00ff41", fontSize: 18, fontFamily: "monospace" }}>&rarr;</span>
            </div>
          </div>

          {/* STEP 2 */}
          <div className="flex-1 flex flex-col min-h-0">
            <StepCard num={2} title="LONG / SHORT" subtitle="Choose direction and configure your trade" delay={150} visible={stepsVisible}>
              <div style={{ padding: "8px 8px 6px" }}>
                <div className="flex items-center gap-2 mb-2" style={{ background: "#1a1a1a", borderRadius: 3, padding: "4px 6px" }}>
                  <img src={LANDING_CARDS[3].image} alt="" style={{ width: 16, height: 16, borderRadius: 2, objectFit: "cover" }} />
                  <div>
                    <div style={{ fontSize: 8, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>TRADE TICKET</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mb-2 px-0.5">
                  <img src={LANDING_CARDS[3].image} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: "cover" }} />
                  <div>
                    <span style={{ fontSize: 8, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>Pikachu ex - 276/217</span>
                    <div style={{ fontSize: 7, color: "#555", fontFamily: "monospace" }}>Ascended Heroes (ASC)</div>
                  </div>
                </div>
                <div style={{ fontSize: 7, color: "#555", fontFamily: "monospace", marginBottom: 3, paddingLeft: 2 }}>CHOOSE DIRECTION</div>
                <div className="flex gap-1.5 mb-2">
                  <div className="flex-1 flex items-center justify-center gap-1" style={{ background: "rgba(0,255,65,0.1)", border: "1px solid rgba(0,255,65,0.4)", borderRadius: 3, padding: "4px 0" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#00ff41" strokeWidth="2"><path d="M2 20l10-14 10 14"/></svg>
                    <span style={{ fontSize: 9, color: "#00ff41", fontFamily: "monospace", fontWeight: 700 }}>LONG</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center gap-1" style={{ border: "1px solid #333", borderRadius: 3, padding: "4px 0" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ff3355" strokeWidth="2"><path d="M2 4l10 14L22 4"/></svg>
                    <span style={{ fontSize: 9, color: "#ff3355", fontFamily: "monospace", fontWeight: 700 }}>SHORT</span>
                  </div>
                </div>
                <div style={{ fontSize: 7, color: "#555", fontFamily: "monospace", marginBottom: 3, paddingLeft: 2 }}>LEVERAGE</div>
                <div className="flex gap-1 mb-2">
                  {["1x", "2x", "5x", "10x", "20x"].map((lev, i) => (
                    <span key={lev} style={{ flex: 1, textAlign: "center", fontSize: 8, fontFamily: "monospace", fontWeight: 700, padding: "3px 0", borderRadius: 2, border: i === 1 ? "1px solid #00ff41" : "1px solid #333", color: i === 1 ? "#000" : "#666", background: i === 1 ? "#00ff41" : "transparent" }}>{lev}</span>
                  ))}
                </div>
                <div className="mb-2 px-0.5">
                  <div style={{ height: 2, background: "#333", borderRadius: 1, position: "relative" }}>
                    <div style={{ width: "15%", height: "100%", background: "#00ff41", borderRadius: 1 }} />
                    <div style={{ position: "absolute", top: -2.5, left: "15%", width: 7, height: 7, background: "#00ff41", borderRadius: "50%", transform: "translateX(-50%)" }} />
                  </div>
                  <div className="flex justify-between mt-0.5">
                    <span style={{ fontSize: 6, color: "#555", fontFamily: "monospace" }}>1x</span>
                    <span style={{ fontSize: 6, color: "#555", fontFamily: "monospace" }}>25x</span>
                  </div>
                </div>
                <div className="space-y-1 mb-2">
                  <div className="flex justify-between px-0.5">
                    <span style={{ fontSize: 7, color: "#555", fontFamily: "monospace" }}>ENTRY PRICE (EST.)</span>
                    <span style={{ fontSize: 9, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>{priceStr}</span>
                  </div>
                  <div className="flex justify-between px-0.5">
                    <span style={{ fontSize: 7, color: "#555", fontFamily: "monospace" }}>COLLATERAL (USDC)</span>
                    <div className="flex items-center gap-0.5">
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2775ca" }} />
                      <span style={{ fontSize: 9, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>100.00</span>
                    </div>
                  </div>
                </div>
                <div style={{ background: "#00ff41", borderRadius: 3, padding: "5px 0", textAlign: "center" }}>
                  <span style={{ fontSize: 9, color: "#000", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.05em" }}>REVIEW TRADE &gt;</span>
                </div>
              </div>
            </StepCard>
            <div className="hidden md:flex items-center justify-end mt-2">
              <span style={{ color: "#00ff41", fontSize: 18, fontFamily: "monospace" }}>&rarr;</span>
            </div>
          </div>

          {/* STEP 3 */}
          <div className="flex-1 flex flex-col min-h-0">
            <StepCard num={3} title="MANAGE PNL" subtitle="Track your position and manage risk" delay={300} visible={stepsVisible}>
              <div style={{ padding: "8px 8px 6px" }}>
                <div className="flex items-center gap-2 mb-1.5" style={{ background: "#1a1a1a", borderRadius: 3, padding: "4px 6px" }}>
                  <span style={{ fontSize: 8, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>MY POSITION</span>
                  <span style={{ fontSize: 6, background: "rgba(0,255,65,0.15)", color: "#00ff41", padding: "1px 3px", borderRadius: 2, fontFamily: "monospace", fontWeight: 700 }}>LONG</span>
                  <span style={{ fontSize: 6, color: "#555", fontFamily: "monospace" }}>2x</span>
                </div>
                <div className="flex items-center gap-1.5 mb-2 px-0.5">
                  <img src={LANDING_CARDS[3].image} alt="" style={{ width: 14, height: 14, borderRadius: 2, objectFit: "cover" }} />
                  <div>
                    <span style={{ fontSize: 8, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>Pikachu ex - 276/217</span>
                    <div style={{ fontSize: 7, color: "#555", fontFamily: "monospace" }}>Ascended Heroes (ASC)</div>
                  </div>
                </div>
                <div className="mb-2 px-0.5">
                  <div style={{ fontSize: 6, color: "#555", fontFamily: "monospace", marginBottom: 1 }}>OPEN PNL (USDC)</div>
                  <div style={{ fontSize: 16, color: pnlColor, fontFamily: "monospace", fontWeight: 700, lineHeight: 1 }}>{pnlStr}</div>
                  <div style={{ fontSize: 9, color: pnlColor, fontFamily: "monospace" }}>{pnlPctStr}</div>
                </div>
                <div className="mb-2" style={{ height: 32, position: "relative", overflow: "hidden" }}>
                  <svg width="100%" height="32" viewBox="0 0 200 32" preserveAspectRatio="none">
                    <polyline points="0,28 20,24 40,26 60,20 80,22 100,16 120,14 140,12 155,9 170,6 185,8 200,4" fill="none" stroke="#00ff41" strokeWidth="1.5" />
                    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00ff41" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#00ff41" stopOpacity="0" />
                    </linearGradient>
                    <polygon points="0,28 20,24 40,26 60,20 80,22 100,16 120,14 140,12 155,9 170,6 185,8 200,4 200,32 0,32" fill="url(#cg)" />
                  </svg>
                </div>
                <div className="space-y-1 mb-2">
                  <div className="flex justify-between px-0.5">
                    <span style={{ fontSize: 7, color: "#555", fontFamily: "monospace" }}>ENTRY PRICE</span>
                    <span style={{ fontSize: 8, color: "#fff", fontFamily: "monospace", fontWeight: 700 }}>{entryStr}</span>
                  </div>
                  <div className="flex justify-between px-0.5">
                    <span style={{ fontSize: 7, color: "#555", fontFamily: "monospace" }}>CURRENT PRICE</span>
                    <span style={{ fontSize: 8, color: "#00ff41", fontFamily: "monospace", fontWeight: 700 }}>{currentStr}</span>
                  </div>
                  <div className="flex justify-between px-0.5">
                    <span style={{ fontSize: 7, color: "#555", fontFamily: "monospace" }}>LIQUIDATION PRICE</span>
                    <span style={{ fontSize: 8, color: "#ff3355", fontFamily: "monospace", fontWeight: 700 }}>{liqStr}</span>
                  </div>
                </div>
                <div className="flex gap-1.5 mb-1.5">
                  <div className="flex-1 flex items-center justify-center" style={{ border: "1px solid #333", borderRadius: 3, padding: "3px 0" }}>
                    <span style={{ fontSize: 7, color: "#aaa", fontFamily: "monospace", fontWeight: 700 }}>ADD MARGIN</span>
                  </div>
                  <div className="flex-1 flex items-center justify-center" style={{ border: "1px solid #333", borderRadius: 3, padding: "3px 0" }}>
                    <span style={{ fontSize: 7, color: "#aaa", fontFamily: "monospace", fontWeight: 700 }}>SET STOP LOSS</span>
                  </div>
                </div>
                <div style={{ background: "rgba(255,51,85,0.15)", border: "1px solid rgba(255,51,85,0.4)", borderRadius: 3, padding: "5px 0", textAlign: "center" }}>
                  <span style={{ fontSize: 8, color: "#ff3355", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.05em" }}>CLOSE POSITION</span>
                </div>
              </div>
            </StepCard>
          </div>
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="flex flex-col items-center gap-2 w-full flex-shrink-0 pt-3 md:pt-4 pb-3 md:pb-4 transition-all duration-700" style={{ opacity: ctaVisible ? 1 : 0, transform: ctaVisible ? "translateY(0)" : "translateY(10px)", maxWidth: 340 }}>
        <button
          onClick={handleStartTrading}
          className="uppercase tracking-wider font-bold w-full"
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "clamp(12px, 1.8vw, 14px)", padding: "12px 40px", background: "#00ff41", color: "#000000", border: "none", boxShadow: "4px 4px 0 #009926, 0 0 30px rgba(0,255,65,0.15)", cursor: "pointer", letterSpacing: "0.08em" }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "2px 2px 0 #009926, 0 0 40px rgba(0,255,65,0.25)"; e.currentTarget.style.transform = "translate(2px, 2px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "4px 4px 0 #009926, 0 0 30px rgba(0,255,65,0.15)"; e.currentTarget.style.transform = "translate(0, 0)"; }}
        >
          {checking ? "Checking..." : "Start Trading"}
        </button>
        {externalWallets.length > 0 && (
          <button onClick={() => setShowWalletPicker(true)} className="uppercase tracking-wider font-bold w-full" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "clamp(11px, 1.6vw, 12px)", padding: "10px 40px", background: "transparent", color: "#00ff41", border: "1px solid rgba(0,255,65,0.4)", cursor: "pointer", letterSpacing: "0.08em", transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#00ff41"; e.currentTarget.style.background = "rgba(0,255,65,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(0,255,65,0.4)"; e.currentTarget.style.background = "transparent"; }}>
            Connect Wallet
          </button>
        )}
        <Link href="/docs" className="text-[10px] font-mono mt-1" style={{ color: "#555", textDecoration: "none" }}>Read the Docs</Link>
      </div>
    </div>
  );
}

function StepCard({ num, title, subtitle, delay, visible, children }: { num: number; title: string; subtitle: string; delay: number; visible: boolean; children: React.ReactNode }) {
  return (
    <div className="flex-1 transition-all duration-700 ease-out flex flex-col" style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transitionDelay: `${delay}ms`, background: "#111", border: "1px solid rgba(0,255,65,0.2)", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ padding: "6px 8px 4px", borderBottom: "1px solid #1a1a1a" }}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, background: "#00ff41", color: "#000", fontSize: 9, fontWeight: 700, fontFamily: "monospace", borderRadius: 2 }}>{num}</span>
          <span style={{ fontSize: 10, color: "#fff", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.05em" }}>{title}</span>
        </div>
        <div style={{ fontSize: 8, color: "#555", fontFamily: "monospace", paddingLeft: 22 }}>{subtitle}</div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
