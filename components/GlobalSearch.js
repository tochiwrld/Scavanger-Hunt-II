"use client";
import { installMoment } from "../lib/install.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, colorFor, tierFor, TIERS } from "../lib/client.js";
import { useApp } from "./Providers.js";
import Icon from "./icons.js";
import { Async, Avatar, Btn, LbRows, useApi } from "./ui.js";

/** Home page section: public groups anyone can join, plus the global ranking across them. */
export default function GlobalSearch() {
  const { toast, refreshGroups } = useApp();
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null);
  useEffect(() => { const t = setTimeout(() => setQuery(term.trim()), 300); return () => clearTimeout(t); }, [term]);
  const st = useApi("/global" + (query ? "?q=" + encodeURIComponent(query) : ""));
  const join = async (g) => {
    setBusy(g.id);
    try { const r = await api(`/global/${g.id}/join`, { method: "POST" }); await refreshGroups(); installMoment("join"); toast(r.live ? `You're in ${g.name}! This week is live, so start hunting now.` : `You're in ${g.name}!`, "good"); router.push(`/g/${g.id}${r.live ? "/hunt" : ""}`); }
    catch (e) { toast(e.message, "bad"); setBusy(null); }
  };
  return (
    <section className="stack" style={{ gap: 14, marginTop: 14 }}>
      <div className="page-head"><h1 style={{ display: "flex", alignItems: "center", gap: 12 }}><Icon n="globe" size={30} className="c-primary" />Global Hunt</h1><p>Open hunts anyone can join, even mid-week. Every pip you earn in them, and every star you catch, counts toward your global rank.</p></div>
      <Async st={st}>{(d) => {
        const t = tierFor(d.me.points);
        const pct = t.next ? Math.round(((d.me.points - t.min) / (t.next.at - t.min)) * 100) : 100;
        return (
          <>
            <section className="plate"><div className="stripe" /><div className="in">
              <div className="eyebrow">Your global rank</div>
              <div className="tiles" style={{ marginTop: 14 }}>
                <div className="tile score"><div className="label">Tier</div><div className="n" style={{ fontSize: "clamp(26px,7.5vw,34px)", fontFamily: "var(--font-head)", textTransform: "uppercase", letterSpacing: "-.03em" }}>{t.name}</div></div>
                <div className="tile rank"><div className="label">Rank</div><div className="n">{d.me.rank ? "#" + d.me.rank : "–"}{d.me.total ? <small>/ {d.me.total}</small> : null}</div></div>
              </div>
              <div className="bar" style={{ marginBottom: 10 }}><i style={{ width: pct + "%" }} /></div>
              <div className="progress-head"><span className="mono" style={{ color: "var(--fg)" }}>{d.me.points} pips</span><span className="muted" style={{ fontSize: 13 }}>{t.next ? `${t.next.need} more to reach ${t.next.name}` : "Top tier reached"}</span></div>
              <div className="row wrap" style={{ gap: 6, marginTop: 14 }}>
                {TIERS.map(([at, name], i) => <span key={name} className="chip" style={i <= t.index ? { color: "var(--primary)", borderColor: "color-mix(in oklch,var(--primary) 50%,transparent)" } : { color: "var(--muted-fg)" }}>{name} <span className="mono" style={{ fontSize: 11, opacity: .7 }}>{at}</span></span>)}
              </div>
            </div></section>

            <div style={{ position: "relative" }}>
              <Icon n="search" size={18} className="c-mute" style={{ position: "absolute", left: 16, top: 17 }} />
              <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search open hunts" aria-label="Search open hunts" maxLength={60} style={{ paddingLeft: 44 }} />
            </div>
            {d.groups.length ? d.groups.map((g) => (
              <div key={g.id} className="card gcard" style={{ "--gc": colorFor(g.id) }}>
                {/* Group images are members-only, so show the letter until you've joined. */}
                <Avatar g={{ ...g, has_image: g.has_image && g.joined }} />
                <div className="grow stack" style={{ gap: 6 }}>
                  <h3>{g.name}</h3>
                  {g.description ? <div className="muted">{g.description}</div> : null}
                  <div className="row wrap" style={{ gap: 8 }}>
                    <span className="muted" style={{ fontSize: 13 }}>{g.members} player{g.members === 1 ? "" : "s"}</span>
                    {g.live_title ? <span className="st approved st-wrap"><Icon n="flame" size={12} /><span>Live: {g.live_title}</span></span> : <span className="st draft">No hunt live</span>}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {g.joined ? <Link className="btn sm ghost" href={`/g/${g.id}`}>{g.role === "owner" ? "Open (you run this)" : "Joined · Open"}<Icon n="arrow" size={15} /></Link>
                      : <Btn busy={busy === g.id} className="sm" onClick={() => join(g)}><Icon n="plus" size={15} />Join</Btn>}
                  </div>
                </div>
              </div>
            )) : <div className="card empty"><div className="big">🌍</div><h3>{query ? "No open hunts match that" : "No public hunts to join right now"}</h3><p className="muted">{query ? "Try another word." : "The hunts running now are private and invite-only. Ask a friend for their invite link, or start your own."}</p></div>}

            {d.top.length ? (
              <section className="card">
                <div className="card-title"><h2><Icon n="trophy" size={20} className="c-primary" />Global leaderboard</h2></div>
                <LbRows rows={d.top.map((r) => ({ ...r, items: null, tier: tierFor(r.points).name }))} />
              </section>
            ) : null}
          </>
        );
      }}</Async>
    </section>
  );
}
