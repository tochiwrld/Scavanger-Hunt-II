"use client";
import { useState } from "react";
import { useApp } from "./Providers.js";
import Icon from "./icons.js";

const YELLOW = "#FFD21F", INK = "#16141F", PAPER = "#F5F3FF", MUTE = "#A8A3BF";

/** Finished result as a 1080x1350 picture (Instagram/WhatsApp status size) in PrimaHunt's colours. */
export async function resultCard({ kicker, title, line, big, sub }) {
  try { await document.fonts?.ready; } catch {}
  const head = getComputedStyle(document.querySelector("h1,h2") || document.body).fontFamily;
  const body = getComputedStyle(document.body).fontFamily;
  const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono") || "monospace";
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  x.fillStyle = INK; x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W * 0.85, H * 0.1, 40, W * 0.85, H * 0.1, 900);
  g.addColorStop(0, "rgba(255,210,31,.22)"); g.addColorStop(1, "rgba(255,210,31,0)");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // Viewfinder corners: the brand frame.
  x.strokeStyle = YELLOW; x.lineWidth = 12; x.lineCap = "square";
  const m = 56, L = 110;
  [[m, m, 1, 1], [W - m, m, -1, 1], [W - m, H - m, -1, -1], [m, H - m, 1, -1]].forEach(([px, py, sx, sy]) => {
    x.beginPath(); x.moveTo(px, py + sy * L); x.lineTo(px, py); x.lineTo(px + sx * L, py); x.stroke();
  });
  // Wordmark
  x.textBaseline = "alphabetic";
  x.font = `800 64px ${head}`;
  x.fillStyle = PAPER; x.fillText("Prima", 120, 200);
  const pw = x.measureText("Prima").width;
  x.fillStyle = YELLOW; x.fillText("Hunt", 120 + pw, 200);
  const wrap = (text, font, size, maxW, y, color, lh = 1.08) => {
    x.font = `${font} ${size}px ${font.includes("800") ? head : body}`;
    x.fillStyle = color;
    const words = String(text).split(" "); let lineTxt = ""; const lines = [];
    for (const w of words) { const t = lineTxt ? lineTxt + " " + w : w; if (x.measureText(t).width > maxW && lineTxt) { lines.push(lineTxt); lineTxt = w; } else lineTxt = t; }
    if (lineTxt) lines.push(lineTxt);
    lines.forEach((l, i) => x.fillText(l, 120, y + i * size * lh));
    return y + lines.length * size * lh;
  };
  let y = 400;
  x.font = `700 34px ${body}`; x.fillStyle = YELLOW; x.fillText(String(kicker || "").toUpperCase(), 120, y); y += 110;
  y = wrap(String(title).toUpperCase(), "800", 112, W - 240, y, PAPER, 1.0) + 30;
  if (big) { x.font = `700 150px ${mono}`; x.fillStyle = YELLOW; x.fillText(big, 120, y + 130); y += 200; }
  if (line) y = wrap(line, "500", 44, W - 240, y + 20, PAPER, 1.3);
  if (sub) wrap(sub, "500", 34, W - 240, y + 20, MUTE, 1.3);
  x.font = `700 36px ${body}`; x.fillStyle = MUTE; x.fillText("primahunt.com", 120, H - 130);
  x.fillStyle = YELLOW; x.font = `700 36px ${body}`;
  const tag = "Hunt it. Snap it. Win the week.";
  x.fillText(tag, W - 120 - x.measureText(tag).width, H - 130);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

const open = (u) => window.open(u, "_blank", "noopener,noreferrer");

/**
 * One-tap sharing of a result: WhatsApp, X, Facebook, Telegram, Instagram & more (the phone's share sheet, with the picture),
 * copy, and save the picture. Only what's passed in is shared: no photos, no emails.
 */
export function ShareResult({ text, card, label = "Share your result" }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const url = typeof window !== "undefined" ? window.location.origin : "https://primahunt.com";
  const full = `${text} ${url}`;
  const e = encodeURIComponent;
  const picture = async () => new File([await resultCard(card)], "primahunt-result.png", { type: "image/png" });
  const more = async () => {
    setBusy(true);
    try {
      const file = card ? await picture() : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: full });
      else if (navigator.share) await navigator.share({ title: "PrimaHunt", text, url });
      else { await save(file); toast("Picture saved. Post it on Instagram, TikTok or Snapchat.", "good"); }
    } catch (err) { if (err?.name !== "AbortError") toast("Sharing didn't work on this browser. Try Copy instead.", "bad"); }
    setBusy(false);
  };
  const save = async (f) => {
    const file = f || (await picture());
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(full); toast("Copied. Paste it anywhere.", "good"); } catch { window.prompt("Copy this:", full); } };
  return (
    <div className="share-result">
      <div className="share-label">{label}</div>
      <div className="share-grid">
        <button type="button" className="share-btn wa" onClick={() => open(`https://wa.me/?text=${e(full)}`)}>WhatsApp</button>
        <button type="button" className="share-btn xx" onClick={() => open(`https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}`)}>X</button>
        <button type="button" className="share-btn fb" onClick={() => open(`https://www.facebook.com/sharer/sharer.php?u=${e(url)}&quote=${e(text)}`)}>Facebook</button>
        <button type="button" className="share-btn tg" onClick={() => open(`https://t.me/share/url?url=${e(url)}&text=${e(text)}`)}>Telegram</button>
        <button type="button" className="share-btn ig" onClick={more} disabled={busy}>{busy ? "…" : "Instagram & more"}</button>
        <button type="button" className="share-btn" onClick={copy}><Icon n="copy" size={15} />Copy</button>
      </div>
      {card ? <button type="button" className="link share-save" onClick={() => save().catch(() => toast("Couldn't make the picture.", "bad"))}><Icon n="download" size={14} />Save result picture</button> : null}
    </div>
  );
}
