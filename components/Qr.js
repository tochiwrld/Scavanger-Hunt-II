"use client";
import { useMemo, useState } from "react";
import { qrMatrix, qrPath } from "../lib/qr.js";
import { useApp } from "./Providers.js";
import Icon from "./icons.js";
import { Sheet } from "./ui.js";
import { isFestive, seasonGreeting } from "../lib/client.js";
import { drawSnow, hatOnLetter, loadImg } from "./Share.js";

/** The code itself: black on white with the standard quiet zone, so any phone camera reads it in any theme. */
export function QrCode({ text, size = 280 }) {
  const m = useMemo(() => { try { return qrMatrix(text); } catch { return null; } }, [text]);
  if (!m) return <p className="muted">This link is too long for a QR code. Use Copy or Share instead.</p>;
  const n = m.length + 8;
  return (
    <svg className="qr-svg" viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label="QR code" shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={qrPath(m)} fill="#000" />
    </svg>
  );
}

/** A printable picture of the code (for a stand, a table card or a phone wallpaper at events). Festive in the Christmas season. */
export async function qrPicture(text, title, sub) {
  const m = qrMatrix(text);
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const font = css.getPropertyValue("--nf-head").trim() || "sans-serif";
  const body = css.getPropertyValue("--nf-body").trim() || "sans-serif";
  const xmas = isFestive();
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
  x.textAlign = "center";
  const t = title.length > 30 ? title.slice(0, 29) + "…" : title;
  if (xmas) {
    // Green header with a snow cap, Santa hat on the wordmark, holly sprigs and a candy-cane stripe at the bottom.
    x.fillStyle = "#1A7F47"; x.fillRect(0, 0, W, 300);
    drawSnow(x, W, 300, { flakes: 0 });
    x.fillStyle = "#fff"; x.font = `800 64px ${font}`; x.fillText("PrimaHunt", W / 2, 150);
    const hat = await loadImg("/festive/hat.svg");
    if (hat) { const w = x.measureText("PrimaHunt").width; hatOnLetter(x, hat, "P", W / 2 - w / 2, 150); }
    x.font = `800 50px ${font}`; x.fillText(t, W / 2, 240);
    const holly = (cx, cy, flip) => {
      x.save(); x.translate(cx, cy); x.scale(flip, 1); x.fillStyle = "#1F9D55";
      for (const r of [-0.5, 0.5]) { x.save(); x.rotate(r); x.beginPath(); x.ellipse(-34, 0, 34, 14, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
      x.fillStyle = "#D7263D"; [[-6, -6], [8, -2], [0, 9]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 9, 0, Math.PI * 2); x.fill(); });
      x.restore();
    };
    holly(96, 1180, 1); holly(W - 96, 1180, -1);
    for (let px = 0, i = 0; px < W; px += 40, i++) { x.fillStyle = i % 2 ? "#1F9D55" : "#D7263D"; x.fillRect(px, H - 22, 40, 22); }
  } else {
    x.fillStyle = "#16141f";
    x.font = `800 64px ${font}`; x.fillText("PrimaHunt", W / 2, 130);
    x.font = `800 52px ${font}`; x.fillText(t, W / 2, 230);
  }
  const n = m.length + 8, cell = Math.floor((xmas ? 760 : 820) / n), size = cell * n, ox = (W - size) / 2, oy = xmas ? 330 : 290;
  x.fillStyle = "#000";
  m.forEach((row, r) => row.forEach((on, col) => { if (on) x.fillRect(ox + (col + 4) * cell, oy + (r + 4) * cell, cell, cell); }));
  x.fillStyle = "#3a3646"; x.font = `500 40px ${body}`;
  x.fillText(sub, W / 2, oy + size + 70);
  x.font = `500 32px ${body}`; x.fillStyle = "#6b6778";
  x.fillText(xmas ? `${seasonGreeting()} from PrimaHunt ${seasonGreeting() === "Merry Christmas" ? "🎄" : "🎆"} · primahunt.com` : "primahunt.com", W / 2, H - (xmas ? 70 : 60));
  return new Promise((r) => c.toBlob(r, "image/png"));
}

/**
 * "Show QR code" button + sheet. People scan it with their camera at events, so the link never has to be
 * sent to strangers' phones or posted anywhere.
 * title: shown above the code ("Join Ghetto Search"); sub: one line under it ("Scan to join the hunt").
 */
export default function QrButton({ link, title, sub = "Point your phone camera here", className = "btn block ghost", label = "Show QR code" }) {
  const { toast } = useApp();
  const [open, setOpen] = useState(false);
  const save = async () => {
    try {
      const blob = await qrPicture(link, title, sub);
      const file = new File([blob], "primahunt-qr.png", { type: "image/png" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast("QR picture saved. Print it or show it from your gallery.", "good");
    } catch { toast("Couldn't make the picture.", "bad"); }
  };
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}><Icon n="qr" size={18} />{label}</button>
      {open ? (
        <Sheet onClose={() => setOpen(false)}>
          <div className="qr-sheet">
            {isFestive() ? <div className="eyebrow" style={{ color: "var(--xmas-red)" }}>🎄 Christmas hunt</div> : null}
            <h2>{title}</h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>{sub}</p>
            <div className="qr-box"><QrCode text={link} /></div>
            <p className="muted qr-note">Turn your screen brightness up. They scan it with their phone camera and the invite opens. Nothing to send, no number swapping.</p>
            <button type="button" className="btn block" onClick={save}><Icon n="download" size={18} />Save QR picture</button>
            <button type="button" className="btn block ghost" onClick={() => setOpen(false)}>Done</button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
