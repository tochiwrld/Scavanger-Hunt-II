"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fmtDate, naira, pad2, TZ } from "../../../../lib/client.js";
import { useApp } from "../../../../components/Providers.js";
import Icon from "../../../../components/icons.js";
import { Async, Countdown, CountUp, Empty, LbRows, Plate, Skel, StatusPill, useApi } from "../../../../components/ui.js";

const ends = (d) => new Date(d).toLocaleString("en-NG", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).replace(/\s?([AP]M)/i, (m, x) => " " + x.toLowerCase());

function PlayerHome({ gid }) {
  const st = useApi(`/groups/${gid}/dashboard`);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    const d = st.data;
    if (!d || !d.challenge || !d.rank) return;
    const key = `rank:${gid}:${d.challenge.id}`, prev = +localStorage.getItem(key) || 0;
    setBump(prev && d.rank < prev ? prev - d.rank : 0);
    localStorage.setItem(key, String(d.rank));
  }, [st.data, gid]);
  return (
    <Async st={st}>{(d) => {
      const up = d.upcoming ? <div className="card mist"><div className="eyebrow">Up next</div><h3 style={{ margin: "8px 0 6px" }}>{d.upcoming.title}</h3><p className="muted" style={{ margin: 0 }}>Starts {fmtDate(d.upcoming.start_at)}</p></div> : null;
      if (d.phase === "none") return <><Empty icon="⏳" title="No hunt is live yet" text="You'll get an alert the moment the admin starts the next challenge." />{up}</>;
      const c = d.challenge, active = d.phase === "active";
      const possible = d.points_possible || 0;
      const pct = possible ? Math.min(100, Math.round((d.score / possible) * 100)) : 0;
      const recent = d.recent.filter((r) => r.status !== "approved").slice(0, 4);
      return (
        <>
          <Plate>
            <div className="eyebrow">{c.week_number ? `Week ${pad2(c.week_number)} · ` : ""}{active ? "Live now" : "Final results"}</div>
            <div className="week">{c.title}</div>
            <div className="meta">{active ? "Ends" : "Ended"} {ends(c.end_at)} (Lagos time) · Prize <b>{naira(c.prize_amount)}</b></div>
            {active ? <Countdown end={c.end_at} onDone={st.reload} /> : <div className="cd">Challenge closed</div>}
            <div className="tiles">
              <div className="tile score"><div className="label">Your score</div><div className="n"><CountUp to={d.score} /><small>pts</small></div></div>
              <div className="tile rank"><div className="label">Your rank</div><div className="n">{d.rank ? "#" + d.rank : "–"}<small>/ {d.total}</small>{bump ? <span className="bump">▲{bump}</span> : null}</div></div>
            </div>
            {d.rank > 1 && d.gap ? <p className="gap-note"><b>{d.gap} point{d.gap === 1 ? "" : "s"}</b> to pass {d.above}</p> : null}
            <Link className="btn block" style={{ marginTop: 16 }} href={active ? `/g/${gid}/hunt` : `/g/${gid}/week/${c.id}`}>{active ? "View challenge" : "See the final results"}<Icon n="arrow" size={18} /></Link>
          </Plate>
          {up}
          <section className="card">
            <div className="progress-head"><h2>Your progress</h2><span className="mono">{d.score} / {possible} pts possible</span></div>
            <div className="bar"><i style={{ width: pct + "%" }} /></div>
            <div className="stats">
              <div className="stat"><Icon n="check" size={20} className="c-ok" /><b>{d.items_done}/{d.items_total}</b><span>Approved</span></div>
              <div className="stat"><Icon n="clock" size={20} className="c-wait" /><b>{d.pending}</b><span>Pending</span></div>
              <div className="stat"><Icon n="x" size={20} className="c-bad" /><b>{d.rejected ?? 0}</b><span>Rejected</span></div>
              <div className="stat"><Icon n="target" size={20} className="c-mute" /><b>{d.not_submitted ?? 0}</b><span>Not submitted</span></div>
            </div>
          </section>
          {recent.length ? (
            <section className="card">
              <div className="card-title"><h2>Your submissions</h2><Link className="link" href={`/g/${gid}/mine`}>All</Link></div>
              <div className="stack">{recent.map((r) => (
                <div key={r.id} className="inset">
                  <div className="row between" style={{ alignItems: "flex-start" }}><b>{r.title}</b><StatusPill status={r.status} /></div>
                  <div className="muted" style={{ marginTop: 4 }}>{r.status === "pending" ? "Sent " + fmtDate(r.submitted_at) : r.rejection_reason}</div>
                  {r.status === "rejected" ? <Link className="link" style={{ display: "inline-block", marginTop: 8 }} href={`/g/${gid}/hunt`}>Resubmit →</Link> : null}
                </div>
              ))}</div>
            </section>
          ) : null}
          <section className="card">
            <div className="card-title"><h2>This week's leaderboard</h2><Link className="link" href={`/g/${gid}/ranks`}>Full board</Link></div>
            {d.leaderboard.length ? <LbRows rows={d.leaderboard.slice(0, 5)} /> : <p className="muted" style={{ margin: 0 }}>No players yet.</p>}
          </section>
        </>
      );
    }}</Async>
  );
}

function OwnerOverview({ gid }) {
  const st = useApi(`/groups/${gid}/overview`);
  return (
    <Async st={st}>{(d) => {
      const c = d.challenge;
      return (
        <>
          <div className="page-head"><h1>Overview</h1></div>
          {c ? (
            <>
              <section className="card">
                <div className={"eyebrow" + (d.phase === "active" ? " live" : "")}>{d.phase === "active" ? "Active challenge" : "Last challenge"}</div>
                <h1 style={{ margin: "10px 0 10px", fontSize: "clamp(28px,7.5vw,38px)" }}>{c.week_number ? `Week ${pad2(c.week_number)} — ` : ""}{c.title}</h1>
                <div className="muted">{d.item_count} item{d.item_count === 1 ? "" : "s"} · {d.phase === "active" ? "locked since" : "ran from"} {fmtDate(c.start_at)} · Prize {naira(c.prize_amount)}</div>
                {d.phase === "active" ? <Countdown end={c.end_at} onDone={st.reload} /> : <div className="cd">Challenge closed</div>}
                {d.pending_all ? <Link className="btn block" style={{ marginTop: 16 }} href={`/g/${gid}/review`}>Review {d.pending_all} pending<Icon n="arrow" size={18} /></Link> : <div className="state-box" style={{ marginTop: 16 }}>Nothing waiting for review</div>}
                {d.upcoming ? <div className="inset row" style={{ marginTop: 12, borderStyle: "dashed" }}><Icon n="clock" size={18} className="c-mute" /><span className="muted" style={{ fontSize: 14 }}><b style={{ color: "var(--fg)" }}>{d.upcoming.title}</b> — scheduled for {fmtDate(d.upcoming.start_at)}.</span></div>
                  : <Link className="inset row" style={{ marginTop: 12, borderStyle: "dashed", textDecoration: "none" }} href={`/g/${gid}/challenges`}><Icon n="plus" size={18} className="c-mute" /><span className="muted" style={{ fontSize: 14 }}><b style={{ color: "var(--fg)" }}>Next week</b> — no draft yet. Prepare it before Sunday to keep the streak going.</span></Link>}
              </section>
              <div className="stats">
                <div className="stat"><Icon n="users" size={20} className="c-info" /><b>{d.players}</b><span>Participants</span></div>
                <div className="stat"><Icon n="clock" size={20} className="c-wait" /><b>{d.counts.pending}</b><span>Pending</span></div>
                <div className="stat"><Icon n="check" size={20} className="c-ok" /><b>{d.counts.approved}</b><span>Approved</span></div>
                <div className="stat"><Icon n="x" size={20} className="c-bad" /><b>{d.counts.rejected}</b><span>Rejected</span></div>
              </div>
              <section className="card">
                <div className="card-title"><h2>Live leaderboard</h2><Link className="link" href={`/g/${gid}/ranks`}>Full board</Link></div>
                {d.leaderboard.length ? <LbRows rows={d.leaderboard.map((r) => ({ ...r, me: false }))} /> : <p className="muted" style={{ margin: 0 }}>No players yet.</p>}
              </section>
              <section className="card">
                <div className="card-title"><h2>Prize</h2><Link className="link" href={`/g/${gid}/prize`}>Manage</Link></div>
                <div className="inset row between">
                  <div><b>{c.week_number ? `Week ${pad2(c.week_number)}` : c.title}</b><div className="muted">{d.prize ? (d.prize.winner || "No winner yet") : "Decided when the week ends"} · {naira(d.prize?.amount ?? c.prize_amount)}</div></div>
                  {d.prize ? <span className={"st " + (d.prize.status === "paid" ? "paid" : "pending")}>{d.prize.status === "paid" ? "Paid" : "Awaiting"}</span> : <span className="st draft">Open</span>}
                </div>
              </section>
            </>
          ) : <Empty icon="📅" title="No challenge yet" text="Create this week's challenge as a draft, add items, preview it, then publish."><Link className="btn" href={`/g/${gid}/challenge/new`}><Icon n="plus" size={18} />New challenge</Link></Empty>}
          {d.players === 0 ? <Link className="btn block ghost" href={`/g/${gid}/invite`}><Icon n="link" size={18} />Invite players</Link> : null}
        </>
      );
    }}</Async>
  );
}

export default function Page() {
  const { gid } = useParams();
  const { groups } = useApp();
  const g = groups?.find((x) => String(x.id) === gid);
  if (!g) return <Skel />;
  return g.role === "owner" ? <OwnerOverview gid={gid} /> : <PlayerHome gid={gid} />;
}
