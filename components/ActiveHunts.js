"use client";
import { useEffect, useState } from "react";

/**
 * The "● 30 active hunts" bar: one anonymous number across the whole site, hidden until it loads or when it's zero.
 * On the overview (not the sign-in hero) a small line underneath names the current Hunter of the week
 * (last finished PRIMAHUNT OFFICIAL week's winner).
 */
export default function ActiveHunts({ hero = false }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let dead = false;
    fetch("/api/stats").then((r) => r.json()).then((x) => { if (!dead) setD(x); }).catch(() => {});
    return () => { dead = true; };
  }, []);
  if (!d) return null;
  const n = d.active_hunts, h = !hero && d.hunter;
  if (!n && !h) return null;
  return (
    <div className={"live-wrap" + (hero ? " hero" : "")}>
      {n ? (
        <div className={"live-bar" + (hero ? " hero" : "")} role="status">
          <span className="pulse" aria-hidden="true" />
          <b className="mono">{n.toLocaleString()}</b> active hunt{n === 1 ? "" : "s"}
        </div>
      ) : null}
      {h ? <div className="hunter-line">🏅 Hunter of the week{h.week_number ? ` (Week ${h.week_number})` : ""}: <b>{h.nickname}</b></div> : null}
    </div>
  );
}
