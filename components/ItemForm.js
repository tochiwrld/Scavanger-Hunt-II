"use client";
import { api, cap, shrink } from "../lib/client.js";
import { Btn, ErrBox, Sheet, useForm } from "./ui.js";

export default function ItemForm({ gid, cid, it, onClose, onSaved }) {
  const form = useForm(async (v, f) => {
    const file = new FormData(f).get("ref");
    const data = { ...v }; delete data.ref;
    const r = await api(it ? `/groups/${gid}/items/${it.id}` : `/groups/${gid}/challenges/${cid}/items`, { method: it ? "PUT" : "POST", json: data });
    const itemId = it ? it.id : r.id;
    if (file && file.size) {
      const fd = new FormData();
      fd.append("image", await shrink(file, 1200), "ref.jpg");
      await api(`/groups/${gid}/items/${itemId}/reference`, { method: "POST", form: fd });
    }
    onSaved();
  });
  const removeRef = async () => { try { await api(`/groups/${gid}/items/${it.id}/reference`, { method: "DELETE" }); onSaved(); } catch (e) { alert(e.message); } };
  return (
    <Sheet onClose={onClose}>
      <h2>{it ? "Edit item" : "Add item"}</h2>
      <form className="stack" style={{ marginTop: 12 }} onSubmit={form.onSubmit} noValidate>
        <div><label>Item name</label><input name="title" maxLength={160} defaultValue={it?.title || ""} placeholder="Find a red car" required /></div>
        <div><label>Description</label><textarea name="description" maxLength={1000} defaultValue={it?.description || ""} /></div>
        <div><label>Instructions for the photos</label><textarea name="instructions" maxLength={2000} defaultValue={it?.instructions || ""} /></div>
        <div className="row">
          <div className="grow"><label>Difficulty</label><select name="difficulty" defaultValue={it?.difficulty || "easy"}>{["easy", "medium", "hard", "extreme"].map((d) => <option key={d} value={d}>{cap(d)}</option>)}</select></div>
          <div className="grow"><label>Points</label><input name="points" type="number" inputMode="numeric" min={0} max={10000} defaultValue={it?.points ?? 10} /></div>
        </div>
        <div><label>Hint (optional)</label><input name="hint" maxLength={500} defaultValue={it?.hint || ""} /></div>
        <div><label>Reference image (optional)</label><input name="ref" type="file" accept="image/*" />
          {it?.has_reference ? <button type="button" className="btn sm ghost" style={{ marginTop: 8 }} onClick={removeRef}>Remove current image</button> : null}</div>
        <ErrBox error={form.error} />
        <Btn busy={form.busy} className="block" type="submit">Save item</Btn>
      </form>
    </Sheet>
  );
}
