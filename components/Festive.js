"use client";
import { useEffect, useState } from "react";

/** Pip's seasonal greeting on My hunts, only while the Christmas look is on. Dismissed once per season on this phone. */
export default function FestiveBanner() {
  const [msg, setMsg] = useState(null);
  const [key, setKey] = useState("");
  useEffect(() => {
    if (!document.documentElement.classList.contains("festive")) return;
    const now = new Date(Date.now() + 3600e3); // Lagos
    const jan = now.getUTCMonth() === 0;
    const k = "ph-xmas-" + (jan ? now.getUTCFullYear() - 1 : now.getUTCFullYear());
    try { if (localStorage.getItem(k)) return; } catch {}
    setKey(k);
    setMsg(jan ? ["Happy New Year, hunter! 🎆", "New year, new hunts. Let's get this bread."] : ["Merry Christmas, hunter! 🎄", "Festive hunts drop every Monday till January."]);
  }, []);
  if (!msg) return null;
  const close = () => { try { localStorage.setItem(key, "1"); } catch {} setMsg(null); };
  return (
    <div className="xmas-banner" role="status">
      <div className="grow"><b>{msg[0]}</b><span>{msg[1]}</span></div>
      <button className="x" onClick={close} aria-label="Dismiss">×</button>
    </div>
  );
}
