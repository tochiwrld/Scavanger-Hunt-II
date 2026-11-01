"use client";
import { useParams } from "next/navigation";
import { fmtDate, zoom } from "../../../../../lib/client.js";
import { Async, Empty, useApi, StatusPill, Photos } from "../../../../../components/ui.js";

export default function Page() {
  const { gid } = useParams();
  const st = useApi(`/groups/${gid}/my-submissions`);
  return (
    <Async st={st}>{(d) => !d.submissions.length ? <Empty icon="📸" title="No submissions yet" text="Open the challenge and snap your first item." /> : (
      <>
        <h2>My submissions</h2>
        {d.submissions.map((s) => (
          <div key={s.id} className="card flat">
            <div className="row between"><b>{s.title}</b><StatusPill status={s.status} /></div>
            <div className="muted">{s.week_number ? `Week ${s.week_number} · ` : ""}{fmtDate(s.submitted_at)}{s.status === "approved" ? ` · +${s.points} pts` : ""}</div>
            {s.status === "rejected" && s.rejection_reason ? <div className="reason"><b>Reason:</b> {s.rejection_reason}</div> : null}
            <Photos id={s.id} count={s.photos} />
          </div>
        ))}
      </>
    )}</Async>
  );
}
