"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { fmtDate, naira } from "../../../../../lib/client.js";
import { Async, Empty, useApi } from "../../../../../components/ui.js";

const CHIP = { draft: "Draft", upcoming: "Scheduled", active: "Live", closed: "Finished" };
export default function Page() {
  const { gid } = useParams();
  const st = useApi(`/groups/${gid}/challenges`);
  return (
    <>
      <Link className="btn block" href={`/g/${gid}/challenge/new`}>＋ New challenge</Link>
      <Async st={st}>{(d) => d.challenges.length ? d.challenges.map((c) => (
        <Link key={c.id} href={`/g/${gid}/challenge/${c.id}`} className="card" style={{ textDecoration: "none", display: "block" }}>
          <div className="row between"><h3>{c.week_number ? `Week ${String(c.week_number).padStart(2, "0")}: ` : ""}{c.title}</h3><span className={`st ${c.phase === "active" ? "approved" : c.phase === "draft" ? "not_submitted" : "pending"}`}>{CHIP[c.phase]}</span></div>
          <p className="muted" style={{ margin: "6px 0 0" }}>{fmtDate(c.start_at)} → {fmtDate(c.end_at)}</p>
          <p className="muted" style={{ margin: "2px 0 0" }}>{c.item_count} items · {naira(c.prize_amount)} prize · {c.submission_count} submissions</p>
        </Link>
      )) : <Empty icon="📅" title="No challenges yet" text="Create your first weekly hunt." />}</Async>
    </>
  );
}
