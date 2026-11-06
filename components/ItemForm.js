"use client";
import { useState } from "react";
import { api, cap, shrink } from "../lib/client.js";
import { DIFFICULTY_POINTS } from "../lib/shared.js";
import { Btn, ErrBox, Sheet, useForm } from "./ui.js";

export default function ItemForm({ gid, cid, it, onClose, onSaved }) {
  const [diff, setDiff] = useState(it?.difficulty || "easy");
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
        <div><label>Item name</label><input aria-label="Item name" name="title" maxLength={160} defaultValue={it?.title || ""} placeholder="Find a red car" required /></div>
        <div><label>Description</label><textarea aria-label="Description" name="description" maxLength={1000} defaultValue={it?.description || ""} /></div>
        <div><label>Instructions for the photos</label><textarea aria-label="Instructions for the photos" name="instructions" maxLength={2000} defaultValue={it?.instructions || ""} /></div>
        <div>
          <label>Difficulty</label>
          <div className="diff-pick" role="radiogroup" aria-label="Difficulty">
            {Object.entries(DIFFICULTY_POINTS).map(([d, pts]) => (
              <label key={d} className={"diff-opt" + (diff === d ? " on" : "")}>
                <input type="radio" name="difficulty" value={d} checked={diff === d} onChange={() => setDiff(d)} />
                <b>{cap(d)}</b><span>{pts} pts</span>
              </label>
            ))}
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Points are set by the difficulty.</div>
        </div>
        <div><label>Hint (optional)</label><input aria-label="Hint (optional)" name="hint" maxLength={500} defaultValue={it?.hint || ""} /></div>
        <div><label>Reference image (optional)</label><input aria-label="Reference image (optional)" name="ref" type="file" accept="image/*" />
          {it?.has_reference ? <button type="button" className="btn sm ghost" style={{ marginTop: 8 }} onClick={removeRef}>Remove current image</button> : null}</div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>Only set items that every player can do safely and legally. Nothing dangerous or illegal (see the <a className="link" href="/terms" target="_blank" rel="noreferrer">Terms</a>).</p>
        <ErrBox error={form.error} />
        <Btn busy={form.busy} className="block" type="submit">Save item</Btn>
      </form>
    </Sheet>
  );
}
