"use client";
import { useEffect, useState } from "react";
import { burst } from "../lib/client.js";
import Icon from "./icons.js";

/** The "YOU WIN" animation (converted from the GIF to a small looping video). */
export function WinVideo({ className = "" }) {
  return (
    <video className={"win-video " + className} autoPlay muted loop playsInline poster="/img/you-win.jpg" aria-label="You win!">
      <source src="/img/you-win.webm" type="video/webm" />
      <source src="/img/you-win.mp4" type="video/mp4" />
    </video>
  );
}

/** Full-screen celebration the first time the winner opens a finished 1v1. Only ever rendered for the winner. */
export function WinOverlay({ storageKey, title, line }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(storageKey) === "1"; localStorage.setItem(storageKey, "1"); } catch {}
    if (!seen) { setOpen(true); burst(); }
  }, [storageKey]);
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
        <WinVideo />
        <h2>{title}</h2>
        <p className="muted" style={{ margin: "6px 0 18px" }}>{line}</p>
        <button className="btn block" onClick={() => setOpen(false)}>Let's go<Icon n="arrow" size={18} /></button>
      </div>
    </div>
  );
}

