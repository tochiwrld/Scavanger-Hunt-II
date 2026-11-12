"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "./Providers.js";
import StarMap from "./StarMap.js";
import Icon from "./icons.js";
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
        <AlertsToggle compact />
        <Link href="/stars" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon n="map" size={16} />All stars and how it works</Link>
      </div>
    </div>
  );
}

/** "Star alerts on this phone": web push, asked only when tapped. */
export function AlertsToggle({ compact = false }) {
  const { toast, refreshMe } = useApp();
  const [st, setSt] = useState("…");
  const [busy, setBusy] = useState(false);
  useEffect(() => { pushState().then(setSt).catch(() => setSt("unsupported")); }, []);
  const turnOn = async () => {
    setBusy(true);
    try { await enablePush(); setSt("on"); toast("Star alerts are on for this phone ⭐", "good"); refreshMe(); }
    catch (e) { toast(e.message, "bad"); setSt(await pushState().catch(() => "off")); }
    setBusy(false);
  };
  const turnOff = async () => {
    setBusy(true);
    try { await disablePush(); setSt("off"); toast("Star alerts are off for this phone"); refreshMe(); } catch (e) { toast(e.message, "bad"); }
    setBusy(false);
  };
  if (st === "…") return null;
  if (st === "unsupported") {
    return needsHomeScreen()
      ? <p className="muted" style={{ margin: 0, fontSize: 14 }}>📲 <b>Want star alerts on iPhone?</b> Tap Share → <b>Add to Home Screen</b>, open PrimaHunt from there, then switch alerts on.</p>
      : compact ? null : <p className="muted" style={{ margin: 0, fontSize: 14 }}>This browser can't show notifications.</p>;
  }
  if (st === "blocked") return <p className="muted" style={{ margin: 0, fontSize: 14 }}>🔕 Notifications are blocked for PrimaHunt. Allow them in your browser settings to get star alerts.</p>;
  return (
    <div className="sw" style={compact ? { padding: 0, border: 0 } : undefined}>
      <div><b>Star alerts on this phone</b>{compact ? null : <div className="muted" style={{ fontSize: 13 }}>A ping when a new star drops in Lagos</div>}</div>
      <input type="checkbox" checked={st === "on"} disabled={busy} onChange={(e) => (e.target.checked ? turnOn() : turnOff())} aria-label="Star alerts on this phone" />
    </div>
  );
}
