"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, fmtMinutes } from "../../../../lib/client.js";
import { useApp } from "../../../../components/Providers.js";
import { Brand, ThemeToggle } from "../../../../components/Brand.js";
import Icon from "../../../../components/icons.js";
import { Async, Btn, useApi } from "../../../../components/ui.js";

export default function Page() {
  const { token } = useParams();
  const router = useRouter();
  const { me, ready, toast } = useApp();
  // Wait until we know who's logged in: the creator and the accepted opponent get a button into the room.
  const st = useApi(ready ? `/vs/${encodeURIComponent(token)}` : null);
  const [busy, setBusy] = useState(false);
  const next = encodeURIComponent(`/vs/${token}`);
  const accept = async () => {
    setBusy(true);
    try {
      const r = await api(`/vs/${encodeURIComponent(token)}/accept`, { method: "POST" });
      toast("You're in! Write your list.", "good");
      router.push("/duel/" + r.id);
    } catch (e) { toast(e.message, "bad"); setBusy(false); st.reload(); }
  };
  return (
    <>
      <header className="top"><Brand /><div className="acts"><ThemeToggle /></div></header>
      <div className="auth" style={{ paddingTop: 28 }}>
        <Async st={st.data || st.error ? st : { loading: true }}>{(d) => (
          <div className="stack" style={{ gap: 14 }}>
            <section className="plate"><div className="stripe" /><div className="in" style={{ textAlign: "center", padding: "30px 22px" }}>
              <span style={{ width: 56, height: 56, borderRadius: 16, background: "var(--primary)", color: "var(--primary-fg)", display: "inline-grid", placeItems: "center" }}><Icon n="swords" size={28} /></span>
              <div className="eyebrow" style={{ marginTop: 16 }}>{d.own ? "Your 1v1 link" : "You've been challenged to a 1v1 by"}</div>
              <h1 style={{ margin: "10px 0 14px" }}>{d.host}</h1>
              <div className="row wrap" style={{ justifyContent: "center", gap: 8, marginBottom: 14 }}>
                <span className="pts">{d.items} ITEM{d.items === 1 ? "" : "S"} EACH</span><span className="chip" style={{ color: "var(--fg)" }}><Icon n="timer" size={13} />{fmtMinutes(d.minutes)}</span>
              </div>
              <p className="muted" style={{ margin: 0 }}>You each write a list for the other to find. The timer starts once both lists are done. This link works for one person only.</p>
            </div></section>
            {d.id ? <Link className="btn block" href={`/duel/${d.id}`}>Open the 1v1<Icon n="arrow" size={18} /></Link>
              : me ? <Btn busy={busy} className="block" onClick={accept}><Icon n="swords" size={18} />Accept the 1v1</Btn> : (
                <>
                  <Link className="btn block" href={`/register?next=${next}`}>Create account to accept<Icon n="arrow" size={18} /></Link>
                  <Link className="btn block ghost" href={`/login?next=${next}`}>I already have an account</Link>
                </>
              )}
          </div>
        )}</Async>
      </div>
    </>
  );
}
