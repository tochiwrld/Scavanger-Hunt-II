"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, fmtMinutes } from "../../../../lib/client.js";
import { useApp } from "../../../../components/Providers.js";
import { Brand, ThemeToggle } from "../../../../components/Brand.js";
import Icon from "../../../../components/icons.js";
import { Async, Btn, Empty, useApi } from "../../../../components/ui.js";

/** One page for both kinds of team link: the rival captain's challenge and the "join my team" link. */
export default function Page() {
  const { token } = useParams();
  const router = useRouter();
  const { me, ready, toast } = useApp();
  const st = useApi(ready ? `/t/${encodeURIComponent(token)}` : null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const next = encodeURIComponent(`/t/${token}`);
  const accept = async () => {
    setBusy(true);
    try {
      const r = await api(`/t/${encodeURIComponent(token)}/accept`, { method: "POST", json: { name } });
      toast("You're in! Help your team write its list.", "good");
      router.push("/team/" + r.id);
    } catch (e) { toast(e.message, "bad"); setBusy(false); st.reload(); }
  };
  return (
    <>
      <header className="top"><Brand /><div className="acts"><ThemeToggle /></div></header>
      <div className="auth" style={{ paddingTop: 28 }}>
        <Async st={st.data || st.error ? st : { loading: true }} gone={
          <Empty icon="🤝" title="This team link doesn't work" text="The team may be full, the match may have started, or the link was called off. Ask your friend for a new one.">
            <Link className="btn" href="/">Go to PrimaHunt</Link>
          </Empty>
        }>{(d) => {
          const vs = `${d.size}v${d.size}`;
          return (
            <div className="stack" style={{ gap: 14 }}>
              <section className="plate"><div className="stripe" /><div className="in" style={{ textAlign: "center", padding: "30px 22px" }}>
                <span style={{ width: 56, height: 56, borderRadius: 16, background: "var(--primary)", color: "var(--primary-fg)", display: "inline-grid", placeItems: "center" }}><Icon n="team" size={28} /></span>
                <div className="eyebrow" style={{ marginTop: 16 }}>{d.kind === "rival" ? `You've been challenged to a ${vs} by` : `Join the team for a ${vs}, captained by`}</div>
                <h1 style={{ margin: "10px 0 6px" }}>{d.host}</h1>
                <div className="muted" style={{ marginBottom: 14 }}>{d.kind === "rival" ? "Their team: " : "Team: "}<b style={{ color: "var(--fg)" }}>{d.team}</b></div>
                <div className="row wrap" style={{ justifyContent: "center", gap: 8, marginBottom: 14 }}>
                  <span className="pts">{d.items} ITEM{d.items === 1 ? "" : "S"} PER TEAM</span>
                  <span className="chip" style={{ color: "var(--fg)" }}><Icon n="timer" size={13} />{fmtMinutes(d.minutes)}</span>
                  {d.kind === "mate" ? <span className="chip" style={{ color: "var(--fg)" }}><Icon n="team" size={13} />{d.filled}/{d.size} on the team</span> : null}
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  {d.kind === "rival"
                    ? "Accept to captain the other team. You'll get your own link to bring in teammates. Each team writes a list for the other, and the timer starts when both teams are ready."
                    : "Each team writes a list for the other team. Anyone on your team can hunt any item. One account can only be on one team."}
                </p>
              </div></section>
              {d.id ? <Link className="btn block" href={`/team/${d.id}`}>Open the match<Icon n="arrow" size={18} /></Link>
                : me ? <>
                  {d.kind === "rival" ? <div className="field" style={{ margin: 0 }}><label htmlFor="tname">Name your team</label><input id="tname" value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="e.g. Surulere Squad" autoComplete="off" /><div className="muted">Optional. You can change it until the timer starts.</div></div> : null}
                  <Btn busy={busy} className="block" onClick={accept}><Icon n="team" size={18} />{d.kind === "rival" ? "Accept and captain my team" : "Join this team"}</Btn>
                </> : (
                  <>
                    <Link className="btn block" href={`/register?next=${next}`}>Create account to join<Icon n="arrow" size={18} /></Link>
                    <Link className="btn block ghost" href={`/login?next=${next}`}>I already have an account</Link>
                  </>
                )}
            </div>
          );
        }}</Async>
      </div>
    </>
  );
}
