"use client";
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
        if (fresh.some((n) => n.type === "approved")) burst();
        if (fresh.length) window.dispatchEvent(new Event("hunt:refresh"));
      } catch {}
    };
    check();
    const t = setInterval(check, 30000);
    const vis = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [me, toast]);

  const value = { me, ready, groups, unread, setUnread, offset, toast, refreshMe, refreshGroups, setMe };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div id="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={"toast " + t.kind + (t.out ? " out" : "")}>{t.msg}</div>)}</div>
    </Ctx.Provider>
  );
}
