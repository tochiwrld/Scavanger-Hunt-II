"use client";
// Browser helpers for the star hunt: Lagos map loader, distance maths and push alerts.
import { api } from "./client.js";

export const LAGOS = [6.5, 3.44];
const R = 6371000, rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
/** Distance (m) and compass bearing (degrees) from a to b. */
export function distBearing(a, b) {
  const la1 = rad(a.lat), la2 = rad(b.lat), dl = rad(b.lon - a.lon);
  const x = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dl / 2) ** 2;
  const d = 2 * R * Math.asin(Math.sqrt(x));
  const y = Math.sin(dl) * Math.cos(la2), z = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl);
  return { d, b: (deg(Math.atan2(y, z)) + 360) % 360 };
}
export const fmtDist = (d) => (d < 1000 ? Math.round(d) + " m" : (d / 1000).toFixed(d < 10000 ? 1 : 0) + " km");

/** Leaflet (the map library) is loaded only when a map is shown. */
let leaflet = null;
export function loadLeaflet() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.L) return Promise.resolve(window.L);
  if (leaflet) return leaflet;
  leaflet = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    js.onload = () => resolve(window.L);
    js.onerror = () => { leaflet = null; reject(new Error("The map couldn't load")); };
    document.head.appendChild(js);
  });
  return leaflet;
}

/** Your position once (asks the first time). Resolves null if location is off. */
export function whereAmI(timeout = 12000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 15000 },
    );
  });
}

/* ---------- push alerts ---------- */
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
/** iPhones only allow web push once PrimaHunt is on the home screen. */
export const needsHomeScreen = () => {
  if (typeof window === "undefined") return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone;
  return ios && !standalone;
};
const keyBytes = (b64) => { const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) || navigator.serviceWorker.register("/sw.js", { scope: "/" });
}
/** Is this phone/browser subscribed right now? */
export async function pushState() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub ? "on" : "off";
}
/** Ask for permission (must be called from a tap), subscribe, and tell the server. */
export async function enablePush() {
  if (!pushSupported()) throw new Error(needsHomeScreen() ? "On iPhone, add PrimaHunt to your home screen first (Share → Add to Home Screen), then open it from there." : "This browser can't show notifications.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(perm === "denied" ? "Notifications are blocked for PrimaHunt. Allow them in your browser settings." : "Notifications weren't allowed.");
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { key } = await api("/push/key");
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await api("/push/subscribe", { method: "POST", json: sub.toJSON() });
  return true;
}
export async function disablePush() {
  const reg = pushSupported() ? await navigator.serviceWorker.getRegistration("/") : null;
  const sub = reg && (await reg.pushManager.getSubscription());
  await api("/push/unsubscribe", { method: "POST", json: { endpoint: sub?.endpoint } });
  if (sub) await sub.unsubscribe().catch(() => {});
}

/**
 * Phone alerts without a switch: if the browser already allows notifications, (re)connect this phone quietly;
 * if it hasn't asked yet, the browser's own question appears on the person's first tap (iPhone needs a tap,
 * and Chrome shows the full question rather than a hidden one when it follows a tap).
 * Browsers never allow push without that one question, so this is as automatic as it can be.
 */
export function autoPush() {
  if (typeof window === "undefined" || !pushSupported()) return () => {};
  const p = Notification.permission;
  if (p === "denied") return () => {};
  const connect = async () => {
    try {
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const { key } = await api("/push/key");
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      await api("/push/subscribe", { method: "POST", json: sub.toJSON() });
      try { sessionStorage.setItem("push-synced", "1"); } catch {}
    } catch { /* not allowed or not available: stay quiet */ }
  };
  if (p === "granted") {
    let synced = false;
    try { synced = sessionStorage.getItem("push-synced") === "1"; } catch {}
    if (!synced) connect();
    return () => {};
  }
  let done = false;
  // Never ask while a camera is open or on a tap that opens one: phones show one question at a time.
  const opensCamera = (t) => document.querySelector(".cam-overlay,.sh-hunt,.sh-sheet") || (t && t.closest && t.closest(".star-btn,button.slot,.sh-row,.sh-pick,[data-cam],.inst,.inst-card"));
  const onTap = (e) => {
    if (done || opensCamera(e.target)) return;
    done = true;
    off();
    Notification.requestPermission().then((r) => { if (r === "granted") connect(); }).catch(() => {});
  };
  const off = () => { window.removeEventListener("pointerup", onTap, true); window.removeEventListener("keydown", onTap, true); };
  window.addEventListener("pointerup", onTap, true);
  window.addEventListener("keydown", onTap, true);
  return off;
}
