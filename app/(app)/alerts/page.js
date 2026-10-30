"use client";
import Link from "next/link";
import { useEffect } from "react";
import { api, colorFor, fmtDate } from "../../../lib/client.js";
import { useApp } from "../../../components/Providers.js";
import { Async, Empty, useApi } from "../../../components/ui.js";

export default function Page() {
  const { setUnread } = useApp();
  const st = useApi("/notifications");
  useEffect(() => { api("/notifications/read", { method: "POST", json: {} }).then(() => setUnread(0)).catch(() => {}); }, [setUnread]);
  return (
    <Async st={st}>{(d) => (
      <>
        <h1>Alerts</h1>
        {d.notifications.length ? d.notifications.map((n) => (
          <Link key={n.id} href={(n.link || "/").replace(/^#/, "")} className="card flat" style={{ textDecoration: "none", display: "block", borderLeft: `12px solid ${colorFor(n.group_id)}`, background: n.read_at ? undefined : "#F3F6FF" }}>
            <div className="muted"><b>{n.title}</b></div><div>{n.message}</div><div className="muted">{fmtDate(n.created_at)}</div>
          </Link>
        )) : <Empty icon="🔔" title="No alerts yet" text="New challenges, approvals and reminders from your groups land here." />}
      </>
    )}</Async>
  );
}
