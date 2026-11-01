"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TZ } from "../lib/client.js";
import Icon from "./icons.js";

const MAX_EDGE = 1600;

/** Burns "nickname · item · Sun 1 Nov, 18:48" into the bottom of a photo so admins can see when and for what it was taken. */
function stamp(ctx, w, h, label) {
  const when = new Date().toLocaleString("en-NG", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  const size = Math.max(14, Math.round(w / 38));
  const pad = Math.round(size * 0.7);
  const barH = size + pad * 2;
  ctx.fillStyle = "rgba(10,10,20,0.62)";
  ctx.fillRect(0, h - barH, w, barH);
  ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFD21F";
  const tag = "HUNT WEEK";
  ctx.fillText(tag, pad, h - barH / 2);
  const tagW = ctx.measureText(tag + "  ").width;
  ctx.fillStyle = "#ffffff";
  let text = `${label} · ${when}`;
  while (text.length > 8 && ctx.measureText(text).width > w - tagW - pad * 2) text = text.slice(0, -2);
  ctx.fillText(text, pad + tagW, h - barH / 2);
}

function toCanvas(src, sw, sh, label) {
  const s = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.round(sw * s);
  c.height = Math.round(sh * s);
  const ctx = c.getContext("2d");
  ctx.drawImage(src, 0, 0, c.width, c.height);
  stamp(ctx, c.width, c.height, label);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.85));
}

/**
 * Full-screen live camera. No gallery, no file picker: the photo is taken right now.
 * Browsers without camera access through the page fall back to the phone's own camera (capture="environment").
 */
export default function CameraCapture({ label, onShot, onClose }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [facing, setFacing] = useState("environment");
  const [state, setState] = useState("starting"); // starting | live | error | fallback
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setState("fallback"); return undefined; }
    let dead = false;
    setState("starting");
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stop();
        stream.current = s;
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
        setState("live");
      })
      .catch((e) => {
        if (dead) return;
        setState("error");
        setError(e?.name === "NotAllowedError" || e?.name === "SecurityError"
          ? "Camera access is blocked. Allow the camera for this site in your browser settings, then try again."
          : e?.name === "NotFoundError" || e?.name === "OverconstrainedError" ? "No camera was found on this device." : "The camera couldn't start. Close other apps using it and try again.");
      });
    return () => { dead = true; };
  }, [facing, attempt, stop]);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") { stop(); onClose(); } };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose, stop]);

  const shoot = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    const blob = await toCanvas(v, v.videoWidth, v.videoHeight, label);
    stop();
    onShot(blob);
  };
  const fromPhoneCamera = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      onShot(await toCanvas(bmp, bmp.width, bmp.height, label));
    } catch { setBusy(false); setState("error"); setError("That photo couldn't be read. Try again."); }
  };
  const close = () => { stop(); onClose(); };

  return (
    <div className="cam-overlay" role="dialog" aria-modal="true" aria-label="Camera">
      {state === "live" || state === "starting" ? <video ref={video} className={"cam-video" + (facing === "user" ? " mirror" : "")} playsInline muted autoPlay /> : null}
      {state === "starting" ? <div className="cam-msg">Starting camera…</div> : null}
      {state === "error" ? <div className="cam-msg"><Icon n="camera" size={34} /><p>{error}</p><button className="btn" onClick={() => { setError(""); setBusy(false); setAttempt((a) => a + 1); }}>Try again</button></div> : null}
      {state === "fallback" ? (
        <div className="cam-msg">
          <Icon n="camera" size={34} />
          <p>Take the photo with your camera now.</p>
          <label className="btn">Open camera<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => fromPhoneCamera(e.target.files[0])} /></label>
        </div>
      ) : null}
      <div className="cam-top"><span className="cam-tag">Live camera · photos are taken now</span></div>
      <div className="cam-bar">
        <button className="cam-btn" onClick={close} aria-label="Close camera"><span aria-hidden="true" style={{ fontSize: 26, lineHeight: 1 }}>×</span></button>
        <button className="cam-shutter" onClick={shoot} disabled={state !== "live" || busy} aria-label="Take photo"><span /></button>
        <button className="cam-btn" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} disabled={state !== "live"} aria-label="Switch camera"><Icon n="flip" size={22} /></button>
      </div>
    </div>
  );
}
