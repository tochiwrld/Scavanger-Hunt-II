"use client";
import Link from "next/link";
import { useEffect } from "react";
import { api, fmtDate } from "../../../lib/client.js";
import { useApp } from "../../../components/Providers.js";
import Icon from "../../../components/icons.js";
import { Async, Empty, useApi } from "../../../components/ui.js";

const ICON = { approved: "check", rejected: "x", new_challenge: "live", ending: "clock", results: "trophy", submission: "camera", duel: "swords" };

export default function Page() {
  const { setUnread } = useApp();
  const st = useApi("/notifications");
  useEffect(() => { api("/notifications/read", { method: "POST", json: {} }).then(() => setUnread(0)).catch(() => {}); }, [setUnread]);
  return (
    <Async st={st}>{(d) => (
      <>
        <div className="page-head"><h1>Notifications</h1><p>New challenges, approvals and reminders from all your groups.</p></div>
        {d.notifications.length ? d.notifications.map((n) => (
          <Link key={n.id} href={(n.link || "/").replace(/^#/, "")} className={"card flat alert-row" + (n.read_at ? "" : " unread")}>
            <span className="ic"><Icon n={ICON[n.type] || "bell"} size={18} /></span>
            <div className="grow">
              <div className="row between" style={{ alignItems: "flex-start" }}><span className="t">{n.title}</span><span className="when">{fmtDate(n.created_at)}</span></div>
              <div className="muted" style={{ marginTop: 3 }}>{n.message}</div>
            </div>
          </Link>
        )) : <Empty icon="🔔" title="No alerts yet" text="New challenges, approvals and reminders from your groups land here." />}
      </>
    )}</Async>
  );
}
