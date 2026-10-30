"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../lib/client.js";
import { useApp } from "../../../../components/Providers.js";
import { Async, Btn, Empty, useApi } from "../../../../components/ui.js";

export default function Page() {
  const { token } = useParams();
  const router = useRouter();
  const { me, ready, toast, refreshGroups } = useApp();
  const st = useApi(`/invite/${encodeURIComponent(token)}`);
  const [busy, setBusy] = useState(false);
  const next = encodeURIComponent(`/join/${token}`);
  const join = async () => {
    setBusy(true);
    try {
      const r = await api(`/invite/${encodeURIComponent(token)}/join`, { method: "POST" });
      await refreshGroups();
      toast(r.already ? "You're already in this group" : "You're in! 🎯", "good");
      router.push("/g/" + r.group_id);
    } catch (e) { toast(e.message, "bad"); setBusy(false); }
  };
  return (
    <div className="auth">
      <Async st={st}>{(d) => (
        <div className="stack">
          <div className="card dark stack" style={{ textAlign: "center", padding: 24 }}>
            <div className="muted" style={{ color: "#c9c2b4" }}>You have been invited to join</div>
            <h1 style={{ color: "var(--danfo)" }}>{d.group.name}</h1>
            {d.group.description ? <p style={{ color: "#e7e1d3" }}>{d.group.description}</p> : null}
            <div className="muted" style={{ color: "#c9c2b4" }}>Hosted by <b style={{ color: "#fff" }}>{d.host}</b></div>
          </div>
          {!ready ? null : me ? <Btn busy={busy} className="block" onClick={join}>🎯 Join group</Btn> : (
            <>
              <Link className="btn block" href={`/register?next=${next}`}>Create account to join</Link>
              <Link className="btn block ghost" href={`/login?next=${next}`}>I already have an account</Link>
            </>
          )}
        </div>
      )}</Async>
    </div>
  );
}
