"use client";
import { useParams } from "next/navigation";
import { fmtDate } from "../../../../../lib/client.js";
import { Async, Empty, useApi } from "../../../../../components/ui.js";

const line = (l) => {
  const x = l.details || {};
  return l.action === "adjust_score" ? `${x.participant}: ${x.previous} → ${x.new} (${x.difference > 0 ? "+" : ""}${x.difference}). ${x.reason}` : Object.entries(x).map(([k, v]) => `${k}: ${v}`).join(" · ");
};
export default function Page() {
  const { gid } = useParams();
  const st = useApi(`/groups/${gid}/audit`);
  return (
    <Async st={st}>{(d) => d.logs.length ? d.logs.map((l) => (
      <div key={l.id} className="card flat"><div className="row between"><b>{l.action.replace(/_/g, " ")}</b><span className="muted">{fmtDate(l.created_at)}</span></div>
        <div className="muted">by {l.admin || "unknown"}{line(l) ? " · " + line(l) : ""}</div></div>
    )) : <Empty icon="📋" title="Nothing logged yet" />}</Async>
  );
}
