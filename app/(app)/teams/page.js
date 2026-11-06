"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, DUEL_TIMES, fmtDate, fmtMinutes } from "../../../lib/client.js";
import Icon from "../../../components/icons.js";
import { Async, Btn, Empty, ErrBox, useApi, useForm } from "../../../components/ui.js";

const PHASE = { waiting: ["clock", "Waiting for a rival"], setup: ["pencil", "Filling teams"], live: ["flame", "Timer running"], judging: ["inbox", "Judging photos"], finished: ["trophy", "Finished"] };
const RESULT = { won: ["approved", "Your team won"], lost: ["rejected", "Your team lost"], tie: ["pending", "Tie"] };

export default function Page() {
  const router = useRouter();
  const st = useApi("/teams");
  const create = useForm(async (v) => {
    const r = await api("/teams", { method: "POST", json: { size: +v.size, minutes: +v.minutes, items: +v.items } });
    router.push(`/team/${r.id}`);
  });
  return (
    <>
      <div className="page-head"><h1>Team vs</h1><p>2v2, 3v3, 4v4 and up. Send the rival link to the other team's captain, then each captain shares their own team link with teammates. Each team writes a list for the other.</p></div>
      <form className="plate" onSubmit={create.onSubmit} noValidate>
        <div className="stripe" />
        <div className="in">
          <h2 style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}><Icon n="team" size={22} className="c-primary" />New team match</h2>
          <div className="field"><label htmlFor="size">Team size</label>
            <select id="size" name="size" defaultValue="2">{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}v{n}</option>)}</select></div>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="grow field"><label htmlFor="minutes">Time limit</label><select id="minutes" name="minutes" defaultValue="60">{DUEL_TIMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="grow field"><label htmlFor="items">Items per team</label><select id="items" name="items" defaultValue="6">{Array.from({ length: 15 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></div>
          </div>
          <ErrBox error={create.error} />
          <Btn busy={create.busy} className="block" type="submit"><Icon n="link" size={18} />Create match</Btn>
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>You'll captain Team A. One account can only be on one team.</p>
        </div>
      </form>
      <Async st={st}>{(d) => (
        <>
          <section className="card">
            <div className="card-title" style={{ marginBottom: 14 }}><h2>Team record</h2></div>
            <div className="stats" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div className="stat"><Icon n="trophy" size={20} className="c-ok" /><b>{d.record.wins}</b><span>Wins</span></div>
              <div className="stat"><Icon n="x" size={20} className="c-bad" /><b>{d.record.losses}</b><span>Losses</span></div>
              <div className="stat"><Icon n="team" size={20} className="c-mute" /><b>{d.record.ties}</b><span>Ties</span></div>
            </div>
          </section>
          {d.matches.length ? d.matches.map((x) => {
            const [ic, label] = PHASE[x.phase] || ["clock", x.phase];
            return (
              <Link key={x.id} href={`/team/${x.id}`} className="card gcard" style={{ display: "block" }}>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <h3>{x.size}v{x.size} vs {x.rival ? `${x.rival}'s team` : "(no rival yet)"}</h3>
                  {x.result ? <span className={`st ${RESULT[x.result][0]}`}>{RESULT[x.result][1]}</span> : <span className={"st " + (x.phase === "live" ? "approved" : x.phase === "judging" ? "pending" : "draft")}><Icon n={ic} size={12} />{label}</span>}
                </div>
                <div className="row wrap" style={{ gap: 8, marginTop: 10 }}><span className="pts">{x.items} PER TEAM</span><span className="muted" style={{ fontSize: 13 }}>{fmtMinutes(x.minutes)} · {x.phase === "live" ? "Ends " + fmtDate(x.end_at) : "Created " + fmtDate(x.created_at)}</span></div>
              </Link>
            );
          }) : <Empty icon="🤝" title="No team matches yet" text="Create one above and send the rival link to the other captain." />}
        </>
      )}</Async>
    </>
  );
}
