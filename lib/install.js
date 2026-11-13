"use client";
// "Add PrimaHunt to your home screen": catches Android's install prompt, knows when we're already installed,
// and decides when Pip may suggest installing (good moments only, never on first sight, never nagging).

const KEY = "ph-install"; // localStorage: { shown, last, snoozeUntil, visits, lastVisit, done }
const SNOOZE_MS = 3 * 864e5; // "Maybe later" = quiet for 3 days
const MAX_SHOWS = 4; // Pip asks at most this many times on one browser

let deferred = null; // Android/Chrome's saved install prompt
const subs = new Set();
const notify = () => subs.forEach((f) => f());

export function initInstall() {
  if (typeof window === "undefined" || initInstall.done) return;
  initInstall.done = true;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; notify(); });
  window.addEventListener("appinstalled", () => { deferred = null; save({ done: true }); notify(); });
}
export const onInstallChange = (f) => { subs.add(f); return () => subs.delete(f); };

export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true);

/** Which instructions fit this phone. */
export function platform() {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|Twitter|musical_ly/i.test(ua)) return "inapp";
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "ios-other" : "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}
export const canPromptInstall = () => Boolean(deferred);

/** Shows the real install question where the browser offers one. Returns "accepted" | "dismissed" | "unavailable". */
export async function promptInstall() {
  if (!deferred) return "unavailable";
  const e = deferred;
  deferred = null; notify();
  e.prompt();
  const r = await e.userChoice.catch(() => ({ outcome: "dismissed" }));
  if (r.outcome === "accepted") save({ done: true });
  return r.outcome === "accepted" ? "accepted" : "dismissed";
}

function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } }
function save(patch) { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch })); } catch {} }

/** May Pip suggest installing right now? */
export function mayAsk() {
  if (isStandalone()) return false;
  const s = load();
  if (s.done || (s.shown || 0) >= MAX_SHOWS) return false;
  if (s.snoozeUntil && Date.now() < s.snoozeUntil) return false;
  if (s.last && Date.now() - s.last < 20 * 60e3) return false; // never twice in one sitting
  return true;
}
export const markShown = () => { const s = load(); save({ shown: (s.shown || 0) + 1, last: Date.now() }); };
export const snooze = () => save({ snoozeUntil: Date.now() + SNOOZE_MS });

/** Counts real return visits (a gap of 30+ minutes) and says whether this is the second one. */
export function countVisit() {
  const s = load();
  const now = Date.now();
  if (s.lastVisit && now - s.lastVisit < 30 * 60e3) { save({ lastVisit: now }); return false; }
  const visits = (s.visits || 0) + 1;
  save({ visits, lastVisit: now });
  return visits === 2;
}

/**
 * A good moment happened (joined a hunt, sent finds, first approval, checked the board…).
 * The install sheet listens for this. "register" and "join" open the bigger welcome screen.
 */
export function installMoment(kind) {
  if (typeof window === "undefined") return;
  if (kind === "submit") {
    // Two finds sent back to back (same sitting).
    let n = 0;
    try { n = (+sessionStorage.getItem("ph-submits") || 0) + 1; sessionStorage.setItem("ph-submits", String(n)); } catch {}
    if (n < 2) return;
  }
  try { sessionStorage.setItem("ph-install-moment", kind); } catch {}
  window.dispatchEvent(new CustomEvent("ph:moment", { detail: kind }));
}
export function takeMoment() {
  try { const k = sessionStorage.getItem("ph-install-moment"); sessionStorage.removeItem("ph-install-moment"); return k; } catch { return null; }
}
