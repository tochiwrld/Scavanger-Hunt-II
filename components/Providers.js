"use client";
import { initInstall, installMoment } from "../lib/install.js";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, burst } from "../lib/client.js";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export default function Providers({ children }) {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [groups, setGroups] = useState(null);
  const [unread, setUnread] = useState(0);
  const [offset, setOffset] = useState(0);
  const [toasts, setToasts] = useState([]);
  // Star hunt: live stars, the camera, and the full Lagos map, shared by the bottom bar, home and /stars.
  const [stars, setStars] = useState(null);
  const [starMe, setStarMe] = useState(null);
  const [starAdmin, setStarAdmin] = useState(false);
  const [starTarget, setStarTarget] = useState(null);
  const [starHuntOpen, setStarHuntOpen] = useState(false);
  const [starMapOpen, setStarMapOpen] = useState(false);
  const loadStars = useCallback(async () => {
    try { const d = await api("/stars"); setStars(d.stars); setStarMe(d.me); setStarAdmin(d.admin); return d.stars; } catch { setStars((s) => s || []); return []; }
  }, []);
  const openStarHunt = useCallback((target = null) => { setStarTarget(target); setStarMapOpen(false); setStarHuntOpen(true); }, []);
  const starCaught = useCallback((id, totals) => { setStars((list) => (list || []).map((x) => (x.id === id ? { ...x, caught: true, catches: x.catches + 1 } : x))); if (totals) setStarMe(totals); }, []);

  const toast = useCallback((msg, kind = "") => {
    const id = Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    // Fade out quickly (exit faster than enter), then remove.
    setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, out: true } : x))), 4350);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const d = await api("/me");
      setMe(d.user); setUnread(d.unread || 0); setOffset(d.now - Date.now());
      return d.user;
    } catch { setMe(null); return null; } finally { setReady(true); }
  }, []);

  const refreshGroups = useCallback(async () => {
    try {
      const d = await api("/groups");
      setGroups(d.groups); setOffset(d.now - Date.now());
      return d.groups;
    } catch { return null; }
  }, []);

  useEffect(() => { refreshMe(); }, [refreshMe]);
  // Catch Android's install prompt early (it fires once, soon after load) so "Add to home screen" can use it later.
  useEffect(() => {
    initInstall();
    // The service worker makes PrimaHunt installable, shows the offline page and receives push alerts.
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  // Poll for new alerts: celebrate approvals, announce new weeks.
  useEffect(() => {
    if (!me) return undefined;
    const check = async () => {
      if (document.hidden) return;
      try {
        const m = await api("/me");
        if (!m.user || !m.user.privacy_ok) return; // nothing else loads until the privacy notice is accepted
        setUnread(m.unread);
        if (!m.unread) return;
        const d = await api("/notifications");
        const last = +localStorage.getItem("lastNid") || 0;
        const fresh = d.notifications.filter((n) => !n.read_at && n.id > last).reverse();
        if (d.notifications[0]) localStorage.setItem("lastNid", String(Math.max(last, d.notifications[0].id)));
        fresh.slice(-3).forEach((n) => toast(`${n.title}: ${n.message}`, n.type === "approved" ? "good" : n.type === "rejected" ? "bad" : ""));
        if (fresh.some((n) => n.type === "approved")) { burst(); installMoment("approved"); }
        if (fresh.length) window.dispatchEvent(new Event("hunt:refresh"));
      } catch {}
    };
    check();
    const t = setInterval(check, 30000);
    const vis = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [me, toast]);

  const value = { me, ready, groups, unread, setUnread, offset, toast, refreshMe, refreshGroups, setMe,
    stars, starMe, starAdmin, loadStars, starTarget, setStarTarget, starHuntOpen, setStarHuntOpen, openStarHunt, starMapOpen, setStarMapOpen, starCaught };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div id="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={"toast " + t.kind + (t.out ? " out" : "")}>{t.msg}</div>)}</div>
    </Ctx.Provider>
  );
}
