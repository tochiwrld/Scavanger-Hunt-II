"use client";
import { useState } from "react";
import { api, extOf, makeThumb, shrink } from "../lib/client.js";
import { useApp } from "./Providers.js";
import CameraCapture from "./CameraCapture.js";
import Icon from "./icons.js";
import { Btn, Sheet } from "./ui.js";

const MAX = 4;
const LIMIT = 3.8 * 1024 * 1024; // keep the whole upload under the server's 4 MB cap

/** Photo proof, camera only: one photo is enough; add up to four. Each is taken live in the app and stamped. Retake or remove before sending. */
export default function SubmitSheet({ gid, it, endpoint = `/groups/${gid}/items/${it?.id}/submit`, onClose, onDone }) {
  const [slots, setSlots] = useState([{ file: null, url: null, prep: false }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [shooting, setShooting] = useState(null); // index of the slot the camera is open for
  const { me } = useApp();
  const set = (i, patch) => setSlots((s) => s.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const shot = (i, blob) => {
    set(i, { file: blob, url: URL.createObjectURL(blob), prep: false });
    setShooting(null);
  };
  const add = () => setSlots((s) => (s.length < MAX ? [...s, { file: null, url: null, prep: false }] : s));
  const remove = (i) => setSlots((s) => s.filter((_, k) => k !== i));

  const ready = slots.filter((s) => s.file);
  const submit = async () => {
    setBusy(true); setErr("");
    let files = ready.map((s) => s.file);
    // Rarely, big photos still add up past the limit: squeeze them harder rather than fail.
    if (files.reduce((a, f) => a + f.size, 0) > LIMIT) files = await Promise.all(files.map((f) => shrink(f, 1080, 0.7)));
    if (files.reduce((a, f) => a + f.size, 0) > LIMIT) { setErr("These photos are too big together. Remove one and try again."); setBusy(false); return; }
    // Small copies for the feed/finds, so scrolling loads ~30 KB per photo instead of the full one.
    const thumbs = await Promise.all(files.map(makeThumb));
    const fd = new FormData();
    files.forEach((f, k) => fd.append("photo" + (k + 1), f, `photo${k + 1}.${extOf(f)}`));
    thumbs.forEach((t, k) => { if (t) fd.append("thumb" + (k + 1), t, `thumb${k + 1}.${extOf(t)}`); });
    try { await api(endpoint, { method: "POST", form: fd }); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <Sheet onClose={onClose}>
      <h2>Item {it.number}</h2>
      <p style={{ margin: "6px 0" }}><b>{it.title}</b>{it.points != null ? ` · ${it.points} points` : ""}</p>
      <p className="muted">{it.instructions || it.description || "Take a clear photo as proof with the camera. Add more if it helps."}</p>
      <div className={"slots n" + slots.length}>
        {slots.map((s, i) => (
          <div key={i} className="slot-wrap">
            <button type="button" className={"slot" + (s.url ? " filled" : "")} onClick={() => setShooting(i)} aria-label={s.url ? `Retake photo ${i + 1}` : `Take photo ${i + 1}`}>
              <span className="lbl">Photo {i + 1}</span>
              {s.prep ? <span style={{ padding: 8 }}>Preparing…</span>
                : s.url ? <><img src={s.url} alt={`Photo ${i + 1} preview`} /><span className="retake">Tap to retake</span></>
                : <span><Icon n="camera" size={30} className="cam" /><br />Take photo {i + 1}{i > 0 ? <><br /><span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>optional</span></> : null}</span>}
            </button>
            {i > 0 ? <button type="button" className="slot-x" aria-label={`Remove photo ${i + 1}`} onClick={() => remove(i)}>×</button> : null}
          </div>
        ))}
      </div>
      {slots.length < MAX ? <button type="button" className="btn block ghost" style={{ marginBottom: 12 }} onClick={add}><Icon n="plus" size={18} />Take another photo <span className="muted" style={{ fontSize: 13 }}>({slots.length}/{MAX})</span></button> : null}
      {err ? <div className="err">{err}</div> : null}
      <Btn busy={busy} className="block" disabled={!slots[0].file || slots.some((s) => s.prep)} onClick={submit}>
        {ready.length > 1 ? `Submit ${ready.length} photos` : "Submit photo"}
      </Btn>
      <p className="muted" style={{ margin: "10px 0 0", textAlign: "center", fontSize: 13 }}>Photos are taken live with your camera and stamped with your name and the time. One is enough; retake or remove any before you submit.</p>
      {shooting !== null ? <CameraCapture label={`${me?.nickname || "Player"} · ${it.title}`} onShot={(b) => shot(shooting, b)} onClose={() => setShooting(null)} /> : null}
    </Sheet>
  );
}
