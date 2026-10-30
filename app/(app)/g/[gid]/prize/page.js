"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, fmtDate, naira } from "../../../../../lib/client.js";
import { useApp } from "../../../../../components/Providers.js";
import { Async, Btn, Empty, ErrBox, Sheet, useApi, useForm } from "../../../../../components/ui.js";

function PaidSheet({ gid, p, onClose, onDone }) {
  const form = useForm(async (v) => { await api(`/groups/${gid}/prizes/${p.id}/paid`, { method: "POST", json: v }); onDone(); });
  return (
    <Sheet onClose={onClose}>
      <h2>Mark prize as paid</h2>
      <form className="stack" style={{ marginTop: 12 }} onSubmit={form.onSubmit} noValidate>
        <div><label>Payment note (optional)</label><input name="note" maxLength={300} placeholder="Sent by bank transfer" /></div>
        <ErrBox error={form.error} />
        <Btn busy={form.busy} className="ok block" type="submit">Confirm paid</Btn>
      </form>
    </Sheet>
  );
}

export default function Page() {
  const { gid } = useParams();
  const { toast, refreshGroups } = useApp();
  const st = useApi(`/groups/${gid}/prizes`);
  const [paying, setPaying] = useState(null);
  return (
    <Async st={st}>{(d) => !d.prizes.length ? <Empty icon="🏆" title="No prizes yet" text="The winner and prize appear here when a week ends." /> : (
      <>
        <h2>Weekly prize</h2>
        <p className="muted">The app doesn't send money. Pay the winner yourself, then mark it as paid.</p>
        {d.prizes.map((p) => (
          <div key={p.id} className={"card" + (p.status === "pending" && p.winner ? " mist" : "")}>
            <div className="row between"><h3>{p.week_number ? `Week ${String(p.week_number).padStart(2, "0")}` : p.title}</h3><span className={`st ${p.status === "paid" ? "approved" : "pending"}`}>{p.status === "paid" ? "Paid" : "Pending"}</span></div>
            <div style={{ marginTop: 6 }}>{p.winner ? <>🥇 <b>{p.winner}</b> wins <b>{naira(p.amount)}</b></> : "No winner"}</div>
            <div className="muted">{p.title} · ended {fmtDate(p.end_at)}</div>
            {p.status === "paid" ? <div className="muted">Paid {fmtDate(p.paid_at)}{p.payout_note ? " · " + p.payout_note : ""}</div>
              : p.winner ? <button className="btn block ok" style={{ marginTop: 10 }} onClick={() => setPaying(p)}>Mark as paid</button> : null}
          </div>
        ))}
        {paying ? <PaidSheet gid={gid} p={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); toast("Marked as paid", "good"); refreshGroups(); st.reload(); }} /> : null}
      </>
    )}</Async>
  );
}
