"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ReviewCard from "../../../../../components/ReviewCard.js";
import { Async, Empty, useApi } from "../../../../../components/ui.js";

export default function Page() {
  const { gid } = useParams();
  const [q, setQ] = useState(""), [dq, setDq] = useState(""), [status, setStatus] = useState(""), [chal, setChal] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 350); return () => clearTimeout(t); }, [q]);
  const p = new URLSearchParams();
  if (dq) p.set("q", dq); if (status) p.set("status", status); if (chal) p.set("challenge", chal);
  const list = useApi(`/groups/${gid}/submissions?${p}`);
  const ch = useApi(`/groups/${gid}/challenges`);
  return (
    <>
      <div className="card stack">
        <input type="search" placeholder="Search player or item" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row">
          <select className="grow" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
          <select className="grow" value={chal} onChange={(e) => setChal(e.target.value)}><option value="">All challenges</option>{(ch.data?.challenges || []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
        </div>
      </div>
      <Async st={list}>{(d) => (
        <div className="stack">{d.submissions.length ? d.submissions.map((s) => <ReviewCard key={s.id} s={s} gid={gid} onChanged={list.reload} />) : <Empty icon="🔎" title="Nothing matches" text="Try a different filter." />}</div>
      )}</Async>
    </>
  );
}
