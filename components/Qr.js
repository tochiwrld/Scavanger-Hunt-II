"use client";
import { useMemo, useState } from "react";
import { qrMatrix, qrPath } from "../lib/qr.js";
import { useApp } from "./Providers.js";
import Icon from "./icons.js";
import { Sheet } from "./ui.js";

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

/** A printable picture of the code (for a stand, a table card or a phone wallpaper at events). */
async function qrPicture(text, title, sub) {
  const m = qrMatrix(text);
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const font = getComputedStyle(document.documentElement).getPropertyValue("--nf-head").trim() || "sans-serif";
  const body = getComputedStyle(document.documentElement).getPropertyValue("--nf-body").trim() || "sans-serif";
  x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
  x.textAlign = "center"; x.fillStyle = "#16141f";
  x.font = `800 64px ${font}`; x.fillText("PrimaHunt", W / 2, 130);
  x.font = `800 52px ${font}`;
  const t = title.length > 30 ? title.slice(0, 29) + "…" : title;
  x.fillText(t, W / 2, 230);
  const n = m.length + 8, cell = Math.floor(820 / n), size = cell * n, ox = (W - size) / 2, oy = 290;
  x.fillStyle = "#000";
  m.forEach((row, r) => row.forEach((on, col) => { if (on) x.fillRect(ox + (col + 4) * cell, oy + (r + 4) * cell, cell, cell); }));
  x.fillStyle = "#3a3646"; x.font = `500 40px ${body}`;
  x.fillText(sub, W / 2, oy + size + 80);
  x.font = `500 32px ${body}`; x.fillStyle = "#6b6778";
  x.fillText("primahunt.com", W / 2, H - 60);
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
