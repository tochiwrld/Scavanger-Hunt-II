"use client";
import { useEffect, useState } from "react";
import { useApp } from "../../../components/Providers.js";
import Icon from "../../../components/icons.js";
import SubmitSheet from "../../../components/SubmitSheet.js";
import { Async, Photos, Plate, useApi } from "../../../components/ui.js";
import { RETAIN_DAYS } from "../../../lib/shared.js";

/** Counts down to midnight Lagos time, when the next item unlocks. */
function Until({ at, onDone }) {
  const [left, setLeft] = useState(at - Date.now());
  useEffect(() => {
    const t = setInterval(() => { const l = at - Date.now(); setLeft(l); if (l <= 0) { clearInterval(t); onDone?.(); } }, 1000);
    return () => clearInterval(t);
  }, [at, onDone]);
  const s = Math.max(0, Math.floor(left / 1000));
  const p = (n) => String(n).padStart(2, "0");
  return <span className="mono">{p(Math.floor(s / 3600))}:{p(Math.floor((s % 3600) / 60))}:{p(s % 60)}</span>;
}

export default function Page() {
  const st = useApi("/daily");
  const { toast, refreshMe } = useApp();
  const [shooting, setShooting] = useState(false);
  return (
    <Async st={st}>{(d) => (
      <>
        <div className="page-head"><h1>Daily hunt</h1><p>One item a day, the same for everyone. Find it before midnight to keep your streak alive.</p></div>
        <Plate>
          <div className="eyebrow live">Day {d.number} · today</div>
          <div className="week">{d.item}</div>
          <div className="meta">{d.done ? "Found it! Come back tomorrow for the next one." : d.status === "pending" ? "Sent! The PrimaHunt admin will check it soon." : "Snap it with the in-app camera. It counts once the PrimaHunt admin approves it."}</div>
          <div className="tiles">
            <div className="tile score"><div className="label">Streak</div><div className="n">🔥 {d.streak.current}<small>day{d.streak.current === 1 ? "" : "s"}</small></div></div>
            <div className="tile rank"><div className="label">Best</div><div className="n">{d.streak.best}<small>day{d.streak.best === 1 ? "" : "s"}</small></div></div>
          </div>
          {d.done
            ? <div className="state-box earned" style={{ marginTop: 16 }}>✅ Approved · next item in <Until at={d.next_at} onDone={st.reload} /></div>
            : d.status === "pending"
              ? <div className="state-box pending" style={{ marginTop: 16 }}>⏳ Waiting for review. Your streak counts once it's approved, even if that's after midnight.</div>
              : <>
                {d.status === "rejected" ? <div className="reason" style={{ marginTop: 16 }}><b>Not accepted:</b> {d.find?.reject_reason || "No reason given."} Try again before midnight.</div> : null}
                <button className="btn block" style={{ marginTop: 16 }} onClick={() => setShooting(true)}><Icon n="camera" size={18} />{d.status === "rejected" ? "Snap it again" : "Snap today's find"}</button>
              </>}
          {!d.done && d.status !== "pending" ? <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>Ends in <Until at={d.next_at} onDone={st.reload} />.{d.streak.current ? ` Miss today and your ${d.streak.current}-day streak resets.` : ""}</p> : null}
        </Plate>
        {d.status === "pending" && d.find?.photos ? <div className="card"><h3>Today's find</h3><Photos base="/api/daily-photo" id={d.find.id} count={d.find.photos} who="you" /></div> : null}
        <section className="card">
          <h2>Your last 7 days</h2>
          {d.recent.length ? (
            <ul className="recap">{d.recent.map((r) => <li key={r.day}><span aria-label={r.status}>{r.status === "approved" ? "✅" : r.status === "pending" ? "⏳" : "❌"}</span><span style={{ width: "auto", textAlign: "left" }}><b>{r.item}</b> <span className="muted">· {new Date(r.day + "T12:00:00+01:00").toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}</span></span></li>)}</ul>
          ) : <p className="muted" style={{ margin: "8px 0 0" }}>No finds yet. Today's a good day to start.</p>}
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>Your daily photos are seen only by you and the PrimaHunt admin who reviews them. They're deleted as soon as they're reviewed (or after {RETAIN_DAYS} days at most). Your streak stays.</p>
        </section>
        {shooting ? <SubmitSheet it={{ id: "daily", title: d.item }} endpoint="/daily/submit" onClose={() => setShooting(false)}
          onDone={() => { setShooting(false); toast("Sent! It counts once the PrimaHunt admin approves it.", "good"); st.reload(); refreshMe(); }} /> : null}
      </>
    )}</Async>
  );
}
