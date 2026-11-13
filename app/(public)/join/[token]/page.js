"use client";
import { installMoment } from "../../../../lib/install.js";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, fmtDate } from "../../../../lib/client.js";
import { useApp } from "../../../../components/Providers.js";
import { Brand, ThemeToggle } from "../../../../components/Brand.js";
import Icon from "../../../../components/icons.js";
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
      if (!r.already) installMoment("join");
      toast(r.already ? "You're already in this hunt" : r.live ? "You're in! This week is already live, so start hunting now." : "You're in! Happy hunting.", "good");
      router.push("/g/" + r.group_id + (r.live && !r.already ? "/hunt" : ""));
    } catch (e) { toast(e.message, "bad"); setBusy(false); }
  };
  return (
    <>
      <header className="top"><Brand /><div className="acts"><ThemeToggle /></div></header>
      <div className="auth" style={{ paddingTop: 28 }}>
        <Async st={st} gone={
          <Empty icon="🔗" title="This invite link doesn't work" text="It may have been replaced, switched off or typed wrong. Ask your hunt admin to send you a new link.">
            <Link className="btn" href="/">Go to PrimaHunt</Link>
          </Empty>
        }>{(d) => (
          <div className="stack" style={{ gap: 14 }}>
            <section className="plate"><div className="stripe" /><div className="in" style={{ textAlign: "center", padding: "30px 22px" }}>
              <div className="eyebrow">You're invited to join</div>
              <h1 style={{ margin: "12px 0 12px" }}>{d.group.name}</h1>
              {d.group.description ? <p className="prose">{d.group.description}</p> : null}
              <div className="muted">Hosted by <b style={{ color: "var(--fg)" }}>{d.host}</b></div>
              {d.live ? <div className="card mist flat" style={{ marginTop: 16, textAlign: "left" }}><b>{d.live.week_number ? `Week ${d.live.week_number}` : "This week's hunt"} is live now.</b> You can still join and start hunting straight away. It closes {fmtDate(d.live.end_at)}.</div> : <div className="muted" style={{ marginTop: 10 }}>Join any time, even mid-week.</div>}
            </div></section>
            {!ready ? null : me ? <Btn busy={busy} className="block" onClick={join}>Join hunt<Icon n="arrow" size={18} /></Btn> : (
              <>
                <Link className="btn block" href={`/register?next=${next}`}>Create account to join<Icon n="arrow" size={18} /></Link>
                <Link className="btn block ghost" href={`/login?next=${next}`}>I already have an account</Link>
              </>
            )}
          </div>
        )}</Async>
      </div>
    </>
  );
}
