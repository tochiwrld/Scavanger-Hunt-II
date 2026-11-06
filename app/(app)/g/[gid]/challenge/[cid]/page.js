"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, cap, fromLagosInput, toLagosInput } from "../../../../../../lib/client.js";
import { useApp } from "../../../../../../components/Providers.js";
import ItemForm from "../../../../../../components/ItemForm.js";
import { Async, Btn, ErrBox, Sheet, Skel, useApi, useForm } from "../../../../../../components/ui.js";

function ChallengeForm({ gid, c, isNew, draft, onSaved }) {
  const router = useRouter();
  const { toast, groups } = useApp();
  const official = Boolean(groups?.find((x) => String(x.id) === String(gid))?.official);
  const form = useForm(async (v) => {
    const body = { ...v, start_at: fromLagosInput(v.start_at), end_at: fromLagosInput(v.end_at) };
    const r = await api(isNew ? `/groups/${gid}/challenges` : `/groups/${gid}/challenges/${c.id}`, { method: isNew ? "POST" : "PUT", json: body });
    toast("Draft saved", "good");
    if (isNew) router.push(`/g/${gid}/challenge/${r.id}`); else onSaved();
  });
  return (
    <form className="card" onSubmit={form.onSubmit} noValidate>
      <h2>{isNew ? "New challenge" : draft ? "Edit draft" : c.title}</h2>
      {draft ? <p className="muted">Draft: only you can see it. Times are Lagos time.</p>
        : <div className="card mist">🔒 {official && c.phase !== "closed" ? "Published. Existing items are locked, but you can keep adding new ones." : c.phase === "upcoming" ? "Scheduled. Items and points are locked. Unpublish to edit." : c.phase === "active" ? "Live. Items and points are locked." : "This challenge has finished."}</div>}
      <fieldset disabled={!draft} style={{ border: 0, padding: 0, margin: "12px 0 0" }}>
        <div className="field"><label>Challenge title</label><input aria-label="Challenge title" name="title" defaultValue={c.title} maxLength={120} placeholder="The City Hunt" required /></div>
        <div className="field"><label>Description</label><textarea aria-label="Description" name="description" defaultValue={c.description} maxLength={2000} /></div>
        <div className="field"><label>Rules</label><textarea aria-label="Rules" name="rules" defaultValue={c.rules} maxLength={4000} /><div className="muted">The tie-breaker rule is added automatically.</div></div>
        <div className="field"><label>Starts (Lagos time)</label><input aria-label="Starts (Lagos time)" type="datetime-local" name="start_at" defaultValue={toLagosInput(c.start_at)} required /></div>
        <div className="field"><label>Ends (Lagos time)</label><input aria-label="Ends (Lagos time)" type="datetime-local" name="end_at" defaultValue={toLagosInput(c.end_at)} required /><div className="muted">Default: Monday 12:00 AM to Sunday 11:59 PM.</div></div>
        {official ? <input type="hidden" name="prize_amount" value="0" /> : <div className="field"><label>Weekly prize (₦)</label><input aria-label="Weekly prize (₦)" name="prize_amount" type="number" inputMode="numeric" min={0} defaultValue={c.prize_amount} /></div>}
      </fieldset>
      <ErrBox error={form.error} />
      {draft ? <Btn busy={form.busy} className="block" type="submit">{isNew ? "Save draft" : "Save changes"}</Btn> : null}
    </form>
  );
}

function Editor({ gid, d, reload }) {
  const router = useRouter();
  const { toast, refreshGroups, groups } = useApp();
  const c = d.challenge, items = d.items, draft = c.status === "draft";
  // PRIMAHUNT OFFICIAL runs for a year: its admins can keep adding items after publishing (existing ones stay locked).
  const growing = !draft && c.status === "published" && c.phase !== "closed" && Boolean(groups?.find((x) => String(x.id) === String(gid))?.official);
  const [itemForm, setItemForm] = useState(null); // {it} or {}
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [busy, setBusy] = useState("");
  const act = async (name, fn) => { setBusy(name); try { await fn(); } catch (e) { toast(e.message, "bad"); } finally { setBusy(""); } };
  const move = (i, dir) => act("move", async () => {
    const order = items.map((x) => x.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await api(`/groups/${gid}/challenges/${c.id}/reorder`, { method: "POST", json: { order } });
    reload();
  });
  const del = (it) => { if (confirm("Delete this item?")) act("del", async () => { await api(`/groups/${gid}/items/${it.id}`, { method: "DELETE" }); reload(); }); };
  const publish = () => act("publish", async () => {
    try { await api(`/groups/${gid}/challenges/${c.id}/publish`, { method: "POST" }); toast("🚀 Published", "good"); await refreshGroups(); reload(); }
    finally { setConfirmPublish(false); }
  });
  const unpublish = () => act("unpub", async () => { await api(`/groups/${gid}/challenges/${c.id}/unpublish`, { method: "POST" }); toast("Back to draft"); await refreshGroups(); reload(); });
  const remove = () => { if (!confirm("Are you sure? Challenges with submissions are archived instead of deleted.")) return; act("rm", async () => { const r = await api(`/groups/${gid}/challenges/${c.id}`, { method: "DELETE" }); toast(r.result === "archived" ? "Archived" : "Deleted"); router.push(`/g/${gid}/challenges`); }); };
  return (
    <>
      <ChallengeForm gid={gid} c={c} isNew={false} draft={draft} onSaved={reload} />
      <div className="sec-title"><h2>Items ({items.length})</h2></div>
      <div className="stack">
        {items.length ? items.map((i, n) => (
          <div key={i.id} className="card flat"><div className="row between">
            <div className="grow"><b>{n + 1}. {i.title}</b><div className="muted">{cap(i.difficulty)} · {i.points} pts{i.has_reference ? " · 🖼️" : ""}</div></div>
            {draft ? <>
              <button className="btn sm ghost" aria-label="Move up" onClick={() => move(n, -1)}>▲</button>
              <button className="btn sm ghost" aria-label="Move down" onClick={() => move(n, 1)}>▼</button>
              <button className="btn sm ghost" onClick={() => setItemForm({ it: i })}>Edit</button>
              <button className="btn sm bad" aria-label="Delete" onClick={() => del(i)}>✕</button>
            </> : null}
          </div></div>
        )) : <p className="muted">No items yet.</p>}
      </div>
      {draft || growing ? <button className="btn block ghost" onClick={() => setItemForm({})}>＋ Add item</button> : null}
      {growing ? <p className="muted" style={{ margin: "6px 0 0", textAlign: "center", fontSize: 13 }}>New items go live straight away and players get an in-app alert.</p> : null}
      <div className="card stack">
        <Link className="btn block ghost" href={`/g/${gid}/preview/${c.id}`}>👀 Preview as a player</Link>
        {draft ? <button className="btn block ok" onClick={() => setConfirmPublish(true)}>🚀 Publish challenge</button> : null}
        {c.phase === "upcoming" ? <Btn busy={busy === "unpub"} className="block ghost" onClick={unpublish}>Unpublish (back to draft)</Btn> : null}
        <Btn busy={busy === "rm"} className="block bad" onClick={remove}>{c.submission_count || !draft ? "Archive challenge" : "Delete draft"}</Btn>
      </div>
      {itemForm ? <ItemForm gid={gid} cid={c.id} it={itemForm.it} onClose={() => setItemForm(null)} onSaved={() => { setItemForm(null); reload(); }} /> : null}
      {confirmPublish ? (
        <Sheet onClose={() => setConfirmPublish(false)}>
          <h2>Publish this week's challenge?</h2>
          <p style={{ margin: "10px 0 16px" }}><b>{c.title}</b></p>
          <p>Once the challenge becomes active, players will be able to see the complete item list and point values. Items and scoring are then locked.</p>
          <div className="row" style={{ marginTop: 16 }}><button className="btn ghost grow" onClick={() => setConfirmPublish(false)}>Cancel</button><Btn busy={busy === "publish"} className="ok grow" onClick={publish}>Publish</Btn></div>
        </Sheet>
      ) : null}
    </>
  );
}

export default function Page() {
  const { gid, cid } = useParams();
  const isNew = cid === "new";
  const st = useApi(isNew ? null : `/groups/${gid}/challenges/${cid}`);
  const defs = useApi(isNew ? `/groups/${gid}/challenge-defaults` : null);
  if (isNew) {
    if (defs.loading) return <Skel />;
    const c = { title: "", description: "", rules: "", prize_amount: 3000, status: "draft", phase: "draft", ...defs.data };
    return <ChallengeForm gid={gid} c={c} isNew draft />;
  }
  return <Async st={st}>{(d) => <Editor gid={gid} d={d} reload={st.reload} />}</Async>;
}
