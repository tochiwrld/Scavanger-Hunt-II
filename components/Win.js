"use client";
import { useEffect, useState } from "react";
import { burst } from "../lib/client.js";
import Icon from "./icons.js";
import { ShareResult } from "./Share.js";

/** The "YOU WIN" animation (converted from the GIF to a small looping video). */
export function WinVideo({ className = "" }) {
  return (
    <video className={"win-video " + className} autoPlay muted loop playsInline poster="/img/you-win.jpg" aria-label="You win!">
      <source src="/img/you-win.webm" type="video/webm" />
      <source src="/img/you-win.mp4" type="video/mp4" />
    </video>
  );
}

/**
 * Full-screen result pop-up, shown once per match/week (remembered on this device).
 * Winners get the "YOU WIN" animation; everyone gets one-tap sharing.
 */
export function WinOverlay({ storageKey, title, line, result = "won", share }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(storageKey) === "1"; localStorage.setItem(storageKey, "1"); } catch {}
    if (!seen) { setOpen(true); if (result === "won") burst(); }
  }, [storageKey, result]);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  if (!open) return null;
  return (
    <div className="win-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={() => setOpen(false)}>
      <div className="win-box" onClick={(e) => e.stopPropagation()}>
        {result === "won" ? <WinVideo /> : <div className="result-emoji" aria-hidden="true">{result === "tie" ? "🤝" : result === "podium" ? "🎯" : "😤"}</div>}
        <h2>{title}</h2>
        <p className="muted" style={{ margin: "6px 0 16px" }}>{line}</p>
        {share ? <ShareResult {...share} label={result === "won" ? "Share the win" : "Share your result"} /> : null}
        <button className="btn block" style={{ marginTop: 14 }} onClick={() => setOpen(false)}>{result === "won" ? "Let's go" : "Close"}<Icon n="arrow" size={18} /></button>
      </div>
    </div>
  );
}
