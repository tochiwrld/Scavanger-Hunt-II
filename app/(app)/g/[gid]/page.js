"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fmtDate, naira, statusIcon } from "../../../../lib/client.js";
import { useApp } from "../../../../components/Providers.js";
import { Async, Countdown, CountUp, Empty, LbRows, Plate, Skel, useApi } from "../../../../components/ui.js";

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
      const up = d.upcoming ? <div className="card mist"><h3>Next hunt: {d.upcoming.title}</h3><p className="muted" style={{ margin: "6px 0 0" }}>Starts {fmtDate(d.upcoming.start_at)}</p></div> : null;
      if (d.phase === "none") return <><Empty icon="⏳" title="No hunt is live yet" text="You'll get an alert when the admin starts the next challenge." />{up}</>;
      const c = d.challenge, active = d.phase === "active";
      const pct = d.items_total ? Math.round((d.items_done / d.items_total) * 100) : 0;
      const by = (s) => d.recent.filter((r) => r.status === s);
      const List = ({ title, kind }) => {
        const arr = by(kind);
        if (!arr.length) return null;
        return (
          <>
            <div className="sec-title"><h2>{title}</h2></div>
            <div className="stack">{arr.map((r) => (
              <div key={r.id} className="card flat row between">
                <div className="grow"><b>{r.title}</b><div className="muted">{kind === "pending" ? "Sent " + fmtDate(r.submitted_at) : fmtDate(r.reviewed_at)}{r.rejection_reason ? " · " + r.rejection_reason : ""}</div></div>
                {kind === "approved" ? <span className="pts" style={{ color: "var(--ok)" }}>+{r.points}</span> : <span className={`st ${kind}`}>{statusIcon[kind]}</span>}
              </div>
            ))}</div>
          </>
        );
      };
      return (
        <>
          <Plate>
            <div className="muted" style={{ color: "#c9c2b4" }}>{active ? "Current week" : "Last week"}{c.week_number ? ` · Week ${String(c.week_number).padStart(2, "0")}` : ""}</div>
            <div className="week">{c.title}</div>
            {active ? <Countdown end={c.end_at} onDone={st.reload} /> : <div className="cd">Challenge closed</div>}
            <div style={{ marginTop: 16 }}><div className="muted" style={{ color: "#c9c2b4" }}>Your score</div><div className="bignum"><CountUp to={d.score} /><small>points</small></div></div>
            <div className="stats">
              <div className="stat"><b>{d.rank ? "#" + d.rank : "–"}{bump ? <span className="bump">▲ {bump}</span> : null}</b><span>Your rank of {d.total}</span></div>
              <div className="stat"><b>{d.items_done} / {d.items_total}</b><span>Items{d.pending ? ` · ${d.pending} waiting` : ""}</span></div>
              <div className="stat"><b>{naira(c.prize_amount)}</b><span>Weekly prize</span></div>
              <div className="stat"><b>{(d.group_points || 0).toLocaleString()}</b><span>Total group points</span></div>
            </div>
            <div className="bar"><i style={{ width: pct + "%" }} /></div>
            {d.rank > 1 && d.gap ? <p style={{ margin: "10px 0 0", color: "#c9c2b4" }}>{d.gap} more point{d.gap === 1 ? "" : "s"} to pass {d.above}</p> : null}
          </Plate>
          {active ? <Link className="btn block" href={`/g/${gid}/hunt`}>📷 Open challenge</Link> : <Link className="btn block" href={`/g/${gid}/week/${c.id}`}>🏁 See the final results</Link>}
          {up}
          <List title="Waiting for review" kind="pending" /><List title="Approved" kind="approved" /><List title="Rejected: try again" kind="rejected" />
          <div className="sec-title"><h2>Leaderboard</h2><Link href={`/g/${gid}/ranks`} className="muted">See all</Link></div>
          <LbRows rows={d.leaderboard.slice(0, 5)} />
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
      const Stat = ({ n, l }) => <div className="card"><div className="pts">{n}</div><div className="muted">{l}</div></div>;
      return (
        <>
          {c ? (
            <>
              <Plate>
                <div className="muted" style={{ color: "#c9c2b4" }}>{d.phase === "active" ? "Current challenge" : "Last challenge"}{c.week_number ? ` · Week ${String(c.week_number).padStart(2, "0")}` : ""}</div>
                <div className="week">{c.title}</div>
                {d.phase === "active" ? <Countdown end={c.end_at} onDone={st.reload} /> : <div className="cd">Closed</div>}
              </Plate>
              <div className="stats" style={{ margin: 0 }}><Stat n={d.players} l="Players" /><Stat n={d.counts.pending} l="Pending" /><Stat n={d.counts.approved} l="Approved" /><Stat n={d.counts.rejected} l="Rejected" /></div>
              {d.pending_all ? <Link className="btn block" href={`/g/${gid}/review`}>📥 Review {d.pending_all} submission{d.pending_all === 1 ? "" : "s"}</Link> : null}
              <div className="card"><h3>🏆 {naira(d.prize?.amount ?? c.prize_amount)} prize</h3>
                <p className="muted" style={{ margin: "6px 0 0" }}>{d.prize ? (d.prize.winner ? `${d.prize.winner} · ${d.prize.status === "paid" ? "Paid" : "Pending payment"}` : "No winner yet") : "Decided when the week ends"}</p>
                <Link href={`/g/${gid}/prize`}>Prize management</Link></div>
              <div className="sec-title"><h2>Leaderboard</h2></div>
              {d.leaderboard.length ? <LbRows rows={d.leaderboard.map((r) => ({ ...r, me: false }))} /> : <Empty icon="👥" title="No players yet" />}
            </>
          ) : <Empty icon="📅" title="No challenge yet" text="Create this week's challenge as a draft, add items, then publish."><Link className="btn" href={`/g/${gid}/challenge/new`}>＋ New challenge</Link></Empty>}
          {d.players === 0 ? <Link className="btn block dark" href={`/g/${gid}/invite`}>🔗 Invite players</Link> : null}
          {d.upcoming ? <div className="card mist">Scheduled: <b>{d.upcoming.title}</b>, starts {fmtDate(d.upcoming.start_at)}</div> : null}
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
