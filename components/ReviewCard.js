"use client";
import { useState } from "react";
import { api, burst, cap, fmtDate, statusIcon, zoom } from "../lib/client.js";
import { useApp } from "./Providers.js";
import { Btn } from "./ui.js";

/** One submission with both photos and Approve / Reject (reason required). */
export default function ReviewCard({ s, gid, actions = true, onChanged }) {
  const { toast, refreshGroups } = useApp();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [gone, setGone] = useState(false);
  const done = () => { refreshGroups(); setGone(true); setTimeout(onChanged, 350); };
  const approve = async () => {
    setBusy(true);
    try { await api(`/groups/${gid}/submissions/${s.id}/approve`, { method: "POST" }); toast("✅ Approved. Points awarded.", "good"); burst(); done(); }
    catch (e) { toast(e.message, "bad"); setBusy(false); }
  };
  const reject = async () => {
    if (reason.trim().length < 3) return toast("Give the player a reason", "bad");
    setBusy(true);
    try { await api(`/groups/${gid}/submissions/${s.id}/reject`, { method: "POST", json: { reason } }); toast("Rejected. The player has been told."); done(); }
    catch (e) { toast(e.message, "bad"); setBusy(false); }
  };
  return (
    <article className={"card review" + (gone ? " gone" : "")}>
      <div className="row between wrap"><b>{s.nickname}</b><span className={`st ${s.status}`}>{statusIcon[s.status]} {cap(s.status)}</span></div>
      <div style={{ marginTop: 4 }}><b>{s.item_title}</b> · {s.points} pts</div>
      <div className="muted">{s.challenge_title} · {fmtDate(s.submitted_at)}</div>
      {s.instructions ? <p className="muted" style={{ margin: "6px 0 0" }}>{s.instructions}</p> : null}
      <div className="photos">
        <img loading="lazy" src={`/api/photo/${s.id}/1`} alt="Photo 1" onClick={(e) => zoom(e.currentTarget.src)} />
        <img loading="lazy" src={`/api/photo/${s.id}/2`} alt="Photo 2" onClick={(e) => zoom(e.currentTarget.src)} />
      </div>
      {s.status === "rejected" && s.rejection_reason ? <div className="reason"><b>Reason:</b> {s.rejection_reason}</div> : null}
      {(s.history || []).map((h, i) => <div key={i} className="hist">Earlier rejection: {h.reason}</div>)}
      {actions && s.status === "pending" ? (
        <>
          <div className="acts"><Btn busy={busy} className="ok" onClick={approve}>✅ Approve</Btn><button className="btn bad" disabled={busy} onClick={() => setRejecting((r) => !r)}>❌ Reject</button></div>
          {rejecting ? (
            <div className="stack" style={{ marginTop: 10 }}>
              <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it rejected? The player will see this." maxLength={300} />
              <Btn busy={busy} className="bad block" onClick={reject}>Send rejection</Btn>
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
