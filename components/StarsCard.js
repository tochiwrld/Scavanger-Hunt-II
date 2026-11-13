"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "./Providers.js";
import StarMap from "./StarMap.js";
import Icon from "./icons.js";
import { api } from "../lib/client.js";
import { disablePush, enablePush, needsHomeScreen, pushState } from "../lib/stars-client.js";

/** Home: the Lagos map with live stars. Tap it for the full map. */
export default function StarsCard() {
  const { stars, starMe, setStarMapOpen } = useApp();
  if (!stars) return null;
  const live = stars.filter((s) => !s.caught).length;
  return (
    <div className="card sh-mapcard">
      <div className="hd">
        <div><div className="eyebrow">Star hunt</div><h2 style={{ marginTop: 6 }}>Stars in Lagos</h2></div>
        <span className="chip">{live} to catch</span>
      </div>
      <StarMap interactive={false} zoom={10.5} stars={stars} style={{ height: 210 }}>
        <button className="tap" onClick={() => setStarMapOpen(true)} aria-label="Open the Lagos star map" />
      </StarMap>
      <div style={{ padding: "12px 18px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="muted" style={{ margin: 0 }}>Stars drop at spots around Lagos. Go there, point your camera, catch it for pips.{starMe?.caught ? ` You've caught ${starMe.caught} (${starMe.pips} star pips).` : ""}</p>
        <Link href="/stars" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon n="map" size={16} />All stars and how it works</Link>
      </div>
    </div>
  );
}

/** "Alerts on this phone": web push, asked only when tapped. `prefs` adds the Star drops / Game updates switches. */
export function AlertsToggle({ compact = false, prefs = false }) {
  const { toast, refreshMe, me, setMe } = useApp();
  const [st, setSt] = useState("…");
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setSt).catch(() => setSt("unsupported")); }, []);
  const turnOn = async () => {
    setBusy(true);
    try { await enablePush(); setSt("on"); toast("Alerts are on for this phone 🎯", "good"); refreshMe(); }
    catch (e) { toast(e.message, "bad"); setSt(await pushState().catch(() => "off")); }
    setBusy(false);
  };
  const turnOff = async () => {
    setBusy(true);
    try { await disablePush(); setSt("off"); toast("Alerts are off for this phone"); refreshMe(); } catch (e) { toast(e.message, "bad"); }
    setBusy(false);
  };
  const p = me?.push_prefs || { stars: true, games: true };
  const setPref = async (k, v) => {
    const next = { ...p, [k]: v };
    setMe((m) => (m ? { ...m, push_prefs: next } : m));
    try { await api("/me/push-prefs", { method: "PUT", json: next }); } catch (e) { toast(e.message, "bad"); refreshMe(); }
  };
  if (st === "…") return null;
  if (st === "unsupported") {
    return needsHomeScreen()
      ? <p className="muted" style={{ margin: 0, fontSize: 14 }}>📲 <b>Want alerts on iPhone?</b> Tap Share → <b>Add to Home Screen</b>, open PrimaHunt from there, then switch alerts on.</p>
      : compact ? null : <p className="muted" style={{ margin: 0, fontSize: 14 }}>This browser can't show notifications.</p>;
  }
  if (st === "blocked") return <p className="muted" style={{ margin: 0, fontSize: 14 }}>🔕 Notifications are blocked for PrimaHunt. Allow them in your browser settings to get alerts.</p>;
  return (
    <>
      <div className="sw" style={compact ? { padding: 0, border: 0 } : undefined}>
        <div><b>Alerts on this phone</b>{compact ? null : <div className="muted" style={{ fontSize: 13 }}>Your hunts, 1v1s, team games and new stars</div>}</div>
        <input type="checkbox" checked={st === "on"} disabled={busy} onChange={(e) => (e.target.checked ? turnOn() : turnOff())} aria-label="Alerts on this phone" />
      </div>
      {prefs && st === "on" ? (<>
        <div className="sw"><div><b>Game updates</b><div className="muted" style={{ fontSize: 13 }}>New weeks, approvals, lead changes, 1v1 and team moves, comments</div></div>
          <input type="checkbox" checked={p.games} onChange={(e) => setPref("games", e.target.checked)} aria-label="Game updates" /></div>
        <div className="sw"><div><b>Star drops</b><div className="muted" style={{ fontSize: 13 }}>When a new star lands in Lagos</div></div>
          <input type="checkbox" checked={p.stars} onChange={(e) => setPref("stars", e.target.checked)} aria-label="Star drops" /></div>
      </>) : null}
    </>
  );
}
