"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, fmtDate } from "../../../../../lib/client.js";
import { useApp } from "../../../../../components/Providers.js";
import { Async, Btn, Empty, ErrBox, Sheet, useApi, useForm } from "../../../../../components/ui.js";

function Adjust({ gid, u, ch, onClose, onDone }) {
  const form = useForm(async (v) => { await api(`/groups/${gid}/members/${u.id}/adjust`, { method: "POST", json: v }); onDone(); });
  return (
    <Sheet onClose={onClose}>
      <h2>Adjust score</h2>
      <p className="muted" style={{ margin: "6px 0 12px" }}>{u.nickname} · {ch.title} · now {u.score} pts</p>
      <form className="stack" onSubmit={form.onSubmit} noValidate>
        <div><label>New score</label><input aria-label="New score" name="new_score" type="number" inputMode="numeric" min={0} defaultValue={u.score} /></div>
        <div><label>Reason (saved in the log)</label><textarea aria-label="Reason (saved in the log)" name="reason" maxLength={300} /></div>
        <ErrBox error={form.error} />
        <Btn busy={form.busy} className="block" type="submit">Save adjustment</Btn>
      </form>
    </Sheet>
  );
}

export default function Page() {
  const { gid } = useParams();
  const { toast, refreshGroups } = useApp();
  const st = useApi(`/groups/${gid}/members`);
  const [q, setQ] = useState("");
  const [adj, setAdj] = useState(null);
  const makeAdmin = async (u) => {
    if (!confirm(`Make ${u.nickname} co-admin? They'll stop playing and can review submissions, run challenges and manage players. They can't remove you or delete the hunt.`)) return;
    try { await api(`/groups/${gid}/members/${u.id}/make-admin`, { method: "POST" }); toast(`${u.nickname} is now co-admin`, "good"); refreshGroups(); st.reload(); } catch (e) { toast(e.message, "bad"); }
  };
  const dropAdmin = async (u) => {
    if (!confirm(`Remove ${u.nickname} as co-admin? They'll go back to being a player.`)) return;
    try { await api(`/groups/${gid}/members/${u.id}/remove-admin`, { method: "POST" }); toast(`${u.nickname} is a player again`); refreshGroups(); st.reload(); } catch (e) { toast(e.message, "bad"); }
  };
  const remove = async (u) => {
    if (!confirm(`Remove ${u.nickname} from this hunt? Their past results stay in the hunt's history.`)) return;
    try { await api(`/groups/${gid}/members/${u.id}/remove`, { method: "POST" }); toast("Removed"); refreshGroups(); st.reload(); } catch (e) { toast(e.message, "bad"); }
  };
  return (
    <Async st={st}>{(d) => {
      const players = d.members.filter((m) => m.role === "player");
      const rows = players.filter((m) => !q || m.nickname.toLowerCase().includes(q.toLowerCase()));
      const coAdmins = d.members.filter((m) => m.role === "admin");
      const seatFree = coAdmins.length < (d.max_co_admins || 1);
      return (
        <>
          <section className="card">
            <h2>Co-admin</h2>
            {coAdmins.length ? coAdmins.map((u) => (
              <div key={u.id} className="row between" style={{ marginTop: 10 }}>
                <b>{u.nickname}</b>
                {d.founder ? <button className="btn sm ghost" onClick={() => dropAdmin(u)}>Remove as co-admin</button> : <span className="muted">Co-admin</span>}
              </div>
            )) : <p className="muted" style={{ margin: "6px 0 0" }}>{d.founder ? "You can make one player co-admin. They help review and run the hunt, but can't remove you or delete the hunt." : "No co-admin yet."}</p>}
          </section>
          <input type="search" aria-label="Search players" placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} />
          {rows.length ? rows.map((u) => (
            <div key={u.id} className="card flat">
              <div className="row between"><b>{u.nickname}</b><span className="muted">Joined {fmtDate(u.joined_at)}</span></div>
              <div className="muted">{u.submissions} submissions · {u.approved} approved · {u.score} pts this week</div>
              <div className="row wrap" style={{ marginTop: 10 }}>
                <button className="btn sm ghost" onClick={() => (d.active_challenge ? setAdj(u) : toast("There's no active challenge to adjust", "bad"))}>Adjust score</button>
                {d.founder && seatFree ? <button className="btn sm ghost" onClick={() => makeAdmin(u)}>Make co-admin</button> : null}
                <button className="btn sm bad" onClick={() => remove(u)}>Remove</button>
              </div>
            </div>
          )) : <Empty icon="👥" title={players.length ? "No one found" : "No players yet"} text={players.length ? "" : "Share your invite link to get people in."}>{players.length ? null : <Link className="btn" href={`/g/${gid}/invite`}>Invite players</Link>}</Empty>}
          {adj ? <Adjust gid={gid} u={adj} ch={d.active_challenge} onClose={() => setAdj(null)} onDone={() => { setAdj(null); toast("Score adjusted and logged", "good"); st.reload(); }} /> : null}
        </>
      );
    }}</Async>
  );
}
