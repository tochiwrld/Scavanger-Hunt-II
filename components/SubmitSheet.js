"use client";
import { useRef, useState } from "react";
import { api, shrink } from "../lib/client.js";
import { Btn, Sheet } from "./ui.js";

/** Two-photo submission: take/upload, preview, replace either, submit together. */
export default function SubmitSheet({ gid, it, endpoint = `/groups/${gid}/items/${it.id}/submit`, onClose, onDone }) {
  const [files, setFiles] = useState([null, null]);
  const [urls, setUrls] = useState([null, null]);
  const [prep, setPrep] = useState([false, false]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const inputs = [useRef(null), useRef(null)];

  const pick = async (i, file) => {
    if (!file) return;
    setPrep((p) => p.map((x, k) => (k === i ? true : x)));
    const blob = await shrink(file);
    setFiles((f) => f.map((x, k) => (k === i ? blob : x)));
    setUrls((u) => u.map((x, k) => (k === i ? URL.createObjectURL(blob) : x)));
    setPrep((p) => p.map((x, k) => (k === i ? false : x)));
  };
  const submit = async () => {
    setBusy(true); setErr("");
    const fd = new FormData();
    fd.append("photo1", files[0], "photo1.jpg");
    fd.append("photo2", files[1], "photo2.jpg");
    try { await api(endpoint, { method: "POST", form: fd }); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Sheet onClose={onClose}>
      <h2>Item {it.number}</h2>
      <p style={{ margin: "6px 0" }}><b>{it.title}</b>{it.points != null ? ` · ${it.points} points` : ""}</p>
      <p className="muted">{it.instructions || it.description || "Take two clear photos as proof."}</p>
      <div className="slots">
        {[0, 1].map((i) => (
          <label key={i} className={"slot" + (urls[i] ? " filled" : "")}>
            <span className="lbl">Photo {i + 1}</span>
            {prep[i] ? <span style={{ padding: 8 }}>Preparing…</span> : urls[i] ? <><img src={urls[i]} alt={`Photo ${i + 1} preview`} /><span className="retake">Tap to retake</span></> : <span><span className="cam">📷</span>Add photo {i + 1}</span>}
            <input ref={inputs[i]} type="file" accept="image/*" onChange={(e) => pick(i, e.target.files[0])} />
          </label>
        ))}
      </div>
      {err ? <div className="err">{err}</div> : null}
      <Btn busy={busy} className="block" disabled={!(files[0] && files[1])} onClick={submit}>Submit both photos</Btn>
      <p className="muted" style={{ margin: "10px 0 0", textAlign: "center" }}>You can retake either photo before you submit.</p>
    </Sheet>
  );
}
