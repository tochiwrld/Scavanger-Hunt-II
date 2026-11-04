"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fmtDate, naira } from "../../../../../lib/client.js";
import { Async, Empty, useApi } from "../../../../../components/ui.js";

export default function Page() {
  const { gid } = useParams();
  const st = useApi(`/groups/${gid}/results`);
  return (
    <Async st={st}>{(d) => !d.results.length ? <Empty icon="📜" title="No finished weeks yet" text="Final results show up here when a week ends." /> : (
      <>
        <h2>Past weeks</h2>
        {d.results.map((r) => (
          <Link key={r.id} href={`/g/${gid}/week/${r.id}`} className="card" style={{ textDecoration: "none", display: "block" }}>
            <h3>{r.week_number ? `Week ${String(r.week_number).padStart(2, "0")}: ` : ""}{r.title}</h3>
            <p className="muted" style={{ margin: "4px 0 8px" }}>Ended {fmtDate(r.end_at)}</p>
            <div className="row between wrap"><span>{r.winner ? `🥇 ${r.winner}${r.prize_amount > 0 ? ` · ${naira(r.prize_amount)}` : ""}` : "No winner"}</span>{r.prize_status ? <span className={`st ${r.prize_status === "paid" ? "approved" : "pending"}`}>{r.prize_status === "paid" ? "Paid" : "Prize pending"}</span> : null}</div>
            {r.my_rank ? <div className="muted" style={{ marginTop: 6 }}>You: #{r.my_rank} · {r.my_points} pts</div> : null}
          </Link>
        ))}
      </>
    )}</Async>
  );
}
