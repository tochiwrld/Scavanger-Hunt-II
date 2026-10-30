"use client";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../../lib/client.js";
import { useApp } from "../../../../../components/Providers.js";
import { Async, Btn, useApi } from "../../../../../components/ui.js";

export default function Page() {
  const { gid } = useParams();
  const router = useRouter();
  const { groups, refreshGroups, toast } = useApp();
  const g = groups?.find((x) => String(x.id) === gid);
  const st = useApi(`/groups/${gid}/members`);
  const [busy, setBusy] = useState(false);
  const leave = async () => {
    if (!confirm("Leave this group? Your account and other groups aren't affected.")) return;
    setBusy(true);
    try { await api(`/groups/${gid}/leave`, { method: "POST" }); await refreshGroups(); toast("You left the group"); router.push("/"); } catch (e) { toast(e.message, "bad"); setBusy(false); }
  };
  return (
    <Async st={st}>{(d) => (
      <>
        <h2>Players</h2>
        <div className="stack">{d.members.map((m, i) => <div key={i} className="card flat row between"><b>{m.nickname}</b><span className="muted">{m.role === "owner" ? "Admin" : "Player"}</span></div>)}</div>
        {g?.role === "player" ? <><Btn busy={busy} className="block bad" onClick={leave}>Leave this group</Btn><p className="muted" style={{ textAlign: "center" }}>Your account and your other groups stay as they are.</p></> : null}
      </>
    )}</Async>
  );
}
