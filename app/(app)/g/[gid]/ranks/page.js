"use client";
import { useParams } from "next/navigation";
import { fmtDate } from "../../../../../lib/client.js";
import Icon from "../../../../../components/icons.js";
import { Async, Empty, LbRows, useApi } from "../../../../../components/ui.js";
import { RETAIN_DAYS, WEEK_END_RULE } from "../../../../../lib/shared.js";

export default function Page() {
  const { gid } = useParams();
  // Updates itself every 60 seconds while open (paused when the phone is locked or the tab is hidden). No refresh button needed.
  const st = useApi(`/groups/${gid}/leaderboard`, { poll: 60_000 });
  return (
    <Async st={st}>{(d) => {
      if (d.phase === "none") return <Empty icon="🏆" title="No leaderboard yet" text="It appears when the first hunt goes live." />;
      const m = d.me, c = d.challenge, live = d.phase === "active";
      // After Sunday 11:59 PM no new finds come in, but reviews of finds sent in time can still add pips for RETAIN_DAYS.
      const settlesAt = new Date(new Date(c.end_at).getTime() + RETAIN_DAYS * 864e5);
      const settling = !live && settlesAt > new Date();
      return (
        <>
          <div className="page-head"><h1>Leaderboard</h1><p>Weekly scores only — every new challenge starts everyone from zero.</p></div>
          {m ? (
            <div className="tiles" style={{ marginTop: 0 }}>
              <div className="tile score"><div className="label">Your rank</div><div className="n">#{m.rank}<small>/ {d.total}</small></div></div>
              <div className="tile rank"><div className="label">Your pips</div><div className="n">{m.points}<small>pips</small></div></div>
            </div>
          ) : null}
          {m ? <p className="gap-note" style={{ margin: 0 }}>{m.above ? <><b>{m.gap} point{m.gap === 1 ? "" : "s"}</b> to pass {m.above}</> : m.points > 0 ? <b style={{ color: "var(--primary)" }}>You're in front. Hold on to it.</b> : "Get your first item approved to get on the board."}</p> : null}
          <section className="card">
            <div className="card-title" style={{ alignItems: "flex-start" }}>
              <div><div className={"eyebrow" + (live ? " live" : "")}>{live ? "Live" : settling ? "Closed · reviews still counting" : "Final standings"}</div><h2 style={{ marginTop: 8 }}>{c.title}</h2></div>
              <span className="muted" style={{ textAlign: "right", fontSize: 13 }}>{live ? "Closes" : "Closed"}<br />{fmtDate(c.end_at)}</span>
            </div>
            {d.rows.length ? <LbRows rows={d.rows} prize={live ? null : c.prize_amount} /> : <p className="muted" style={{ margin: 0 }}>No players yet. Share the invite link to get people in.</p>}
          </section>
          <section className="card">
            <h2 style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><Icon n="timer" size={20} className="c-primary" />When the week ends</h2>
            <p className="prose" style={{ margin: 0 }}>{WEEK_END_RULE}{settling ? ` These standings are final from ${fmtDate(settlesAt)}.` : ""}</p>
          </section>
          <section className="card">
            <h2 style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><Icon n="trophy" size={20} className="c-primary" />The tie-breaker</h2>
            <p className="prose" style={{ margin: 0 }}>{c.tie_rule}</p>
          </section>
        </>
      );
    }}</Async>
  );
}
