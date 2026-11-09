"use client";
import Link from "next/link";
import { useApp } from "./Providers.js";
import Icon from "./icons.js";

/** Home-screen nudge for the daily hunt: streak and whether today's item is done. The item itself shows on /daily. */
export default function DailyCard() {
  const { me } = useApp();
  const s = me?.streak;
  if (!s) return null;
  const line = s.done_today ? "Done for today. See you tomorrow!" : s.pending_today ? "Today's find is waiting for review" : "Today's item is waiting";
  return (
    <>
    {me.daily_review != null ? (
      <Link href="/daily/review" className="card daily-card" style={{ display: "flex" }}>
        <span className="flame" aria-hidden="true">🛡️</span>
        <div className="grow">
          <div className="eyebrow">PrimaHunt admin</div>
          <div style={{ fontWeight: 700, marginTop: 2 }}>{me.daily_review ? `${me.daily_review} daily find${me.daily_review === 1 ? "" : "s"} to review` : "No daily finds to review"}</div>
        </div>
        <Icon n="arrow" size={18} />
      </Link>
    ) : null}
    <Link href="/daily" className="card daily-card" style={{ display: "flex" }}>
      <span className="flame" aria-hidden="true">{s.done_today ? "✅" : s.pending_today ? "⏳" : "🔥"}</span>
      <div className="grow">
        <div className="eyebrow">Daily hunt</div>
        <div style={{ fontWeight: 700, marginTop: 2 }}>{line}</div>
        <div className="muted" style={{ fontSize: 13 }}>Streak 🔥 {s.current} · best {s.best}</div>
      </div>
      <Icon n="arrow" size={18} />
    </Link>
    </>
  );
}
