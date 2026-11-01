"use client";
import { useState } from "react";
import { api, shrink } from "../lib/client.js";
import Icon from "./icons.js";
import { Btn, Sheet } from "./ui.js";

const MAX = 4;
const LIMIT = 3.8 * 1024 * 1024; // keep the whole upload under the server's 4 MB cap

/** Photo proof: one photo is enough; add up to four. Preview, retake or remove before sending. */
export default function SubmitSheet({ gid, it, endpoint = `/groups/${gid}/items/${it?.id}/submit`, onClose, onDone }) {
  const [slots, setSlots] = useState([{ file: null, url: null, prep: false }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (i, patch) => setSlots((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const pick = async (i, file) => {
    if (!file) return;
    set(i, { prep: true });
    const blob = await shrink(file);
    set(i, { file: blob, url: URL.createObjectURL(blob), prep: false });
  };
  const add = () => setSlots((s) => (s.length < MAX ? [...s, { file: null, url: null, prep: false }] : s));
  const remove = (i) => setSlots((s) => s.filter((_, k) => k !== i));

  const ready = slots.filter((s) => s.file);
  const submit = async () => {
    setBusy(true); setErr("");
    let files = ready.map((s) => s.file);
    // Rarely, big photos still add up past the limit: squeeze them harder rather than fail.
    if (files.reduce((a, f) => a + f.size, 0) > LIMIT) files = await Promise.all(files.map((f) => shrink(f, 1200, 0.7)));
    if (files.reduce((a, f) => a + f.size, 0) > LIMIT) { setErr("These photos are too big together. Remove one and try again."); setBusy(false); return; }
    const fd = new FormData();
    files.forEach((f, k) => fd.append("photo" + (k + 1), f, `photo${k + 1}.jpg`));
    try { await api(endpoint, { method: "POST", form: fd }); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Sheet onClose={onClose}>
      <h2>Item {it.number}</h2>
      <p style={{ margin: "6px 0" }}><b>{it.title}</b>{it.points != null ? ` · ${it.points} points` : ""}</p>
      <p className="muted">{it.instructions || it.description || "Take a clear photo as proof. Add more if it helps."}</p>
      <div className={"slots n" + slots.length}>
        {slots.map((s, i) => (
          <div key={i} className="slot-wrap">
            <label className={"slot" + (s.url ? " filled" : "")}>
              <span className="lbl">Photo {i + 1}{i === 0 ? "" : " · optional"}</span>
              {s.prep ? <span style={{ padding: 8 }}>Preparing…</span>
                : s.url ? <><img src={s.url} alt={`Photo ${i + 1} preview`} /><span className="retake">Tap to retake</span></>
                : <span><Icon n="camera" size={30} className="cam" /><br />Add photo {i + 1}</span>}
              <input type="file" accept="image/*" onChange={(e) => pick(i, e.target.files[0])} />
            </label>
            {i > 0 ? <button type="button" className="slot-x" aria-label={`Remove photo ${i + 1}`} onClick={() => remove(i)}>×</button> : null}
          </div>
        ))}
      </div>
      {slots.length < MAX ? <button type="button" className="btn block ghost" style={{ marginBottom: 12 }} onClick={add}><Icon n="plus" size={18} />Add another photo <span className="muted" style={{ fontSize: 13 }}>({slots.length}/{MAX})</span></button> : null}
      {err ? <div className="err">{err}</div> : null}
      <Btn busy={busy} className="block" disabled={!slots[0].file || slots.some((s) => s.prep)} onClick={submit}>
        {ready.length > 1 ? `Submit ${ready.length} photos` : "Submit photo"}
      </Btn>
      <p className="muted" style={{ margin: "10px 0 0", textAlign: "center", fontSize: 13 }}>One photo is enough. You can retake or remove any photo before you submit.</p>
    </Sheet>
  );
}
