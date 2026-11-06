"use client";
import Link from "next/link";
import { useApp } from "./Providers.js";
import Icon from "./icons.js";

/** Home-screen nudge for the daily hunt: streak and whether today's item is done. The item itself shows on /daily. */
export default function DailyCard() {
  const { me } = useApp();
  const s = me?.streak;
  if (!s) return null;
  return (
    <Link href="/daily" className="card daily-card" style={{ display: "flex" }}>
      <span className="flame" aria-hidden="true">{s.done_today ? "✅" : "🔥"}</span>
      <div className="grow">
        <div className="eyebrow">Daily hunt</div>
        <div style={{ fontWeight: 700, marginTop: 2 }}>{s.done_today ? "Done for today. See you tomorrow!" : "Today's item is waiting"}</div>
        <div className="muted" style={{ fontSize: 13 }}>Streak 🔥 {s.current} · best {s.best}</div>
      </div>
      <Icon n="arrow" size={18} />
    </Link>
  );
}
