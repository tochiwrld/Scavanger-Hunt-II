"use client";
import { useParams } from "next/navigation";
import { fmtDate, naira } from "../../../../../../lib/client.js";
import { Async, LbRows, useApi } from "../../../../../../components/ui.js";

export default function Page() {
  const { gid, cid } = useParams();
  const st = useApi(`/groups/${gid}/results/${cid}`);
  return (
    <Async st={st}>{(d) => {
      const podium = d.rows.filter((r) => r.points > 0 && r.rank <= 3), m = d.me, p = d.prize;
      return (
        <>
          <div><h2>{d.challenge.week_number ? `Week ${String(d.challenge.week_number).padStart(2, "0")} results` : "Results"}</h2><p className="muted">{d.challenge.title}</p></div>
          {d.finalized ? null : <div className="card mist">Some submissions are still being reviewed, so these standings may change.</div>}
          <div className="card dark stack">
            {podium.length ? podium.map((r) => (
              <div key={r.rank + r.nickname} className="row between"><span style={{ font: "800 19px/1.2 var(--font-head)", textTransform: "uppercase", letterSpacing: "-.02em" }}>{["🥇", "🥈", "🥉"][r.rank - 1]} {["1st", "2nd", "3rd"][r.rank - 1]} · {r.nickname}</span><span className="pts">{r.points} PTS</span></div>
            )) : <p>Nobody scored this week.</p>}
          </div>
          <div className={"card" + (p.winner ? " mist" : "")}>
            <h3>🏆 {naira(p.amount)} prize</h3>
            <p style={{ margin: "6px 0 0" }}>{p.winner ? <>Winner: <b>{p.winner}</b></> : "No winner this week."}</p>
            {p.winner ? <span className={`st ${p.status === "paid" ? "approved" : "pending"}`} style={{ marginTop: 8 }}>{p.status === "paid" ? "✅ Paid" + (p.paid_at ? " · " + fmtDate(p.paid_at) : "") : "⏳ Pending: the admin pays manually"}</span> : null}
            {p.payout_note ? <p className="muted" style={{ margin: "8px 0 0" }}>Note: {p.payout_note}</p> : null}
          </div>
          {m ? (
            <div className="card"><h2>Your week</h2>
              <dl className="kv" style={{ marginTop: 10 }}><dt>Final rank</dt><dd>#{m.rank}</dd><dt>Final score</dt><dd>{m.points} points</dd><dt>Items completed</dt><dd>{d.completed.length}</dd><dt>Items missed</dt><dd>{d.missed.length}</dd><dt>Approved submissions</dt><dd>{d.approved.length}</dd></dl>
              {d.completed.length ? <><p style={{ margin: "12px 0 4px" }}><b>Completed</b></p>{d.completed.map((i, k) => <div key={k} className="row between"><span>✅ {i.title}</span><b>+{i.points}</b></div>)}</> : null}
              {d.missed.length ? <><p style={{ margin: "12px 0 4px" }}><b>Missed</b></p>{d.missed.map((i, k) => <div key={k} className="row between muted"><span>⬜ {i.title}</span><span>{i.points}</span></div>)}</> : null}
            </div>
          ) : null}
          <div className="sec-title"><h2>Full standings</h2></div>
          <LbRows rows={d.rows} />
          <p className="muted">⚖️ {d.challenge.tie_rule}</p>
        </>
      );
    }}</Async>
  );
}
