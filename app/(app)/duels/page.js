"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, DUEL_TIMES, fmtDate, fmtMinutes } from "../../../lib/client.js";
import Icon from "../../../components/icons.js";
import { Async, Btn, Empty, ErrBox, useApi, useForm } from "../../../components/ui.js";

const PHASE = { waiting: ["clock", "Waiting for them to accept"], setup: ["pencil", "Writing lists"], live: ["flame", "Timer running"], judging: ["inbox", "Judging photos"], finished: ["trophy", "Finished"] };
const RESULT = { won: ["approved", "You won"], lost: ["rejected", "You lost"], tie: ["pending", "Tie"] };

export default function Page() {
  const router = useRouter();
  const st = useApi("/duels");
  const create = useForm(async (v) => {
    const r = await api("/duels", { method: "POST", json: { minutes: +v.minutes, items: +v.items } });
    router.push(`/duel/${r.id}`);
  });
  return (
    <>
      <div className="page-head"><h1>1v1</h1><p>Challenge one friend with a private link. You each write a list for the other to find, and the timer starts once both lists are done.</p></div>
      <form className="plate" onSubmit={create.onSubmit} noValidate>
        <div className="stripe" />
        <div className="in">
          <h2 style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}><Icon n="swords" size={22} className="c-primary" />New 1v1</h2>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="grow field"><label htmlFor="minutes">Time limit</label><select id="minutes" name="minutes" defaultValue="60">{DUEL_TIMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="grow field"><label htmlFor="items">Items each</label><select id="items" name="items" defaultValue="5">{Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></div>
          </div>
          <ErrBox error={create.error} />
          <Btn busy={create.busy} className="block" type="submit"><Icon n="link" size={18} />Create private link</Btn>
          <p className="muted" style={{ margin: "12px 0 0", fontSize: 13 }}>The link works for one person only: the first person to accept it.</p>
        </div>
      </form>
      <Async st={st}>{(d) => (
        <>
          <section className="card">
            <div className="card-title" style={{ marginBottom: 14 }}><h2>Your record</h2></div>
            <div className="stats" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div className="stat"><Icon n="trophy" size={20} className="c-ok" /><b>{d.record.wins}</b><span>Wins</span></div>
              <div className="stat"><Icon n="x" size={20} className="c-bad" /><b>{d.record.losses}</b><span>Losses</span></div>
              <div className="stat"><Icon n="swords" size={20} className="c-mute" /><b>{d.record.ties}</b><span>Ties</span></div>
            </div>
          </section>
          {d.duels.length ? d.duels.map((x) => {
            const [ic, label] = PHASE[x.phase] || ["clock", x.phase];
            return (
              <Link key={x.id} href={`/duel/${x.id}`} className="card gcard" style={{ display: "block" }}>
                <div className="row between" style={{ alignItems: "flex-start" }}>
                  <h3>vs {x.opponent || "(not accepted yet)"}</h3>
                  {x.result ? <span className={`st ${RESULT[x.result][0]}`}>{RESULT[x.result][1]}</span> : <span className={"st " + (x.phase === "live" ? "approved" : x.phase === "judging" ? "pending" : "draft")}><Icon n={ic} size={12} />{label}</span>}
                </div>
                <div className="row wrap" style={{ gap: 8, marginTop: 10 }}><span className="pts">{x.item_count} EACH</span><span className="muted" style={{ fontSize: 13 }}>{fmtMinutes(x.minutes)} · {x.phase === "live" ? "Ends " + fmtDate(x.end_at) : "Created " + fmtDate(x.created_at)}</span></div>
              </Link>
            );
          }) : <Empty icon="⚔️" title="No 1v1s yet" text="Create one above and send the link to a friend." />}
        </>
      )}</Async>
    </>
  );
}
