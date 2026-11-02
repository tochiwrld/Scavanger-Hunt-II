// Browser-side helpers shared by all pages.
export const TZ = "Africa/Lagos";
export const fmtDate = (d) => new Date(d).toLocaleString("en-NG", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
export const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");
export const cap = (s) => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);
export const toLagosInput = (iso) => new Date(new Date(iso).getTime() + 3600000).toISOString().slice(0, 16);
export const fromLagosInput = (v) => new Date(v + ":00+01:00").toISOString();
export const PALETTE = ["#FFC800", "#FF8A5B", "#3DDC97", "#5AB0FF", "#C79BFF", "#FF7BB8", "#B9E22E", "#FFAE00"];
export const colorFor = (id) => PALETTE[(Number(id) || 0) % PALETTE.length];
export const medal = (r, pts) => (pts > 0 && r <= 3 ? ["🥇", "🥈", "🥉"][r - 1] : r + ".");
export const statusLabel = { not_submitted: "Not submitted", pending: "Pending review", approved: "Approved", rejected: "Rejected" };
export const statusIcon = { not_submitted: "⬜", pending: "⏳", approved: "✅", rejected: "❌" };

export async function api(path, { method = "GET", json, form } = {}) {
  const opt = { method, headers: {}, credentials: "same-origin" };
  if (json) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(json); }
  if (form) opt.body = form;
  const r = await fetch("/api" + path, opt);
  let d = null;
  try { d = await r.json(); } catch {}
  if (!r.ok) {
    const e = new Error(d?.error || "Something went wrong. Try again.");
    e.status = r.status;
    // Privacy notice not accepted yet: the signed-in app shows the acknowledgement, then returns here.
    if (r.status === 428 && typeof window !== "undefined" && !location.pathname.startsWith("/g/")) location.assign("/?next=" + encodeURIComponent(location.pathname));
    throw e;
  }
  return d;
}

export function fmtLeft(ms) {
  if (ms <= 0) return "Challenge closed";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d === 0 && h === 0) return `${m} min ${s % 60} sec left`;
  const p = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  return `${d ? p(d, "day") + " " : ""}${p(h, "hour")} ${p(m, "minute")} left`;
}

export function burst() {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#FFC800", "#14110F", "#00A86B", "#2457FF", "#E5382F", "#fff"];
  for (let i = 0; i < 28; i++) {
    const c = document.createElement("i");
    c.className = "confetti";
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 190;
    c.style.cssText = `background:${colors[i % colors.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d + 80}px;--rot:${Math.random() * 720}deg`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 1200);
  }
}

/** Shrink a phone photo in the browser before upload (fast on mobile data). */
export async function shrink(file, max = 1600, quality = 0.82) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return (await new Promise((r) => c.toBlob(r, "image/jpeg", quality))) || file;
  } catch { return file; }
}

export const safeNext = (n) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : null);

export function zoom(src) {
  const lb = document.getElementById("lightbox");
  if (!lb) return;
  lb.innerHTML = "";
  const img = document.createElement("img");
  img.src = src; img.alt = "";
  lb.appendChild(img);
  lb.hidden = false;
  lb.onclick = () => { lb.hidden = true; };
}

/** Light/dark switch. Dark is the default; the choice is remembered on this device. */
export function toggleTheme() {
  const light = document.documentElement.classList.toggle("light");
  try { localStorage.setItem("theme", light ? "light" : "dark"); } catch {}
  return light;
}
export const isLight = () => typeof document !== "undefined" && document.documentElement.classList.contains("light");
export const pad2 = (n) => String(n).padStart(2, "0");

/** Global Search rank tiers, by all-time points earned in public groups. */
export const TIERS = [[0, "Rookie"], [50, "Bronze"], [150, "Silver"], [400, "Gold"], [800, "Platinum"], [1500, "Diamond"], [3000, "Legend"]];
export function tierFor(points) {
  let i = 0;
  for (let k = 0; k < TIERS.length; k++) if (points >= TIERS[k][0]) i = k;
  const [min, name] = TIERS[i];
  const next = TIERS[i + 1];
  return { name, min, index: i, next: next ? { name: next[1], at: next[0], need: next[0] - points } : null };
}

/** 1v1 time limits (minutes), matching DUEL_DURATIONS on the server. */
export const DUEL_TIMES = [[30, "30 minutes"], [60, "1 hour"], [180, "3 hours"], [720, "12 hours"], [1440, "1 day"], [4320, "3 days"], [10080, "7 days"]];
export const fmtMinutes = (m) => DUEL_TIMES.find(([v]) => v === m)?.[1] || `${m} minutes`;

/** "just now", "5m", "3h", "2d", then a date. */
export function ago(d, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 7 * 86400) return Math.floor(s / 86400) + "d ago";
  return new Date(d).toLocaleDateString("en-NG", { timeZone: TZ, day: "numeric", month: "short" });
}
