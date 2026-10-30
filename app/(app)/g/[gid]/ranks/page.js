"use client";
import { useParams } from "next/navigation";
import { Async, Empty, LbRows, useApi } from "../../../../../components/ui.js";

export default function Page() {
  const { gid } = useParams();
  const st = useApi(`/groups/${gid}/leaderboard`);
  return (
    <Async st={st}>{(d) => {
      if (d.phase === "none") return <Empty icon="🏆" title="No leaderboard yet" text="It appears when the first hunt goes live." />;
      const m = d.me;
      return (
        <>
          <div><h2>{d.phase === "active" ? "Weekly leaderboard" : "Final standings"}</h2><p className="muted">{d.challenge.title}{d.challenge.week_number ? ` · Week ${d.challenge.week_number}` : ""}. Resets when the next week starts.</p></div>
          {m ? (
            <div className="card dark">
              <div className="row between">
                <div><div className="muted" style={{ color: "#c9c2b4" }}>Your rank</div><div className="bignum" style={{ fontSize: 44 }}>#{m.rank}</div></div>
                <div style={{ textAlign: "right" }}><div className="pts" style={{ color: "var(--gc)" }}>{m.points} pts</div><div className="muted" style={{ color: "#c9c2b4" }}>{m.items} item{m.items === 1 ? "" : "s"} complete</div></div>
              </div>
              {m.above ? <p style={{ margin: "10px 0 0", color: "#e7e1d3" }}>{m.gap} more point{m.gap === 1 ? "" : "s"} to pass {m.above}</p> : <p style={{ margin: "10px 0 0", color: "var(--gc)", fontWeight: 700 }}>You're in front. Hold on to it.</p>}
            </div>
          ) : null}
          {d.rows.length ? <LbRows rows={d.rows} /> : <Empty icon="👥" title="No players yet" text="Share the invite link to get people in." />}
          <p className="muted">⚖️ {d.challenge.tie_rule}</p>
        </>
      );
    }}</Async>
  );
}
