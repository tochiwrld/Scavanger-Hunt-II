"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/client.js";
import { distBearing, fmtDist } from "../lib/stars-client.js";
import { dirFrom, focalFor, poseFromHeadingPitch, poseFromOrientation, poseHeading, project, smoothPose, wrap180 } from "../lib/ar.js";
import StarMap from "./StarMap.js";
import Icon from "./icons.js";

/* ---------- the 3D star: a faceted, bevelled gold star built from triangles and lit, drawn on a 2D canvas ---------- */
const STAR_TRIS = (() => {
  const R = 1, r = 0.42, depth = 0.22, dome = 0.38, ring = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R; ring.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  const tris = [], F = [0, 0, depth + dome], B = [0, 0, -depth - dome];
  for (let i = 0; i < 10; i++) {
    const a = ring[i], b = ring[(i + 1) % 10];
    tris.push([F, [a[0], a[1], depth], [b[0], b[1], depth]]);
    tris.push([B, [b[0], b[1], -depth], [a[0], a[1], -depth]]);
    tris.push([[a[0], a[1], depth], [a[0], a[1], -depth], [b[0], b[1], -depth]]);
    tris.push([[a[0], a[1], depth], [b[0], b[1], -depth], [b[0], b[1], depth]]);
  }
  return tris;
})();
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const LIGHT = norm([-0.45, -0.7, 0.9]), HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);
function drawStar(ctx, x, y, size, t, alpha) {
  const ry = t, rx = Math.sin(t * 0.7) * 0.28 - 0.12;
  const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
  const rot = (p) => { const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy; return [x1, p[1] * cx - z1 * sx, p[1] * sx + z1 * cx]; };
  const camZ = 4.2, f = size * camZ;
  ctx.save(); ctx.globalAlpha = alpha;
  const glow = ctx.createRadialGradient(x, y, size * 0.2, x, y, size * 2.3);
  glow.addColorStop(0, "rgba(255,214,40,.5)"); glow.addColorStop(1, "rgba(255,214,40,0)");
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, size * 2.3, 0, Math.PI * 2); ctx.fill();
  const faces = [];
  for (const tri of STAR_TRIS) {
    const v = tri.map(rot);
    const n = norm(cross(sub3(v[1], v[0]), sub3(v[2], v[0])));
    if (n[2] <= 0.02) continue;
    const pts = v.map((p) => { const k = f / (camZ - p[2]); return [x + p[0] * k, y + p[1] * k]; });
    const diff = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const spec = Math.pow(Math.max(0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), 28);
    const k = 0.32 + 0.78 * diff;
    faces.push({ pts, z: (v[0][2] + v[1][2] + v[2][2]) / 3, c: `rgb(${Math.round(Math.min(255, 255 * k + 255 * spec))},${Math.round(Math.min(255, 186 * k + 245 * spec))},${Math.round(Math.min(255, 18 * k + 200 * spec))})` });
  }
  faces.sort((a, b) => a.z - b.z);
  ctx.lineJoin = "round"; ctx.lineWidth = 0.8;
  for (const fc of faces) {
    ctx.beginPath(); ctx.moveTo(fc.pts[0][0], fc.pts[0][1]); ctx.lineTo(fc.pts[1][0], fc.pts[1][1]); ctx.lineTo(fc.pts[2][0], fc.pts[2][1]); ctx.closePath();
    ctx.fillStyle = fc.c; ctx.strokeStyle = fc.c; ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  for (let i = 0; i < 6; i++) {
    const a = t * 1.3 + (i * Math.PI) / 3, rr = size * (1.45 + 0.15 * Math.sin(t * 3 + i));
    const s2 = 2 + 1.5 * Math.sin(t * 4 + i);
    ctx.fillStyle = `rgba(255,255,255,${0.55 * alpha})`; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.55, Math.max(0.5, s2), 0, Math.PI * 2); ctx.fill();
  }
}
const turnText = (rel) => (Math.abs(rel) < 12 ? "Straight ahead" : rel > 0 ? "Turn right" : "Turn left");
const needsMotionTap = () => typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function";

/**
 * Full-screen star hunt. Real mode hunts `target` (or the nearest live star); the server checks you are really there.
 * Practice mode hides a star in the room, for fun, with no pips.
 */
export default function StarHunt({ stars, target, onTarget, onClose, onOpenMap, onCaught }) {
  const root = useRef(null), video = useRef(null), canvas = useRef(null);
  const [mode, setMode] = useState("real");
  const [phase, setPhase] = useState(needsMotionTap() ? "ask" : "run");
  const [won, setWon] = useState(null);
  const [me, setMe] = useState(null);
  const [camOk, setCamOk] = useState(true);
  const camOkRef = useRef(true);
  camOkRef.current = camOk;
  // Location: wait (asking/finding) | ask (browser hasn't asked yet) | denied (blocked) | off (device can't find you) | ok
  const [geo, setGeo] = useState("wait");
  const live = useRef({});
  live.current.mode = mode; live.current.target = target; live.current.stars = stars;

  // Pick the nearest uncaught star once we know where you are.
  useEffect(() => {
    if (!target && me && stars?.length) {
      const open = stars.filter((s) => !s.caught);
      if (open.length) onTarget(open.reduce((a, b) => (distBearing(me, a).d <= distBearing(me, b).d ? a : b)));
    }
  }, [me, stars, target, onTarget]);

  useEffect(() => {
    if (phase !== "run") return undefined;
    const L = live.current, el = root.current, cv = canvas.current, ctx = cv.getContext("2d");
    const $ = (k) => el.querySelector(`[data-k="${k}"]`);
    let stream = null, raf = 0, geo = null, dead = false, wake = null, pingT = 0, lastT = performance.now();
    // Pose: where the back camera points. From the motion sensor on phones, from dragging on computers.
    let rawPose = null, pose = null, hasMotion = false, hasAbs = false, northOffset = null, dragH = 0, dragP = 0;
    let practiceBearing = 120, practiceElev = 5, spin = 0, particles = [], catching = 0, fix = null;
    let anchor = null, sizeS = 40; // when you're close, the star stays put instead of following jumpy GPS
    L.fix = null; L.trail = null;

    const resize = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); addEventListener("resize", resize);

    // Keep the screen awake while hunting (walking to a star takes a while).
    const lockScreen = async () => { try { if (document.visibilityState === "visible" && navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch { /* not supported */ } };
    const onVis = () => { if (document.visibilityState === "visible") lockScreen(); };
    lockScreen(); document.addEventListener("visibilitychange", onVis);

    // Camera first, location after: phones show one permission question at a time, and a location
    // request made while the camera question is open can come back as "denied" without the person ever seeing it.
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (dead) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = stream; setCamOk(true);
      } catch { setCamOk(false); }
      if (!dead) startGeo();
    })();

    const screenAngle = () => (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    const onOrient = (e) => {
      if (e.alpha == null || e.beta == null || e.gamma == null) return;
      if (e.type === "deviceorientationabsolute") hasAbs = true;
      else if (hasAbs) return; // Android: once true-north readings arrive, ignore the relative ones
      let alpha = e.alpha;
      if (typeof e.webkitCompassHeading === "number" && e.webkitCompassHeading >= 0) {
        // iPhone: alpha starts at an arbitrary direction. Learn the offset to true north from the compass while the
        // phone isn't held upright (the compass reading gets unreliable then) and keep using it when it is.
        const off = wrap180(e.webkitCompassHeading - (360 - e.alpha));
        const flatEnough = Math.abs(e.beta) < 55;
        if (northOffset == null) northOffset = off;
        else if (flatEnough) northOffset += wrap180(off - northOffset) * 0.1;
        alpha = e.alpha - northOffset;
      }
      rawPose = poseFromOrientation(alpha, e.beta, e.gamma, screenAngle());
      if (!hasMotion) { hasMotion = true; practiceBearing = (poseHeading(rawPose) + 75) % 360; }
    };
    addEventListener("deviceorientationabsolute", onOrient, true);
    addEventListener("deviceorientation", onOrient, true);

    const onPos = (p) => {
      if (dead) return;
      fix = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
      L.fix = fix; setGeo("ok");
      setMe((old) => (!old || distBearing(old, fix).d > 8 ? fix : old));
    };
    const geoOpts = { enableHighAccuracy: true, maximumAge: 2000 };
    let retried = false;
    const onErr = (e) => {
      if (dead || fix) return;
      if (e && e.code === 1) {
        // A "denied" can be a clash with another permission question; try once more before saying it's blocked.
        if (!retried) { retried = true; setTimeout(() => !dead && !fix && startWatch(), 1200); return; }
        setGeo("denied");
      } else if (e && e.code === 3) {
        startWatch(); // timed out: keep waiting quietly, GPS can be slow indoors
      } else setGeo("off");
    };
    const startWatch = () => {
      if (!navigator.geolocation) return setGeo("off");
      if (geo != null) navigator.geolocation.clearWatch(geo);
      geo = navigator.geolocation.watchPosition(onPos, onErr, geoOpts);
    };
    // Called from a tap, so the browser shows its "Allow location" question.
    L.askGeo = () => {
      if (!navigator.geolocation) return setGeo("off");
      setGeo("wait"); retried = true;
      navigator.geolocation.getCurrentPosition((p) => { onPos(p); startWatch(); }, (e) => { if (!dead && !fix) setGeo(e && e.code === 1 ? "denied" : e && e.code === 3 ? "wait" : "off"); if (e && e.code === 3) startWatch(); }, { ...geoOpts, timeout: 20000 });
    };
    function startGeo() {
      if (!navigator.geolocation) return setGeo("off");
      startWatch();
      navigator.permissions?.query({ name: "geolocation" }).then((st) => {
        const apply = () => { if (dead || fix) return; if (st.state === "prompt") setTimeout(() => { if (!dead && !fix && st.state === "prompt") setGeo("ask"); }, 4000); else if (st.state === "granted") { setGeo("wait"); startWatch(); } };
        apply(); st.onchange = apply;
      }).catch(() => {});
    }

    // While you're within 300 m of the star, the phone checks in every few seconds. The server signs a short trail
    // of these check-ins, and a catch needs a believable one (time near the star, natural GPS wobble, walking speed).
    const ping = async () => {
      const t = L.target, f = L.fix;
      if (dead || L.mode !== "real" || !t || !f) return;
      if (distBearing(f, t).d > 300) return;
      try {
        const r = await api(`/stars/${t.id}/ping`, { method: "POST", json: { lat: f.lat, lon: f.lon, acc: f.acc, trail: L.trail && L.trail.star === t.id ? L.trail.token : null } });
        if (!dead && L.target && L.target.id === t.id) L.trail = { star: t.id, token: r.trail };
      } catch { /* try again on the next tick */ }
    };
    pingT = setInterval(ping, 5000);

    // No motion sensor (computers): drag to look around.
    let drag = null;
    const down = (e) => { if (hasMotion) return; drag = { x: e.clientX, y: e.clientY, h: dragH, p: dragP }; cv.setPointerCapture?.(e.pointerId); };
    const move = (e) => { if (!drag) return; dragH = (drag.h - (e.clientX - drag.x) * 0.25 + 360) % 360; dragP = Math.max(-60, Math.min(60, drag.p + (e.clientY - drag.y) * 0.25)); };
    const up = () => (drag = null);
    cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move); cv.addEventListener("pointerup", up);
    cv.addEventListener("click", () => { if (!$("catch").disabled) L.doCatch(); });

    L.newPractice = () => { practiceBearing = ((pose ? poseHeading(pose) : dragH) + 60 + Math.random() * 120) % 360; practiceElev = 2 + Math.random() * 8; };
    L.doCatch = async () => {
      if (catching) return;
      const fx = catchFx(); // made inside the tap, so iPhones allow the sound
      const real = L.mode === "real" && L.target;
      if (real) {
        const f = L.fix;
        try {
          await ping(); // one last check-in right at the star
          const r = await api(`/stars/${L.target.id}/catch`, { method: "POST", json: { lat: f.lat, lon: f.lon, acc: f.acc, trail: L.trail && L.trail.star === L.target.id ? L.trail.token : null } });
          burst(); fx(); setTimeout(() => !dead && setWon({ pips: r.pips, name: r.name, me: r.me, real: true }), 650);
          onCaught?.(L.target.id, r.me);
        } catch (e) {
          const h = $("hint"); h.textContent = e.message; h.dataset.err = "1";
          setTimeout(() => { delete h.dataset.err; }, 6000);
        }
        return;
      }
      burst(); fx(); setTimeout(() => !dead && setWon({ pips: 0, real: false }), 650);
    };
    function burst() {
      catching = 1;
      navigator.vibrate?.([30, 40, 60]);
      for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6; particles.push({ x: innerWidth / 2, y: innerHeight * 0.46, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, life: 30 + Math.random() * 25 }); }
    }
    // A catch you can feel without vibration (iPhones don't allow it): a gold screen flash and a short chime.
    function catchFx() {
      let ac = null;
      try { const AC = window.AudioContext || window.webkitAudioContext; ac = AC ? new AC() : null; ac?.resume?.(); } catch { ac = null; }
      return () => {
        const fl = $("flash"); if (fl) { fl.classList.remove("go"); void fl.offsetWidth; fl.classList.add("go"); }
        if (!ac) return;
        try {
          const t0 = ac.currentTime;
          [784, 988, 1319].forEach((hz, i) => {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = "triangle"; o.frequency.value = hz;
            g.gain.setValueAtTime(0.0001, t0 + i * 0.09); g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.09 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.09 + 0.35);
            o.connect(g).connect(ac.destination); o.start(t0 + i * 0.09); o.stop(t0 + i * 0.09 + 0.4);
          });
          setTimeout(() => ac.close?.(), 1200);
        } catch { /* no sound, no problem */ }
      };
    }
    L.reset = () => { catching = 0; particles = []; };

    const loop = (now) => {
      if (dead) return;
      const dt = Math.min(0.1, Math.max(0, (now - lastT) / 1000)); lastT = now;
      const W = innerWidth, H = innerHeight, cx = W / 2, cy = H * 0.46;
      ctx.clearRect(0, 0, W, H);
      pose = smoothPose(pose, hasMotion && rawPose ? rawPose : poseFromHeadingPitch(dragH, dragP), dt);
      const camH = poseHeading(pose);
      const v = video.current;
      const focal = focalFor(W, H, camOkRef.current && v ? v.videoWidth : 0, camOkRef.current && v ? v.videoHeight : 0);
      const real = L.mode === "real";
      let bearing = practiceBearing, elev = practiceElev, dist = null, close = true, show = true, wantSize = 58;
      if (real) {
        if (L.target && fix) {
          const db = distBearing(fix, L.target); dist = db.d;
          close = dist <= L.target.radius_m + Math.min(fix.acc || 0, 30) && (fix.acc || 0) <= 120;
          if (dist <= 45) { if (!anchor || anchor.id !== L.target.id) anchor = { id: L.target.id, b: db.b }; }
          else if (dist > 70 || (anchor && anchor.id !== L.target.id)) anchor = null;
          bearing = anchor ? anchor.b : db.b; elev = anchor ? 2 : 4;
          wantSize = anchor ? 72 : Math.max(24, Math.min(66, 1500 / Math.max(dist, 12)));
        } else { show = false; close = false; anchor = null; }
      }
      sizeS += (wantSize - sizeS) * (1 - Math.exp(-dt / 0.25));
      const pr = project(pose, dirFrom(bearing, elev), cx, cy, focal);
      const x = pr.x, y = pr.y;
      spin += 2.7 * dt;
      if (catching) {
        catching += 1;
        const k = Math.min(1, catching / 22);
        const sx = pr.ahead ? x : cx, sy = pr.ahead ? y : cy;
        drawStar(ctx, sx + (cx - sx) * k, sy + (cy - sy) * k, sizeS * (1 + k * 0.9), spin * 3, Math.max(0, 1 - Math.max(0, (catching - 22) / 14)));
      } else if (show && pr.ahead && x > -120 && x < W + 120 && y > -120 && y < H + 120) {
        drawStar(ctx, x, y, sizeS, spin, close ? 1 : 0.5);
      }
      particles = particles.filter((p) => (p.life -= 1) > 0);
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; ctx.fillStyle = `rgba(255,${200 + (p.life % 50)},40,${p.life / 50})`; ctx.fillRect(p.x, p.y, 4, 4); }

      const inSight = show && pr.ahead && Math.abs(x - cx) < 75 && Math.abs(y - cy) < 90;
      const ready = inSight && close && !catching;
      $("ret").classList.toggle("lock", ready);
      $("catch").disabled = !ready;
      const rel = wrap180(bearing - camH);
      // Arrow: towards the star on screen when it's in front of you, otherwise left/right by compass.
      const arrowDeg = pr.ahead && Math.abs(x - cx) < W && Math.abs(y - cy) < H ? Math.atan2(x - cx, cy - y) * 180 / Math.PI : rel;
      $("arrow").style.transform = `rotate(${arrowDeg}deg)`;
      if (real) {
        if (!L.target) { $("dist").textContent = fix ? "No stars left" : "Finding you…"; $("dir").textContent = fix ? "Check the map for new drops" : "Waiting for your location"; }
        else if (dist == null) { $("dist").textContent = "Finding you…"; $("dir").textContent = "Step outside for a better GPS fix"; }
        else {
          $("dist").textContent = fmtDist(dist) + " away";
          $("dir").textContent = close ? (inSight ? "It's right there. Catch it!" : turnText(rel)) : anchor ? "Almost there. Keep walking" : (dist > 2000 ? "Head towards " + L.target.area : turnText(rel).replace("Turn ", "Walk ").replace("Straight ahead", "Walk straight ahead"));
        }
        $("sub").textContent = L.target ? `${L.target.name} · ${L.target.pips} pips` : "Real stars around Lagos";
        if (!$("hint").dataset.err) $("hint").textContent = L.target && dist != null && !close ? `Get within ${L.target.radius_m} m to catch it` : hasMotion ? "Move your phone to look around" : "Drag to look around";
      } else {
        $("dist").textContent = inSight ? "Got it in sight" : Math.abs(rel) > 90 ? "Behind you" : "Close by";
        $("dir").textContent = inSight ? "Tap the star button" : turnText(rel);
        $("sub").textContent = "Practice · no pips";
        $("hint").textContent = hasMotion ? "Move your phone to look around" : "Drag to look around";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      dead = true; cancelAnimationFrame(raf); clearInterval(pingT);
      removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      wake?.release?.().catch?.(() => {});
      removeEventListener("deviceorientationabsolute", onOrient, true);
      removeEventListener("deviceorientation", onOrient, true);
      if (geo != null) navigator.geolocation.clearWatch(geo);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move); cv.removeEventListener("pointerup", up);
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onClose]);

  const allow = async () => {
    try { await DeviceOrientationEvent.requestPermission(); } catch { /* drag to look around instead */ }
    setPhase("run");
  };
  const again = () => { setWon(null); live.current.reset?.(); if (mode === "practice") live.current.newPractice?.(); else onTarget(null); };

  return (
    <div className="sh-hunt" ref={root} role="dialog" aria-modal="true" aria-label="Star hunt camera">
      <video ref={video} playsInline muted autoPlay hidden={!camOk} />
      {camOk ? null : <div className="fake" />}
      <canvas ref={canvas} />
      <div className="sh-flash" data-k="flash" aria-hidden="true" />
      <div className="sh-ret" data-k="ret"><i /><i /><i /><i /></div>
      <div className="sh-top">
        <button className="sh-btn" onClick={onClose} aria-label="Close the camera"><Icon n="close" size={20} /></button>
        <div className="sh-title"><b>Star hunt</b><small data-k="sub">Real stars around Lagos</small></div>
        <div className="sh-modes" role="group" aria-label="Mode">
          <button aria-pressed={mode === "real"} onClick={() => setMode("real")}>Real stars</button>
          <button aria-pressed={mode === "practice"} onClick={() => { setMode("practice"); live.current.newPractice?.(); }}>Practice</button>
        </div>
      </div>
      {mode === "real" ? (
        <StarMap className="sh-mini" interactive={false} zoom={me && target ? 14 : 11} stars={stars || []} me={me} target={target} center={me || (target ? { lat: target.lat, lon: target.lon } : null)}>
          <button className="tap" onClick={onOpenMap} aria-label="Open the Lagos star map" /><span className="lbl">Map</span>
        </StarMap>
      ) : null}
      <div className="sh-bottom">
        {mode === "real" && geo !== "ok" && geo !== "wait" ? (
          <div className="sh-geo" role="status">
            {geo === "ask" ? (<>
              <b>Turn on location to hunt real stars</b>
              <span>We check you're at the star. Your location is never saved.</span>
              <button className="btn sm" onClick={() => live.current.askGeo?.()}><Icon n="locate" size={16} />Turn on location</button>
            </>) : geo === "denied" ? (<>
              <b>Your phone isn't sharing location</b>
              <span><b>iPhone:</b> Settings → Privacy &amp; Security → Location Services → turn it on, then Safari Websites (or Chrome) → While Using.<br /><b>Android:</b> turn Location on, then Chrome → site settings → primahunt.com → Location → Allow.<br /><b>Computer:</b> click the icon left of the web address → Location → Allow.</span>
              <span>Then reload the page so the browser picks up the change.</span>
              <div className="row" style={{ gap: 8, justifyContent: "center" }}>
                <button className="btn sm" onClick={() => window.location.reload()}>Reload</button>
                <button className="btn sm ghost" onClick={() => live.current.askGeo?.()}>Try again</button>
              </div>
            </>) : (<>
              <b>Can't find where you are</b>
              <span>Check that location is on for this device and this browser (on a Mac: System Settings → Privacy &amp; Security → Location Services). Phones work best outside.</span>
              <button className="btn sm" onClick={() => live.current.askGeo?.()}>Try again</button>
            </>)}
          </div>
        ) : null}
        <div className="sh-radar">
          <div className="sh-dial"><svg data-k="arrow" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l6 18-6-4-6 4z" fill="oklch(88% .18 95)" /></svg></div>
          <div><b data-k="dist">Finding you…</b><small data-k="dir">Move your phone to look around</small></div>
        </div>
        <button className="sh-catch" data-k="catch" disabled aria-label="Catch the star" onClick={() => live.current.doCatch?.()}><Icon n="star" size={30} /></button>
        <div className="sh-hint" data-k="hint" />
      </div>
      {won ? (
        <div className="sh-layer dim"><div className="sh-box">
          <div className="eyebrow">{won.real ? "Star caught" : "Practice catch"}</div>
          <div className="big">{won.real ? `+${won.pips} pips` : "Nice!"}</div>
          <p className="muted" style={{ margin: 0 }}>{won.real ? `${won.name}. That's ${won.me.caught} star${won.me.caught === 1 ? "" : "s"} and ${won.me.pips} star pips in total.` : "That one was just practice. Real stars are on the Lagos map, worth 20 to 50 pips."}</p>
          <button className="btn block" onClick={again}>{won.real ? "Find the next star" : "Again"}</button>
          {won.real ? null : <button className="btn block ghost" onClick={() => { setWon(null); live.current.reset?.(); setMode("real"); }}>Hunt real stars</button>}
        </div></div>
      ) : null}
      {phase === "ask" ? (
        <div className="sh-layer solid"><div className="sh-box" style={{ background: "transparent", border: 0 }}>
          <h2>Camera, motion and location</h2>
          <p className="muted" style={{ margin: 0 }}>Star hunt uses your camera and motion sensor so the star stays put as you look around, and your location to check you're at the star. Nothing is recorded, and your location is never saved.</p>
          <button className="btn block" onClick={allow}>Allow and start</button>
          <button className="btn block ghost" onClick={onClose}>Not now</button>
        </div></div>
      ) : null}
    </div>
  );
}
