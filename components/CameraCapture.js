"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PHOTO_EDGE, TZ, encodeCanvas } from "../lib/client.js";
import Icon from "./icons.js";

const MAX_EDGE = PHOTO_EDGE; // 1280px keeps each photo around 150-300 KB

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
  const tag = "PrimaHunt";
  ctx.fillText(tag, pad, h - barH / 2);
  const tagW = ctx.measureText(tag + "  ").width;
  ctx.fillStyle = "#ffffff";
  let text = `${label} · ${when}`;
  while (text.length > 8 && ctx.measureText(text).width > w - tagW - pad * 2) text = text.slice(0, -2);
  ctx.fillText(text, pad + tagW, h - barH / 2);
}

/** crop > 1 keeps only the centre 1/crop of the frame (digital zoom), so the saved photo matches the zoomed preview. */
function toCanvas(src, sw, sh, label, mirror = false, crop = 1) {
  const cw = sw / crop, ch = sh / crop, cx = (sw - cw) / 2, cy = (sh - ch) / 2;
  const s = Math.min(1, MAX_EDGE / Math.max(cw, ch));
  const c = document.createElement("canvas");
  c.width = Math.round(cw * s);
  c.height = Math.round(ch * s);
  const ctx = c.getContext("2d");
  if (mirror) { ctx.save(); ctx.translate(c.width, 0); ctx.scale(-1, 1); } // selfies are saved the way they looked on screen
  ctx.drawImage(src, cx, cy, cw, ch, 0, 0, c.width, c.height);
  if (mirror) ctx.restore();
  stamp(ctx, c.width, c.height, label);
  return encodeCanvas(c, 0.8); // WebP where the browser supports it, otherwise JPEG
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
  // Zoom: the camera's own (optical/sensor) zoom when the browser exposes it, otherwise a centre crop.
  const [zoom, setZoomState] = useState(1);
  const [zr, setZr] = useState({ min: 1, max: 4, hw: false });
  const pinch = useRef(null);
  // Flash: the phone's torch on the back camera (where the browser allows it), a white screen flash on the front camera.
  const [flash, setFlash] = useState(false);
  const [torch, setTorch] = useState(false); // does this camera expose a torch?
  const [glow, setGlow] = useState(false);

  const stop = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setState("fallback"); return undefined; }
    let dead = false;
    setState("starting");
    stop(); // release the current camera first: most phones can't open the front and back cameras at once
    const ask = (fm) => navigator.mediaDevices.getUserMedia({ video: { facingMode: fm, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
    // Try the exact camera first so the flip really switches; fall back to "ideal" on devices that report facing modes oddly.
    ask({ exact: facing }).catch(() => ask({ ideal: facing }))
      .then((s) => {
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); }
        const caps = s.getVideoTracks()[0]?.getCapabilities?.() || {};
        if (caps.zoom && caps.zoom.max > caps.zoom.min) setZr({ min: caps.zoom.min, max: Math.min(caps.zoom.max, 10), hw: true });
        else setZr({ min: 1, max: 4, hw: false });
        setZoomState(caps.zoom ? Math.max(caps.zoom.min, 1) : 1);
        setTorch(Boolean(caps.torch));
        setFlash(false);
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

  const setZoom = useCallback((z) => {
    const v = Math.round(Math.min(zr.max, Math.max(zr.min, z)) * 10) / 10;
    setZoomState(v);
    if (zr.hw) {
      const track = stream.current?.getVideoTracks()[0];
      track?.applyConstraints({ advanced: [{ zoom: v }] }).catch(() => setZr((r) => ({ ...r, hw: false, min: 1, max: 4 })));
    }
  }, [zr]);
  // Two-finger pinch anywhere on the preview.
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e) => { if (e.touches.length === 2) pinch.current = { d: dist(e.touches), z: zoom }; };
  const onTouchMove = (e) => { if (e.touches.length === 2 && pinch.current) { e.preventDefault(); setZoom(pinch.current.z * (dist(e.touches) / pinch.current.d)); } };
  const onTouchEnd = (e) => { if (e.touches.length < 2) pinch.current = null; };
  const toggleFlash = async () => {
    const on = !flash;
    if (facing === "environment") {
      const track = stream.current?.getVideoTracks()[0];
      if (!torch || !track) { setNote("Your phone's browser doesn't let websites switch on the flash. Find more light, or flip to the front camera for a screen flash."); return; }
      try { await track.applyConstraints({ advanced: [{ torch: on }] }); } catch { setNote("The flash couldn't be turned on."); return; }
    }
    setFlash(on);
  };
  const [note, setNoteState] = useState("");
  const noteTimer = useRef(null);
  const setNote = (t) => { setNoteState(t); clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => setNoteState(""), 4000); };
  const presets = [1, 2, 3, 5].filter((z) => z >= zr.min && z <= zr.max);

  const shoot = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    if (flash && facing === "user") { setGlow(true); await new Promise((r) => setTimeout(r, 350)); } // light the face with a white screen
    const blob = await toCanvas(v, v.videoWidth, v.videoHeight, label, facing === "user", zr.hw ? 1 : zoom);
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
    <div className="cam-overlay" role="dialog" aria-modal="true" aria-label="Camera" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {state === "live" || state === "starting" ? <video ref={video} className="cam-video" style={{ transform: `${facing === "user" ? "scaleX(-1) " : ""}scale(${zr.hw ? 1 : zoom})` }} playsInline muted autoPlay /> : null}
      {state === "starting" ? <div className="cam-msg">Starting camera…</div> : null}
      {state === "error" ? <div className="cam-msg"><Icon n="camera" size={34} /><p>{error}</p><button className="btn" onClick={() => { setError(""); setBusy(false); setAttempt((a) => a + 1); }}>Try again</button><button className="btn ghost" onClick={() => { setError(""); setBusy(false); setFacing((f) => (f === "environment" ? "user" : "environment")); }}>Try the {facing === "user" ? "back" : "front"} camera</button></div> : null}
      {state === "fallback" ? (
        <div className="cam-msg">
          <Icon n="camera" size={34} />
          <p>Take the photo with your camera now.</p>
          <label className="btn">Back camera<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => fromPhoneCamera(e.target.files[0])} /></label>
          <label className="btn ghost">Front camera<input type="file" accept="image/*" capture="user" hidden onChange={(e) => fromPhoneCamera(e.target.files[0])} /></label>
        </div>
      ) : null}
      {glow ? <div className="cam-glow" aria-hidden="true" /> : null}
      <div className="cam-top">
        <span className="cam-tag">Live camera · photos are taken now</span>
        {state === "live" ? <button className={"cam-btn cam-flash" + (flash ? " on" : "")} onClick={toggleFlash} aria-pressed={flash} aria-label={flash ? "Turn flash off" : "Turn flash on"}><Icon n={flash ? "zap" : "zapoff"} size={20} /></button> : null}
      </div>
      {note ? <div className="cam-note" role="status">{note}</div> : null}
      {state === "live" ? (
        <div className="cam-zoom" role="group" aria-label="Zoom">
          {presets.map((z) => <button key={z} className={Math.abs(zoom - z) < 0.05 ? "on" : ""} onClick={() => setZoom(z)} aria-label={`Zoom ${z}x`}>{z}×</button>)}
          {!presets.some((z) => Math.abs(zoom - z) < 0.05) ? <span className="cam-zoom-now">{zoom.toFixed(1)}×</span> : null}
        </div>
      ) : null}
      <div className="cam-bar">
        <button className="cam-btn" onClick={close} aria-label="Close camera"><span aria-hidden="true" style={{ fontSize: 26, lineHeight: 1 }}>×</span></button>
        <button className="cam-shutter" onClick={shoot} disabled={state !== "live" || busy} aria-label="Take photo"><span /></button>
        <button className="cam-btn cam-flip" onClick={() => { setZoomState(1); setFlash(false); setFacing((f) => (f === "environment" ? "user" : "environment")); }} disabled={state === "starting" || busy} aria-label={facing === "user" ? "Switch to back camera" : "Switch to front camera"}><Icon n="flip" size={22} /><small>{facing === "user" ? "Back" : "Front"}</small></button>
      </div>
    </div>
  );
}
