"use client";
import { useEffect, useState } from "react";

/** The "● 30 active hunts" bar. One anonymous number across the whole site; hidden until it loads or when it's zero. */
export default function ActiveHunts({ hero = false }) {
  const [n, setN] = useState(null);
  useEffect(() => {
    let dead = false;
    fetch("/api/stats").then((r) => r.json()).then((d) => { if (!dead) setN(d.active_hunts); }).catch(() => {});
    return () => { dead = true; };
  }, []);
  if (!n) return null;
  return (
    <div className={"live-bar" + (hero ? " hero" : "")} role="status">
      <span className="pulse" aria-hidden="true" />
      <b className="mono">{n.toLocaleString()}</b> active hunt{n === 1 ? "" : "s"}
    </div>
  );
}
