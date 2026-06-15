"use client";

import { useEffect, useRef, useState } from "react";

export function BgMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    // Respect saved preference
    const saved = localStorage.getItem("pokeliquid_music_muted");
    if (saved === "1") setMuted(true);
  }, []);

  useEffect(() => {
    if (!started) {
      // Auto-play on first user interaction
      const handler = () => {
        if (audioRef.current && !started) {
          audioRef.current.volume = 0.3;
          audioRef.current.play().catch(() => {});
          setStarted(true);
        }
      };
      window.addEventListener("click", handler, { once: true });
      window.addEventListener("keydown", handler, { once: true });
      window.addEventListener("touchstart", handler, { once: true });
      return () => {
        window.removeEventListener("click", handler);
        window.removeEventListener("keydown", handler);
        window.removeEventListener("touchstart", handler);
      };
    }
  }, [started]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
    localStorage.setItem("pokeliquid_music_muted", muted ? "1" : "0");
  }, [muted]);

  return (
    <>
      <audio ref={audioRef} src="/title-screen.mp3" loop preload="auto" />
      <button
        onClick={() => setMuted((m) => !m)}
        className="fixed bottom-16 md:bottom-4 right-4 z-50 w-8 h-8 flex items-center justify-center rounded-full transition-colors"
        style={{
          background: muted ? "#1a1a1a" : "rgba(0,255,65,0.1)",
          border: `1px solid ${muted ? "#333" : "#00ff41"}`,
          fontSize: 14,
        }}
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </>
  );
}
