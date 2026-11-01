"use client";
import { useState } from "react";
import { api, burst, fmtDate, zoom } from "../lib/client.js";
import { useApp } from "./Providers.js";
import { Btn, Photos, StatusPill } from "./ui.js";
import Icon from "./icons.js";

/** One submission with its photos (1-4) and Approve / Reject (reason required). */
export default function ReviewCard({ s, gid, base = `/groups/${gid}`, photoBase = "/api/photo", actions = true, onChanged }) {
  const { toast, refreshGroups } = useApp();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [gone, setGone] = useState(false);
  const done = () => { refreshGroups(); setGone(true); setTimeout(onChanged, 350); };
  const approve = async () => {
    setBusy(true);
    try { await api(`${base}/submissions/${s.id}/approve`, { method: "POST" }); toast(s.points != null ? "Approved. Points awarded." : "Approved.", "good"); burst(); done(); }
    catch (e) { toast(e.message, "bad"); setBusy(false); }
  };
  const reject = async () => {
    if (reason.trim().length < 3) return toast("Give the player a reason", "bad");
    setBusy(true);
    try { await api(`${base}/submissions/${s.id}/reject`, { method: "POST", json: { reason } }); toast("Rejected. The player has been told."); done(); }
    catch (e) { toast(e.message, "bad"); setBusy(false); }
  };
  return (
    <article className={"card review" + (gone ? " gone" : "")}>
      <div className="row between wrap"><span className="lb" style={{ display: "contents" }}><span className="nm" style={{ font: "800 19px/1.1 var(--font-head)", textTransform: "uppercase", letterSpacing: "-.02em" }}>{s.nickname}</span></span><StatusPill status={s.status} /></div>
      <h3 style={{ margin: "12px 0 8px", fontSize: 18, textTransform: "none", letterSpacing: "-.02em" }}>{s.item_title}</h3>
      <div className="row wrap" style={{ gap: 8 }}>{s.points != null ? <span className="pts">{s.points} PTS</span> : null}<span className="muted">{s.challenge_title ? `${s.challenge_title} · ` : ""}{fmtDate(s.submitted_at)}</span></div>
      {s.instructions ? <p className="muted" style={{ margin: "10px 0 0" }}>{s.instructions}</p> : null}
      <Photos base={photoBase} id={s.id} count={s.photos} who={s.nickname} />
      {s.status === "rejected" && s.rejection_reason ? <div className="reason"><b>Reason:</b> {s.rejection_reason}</div> : null}
      {(s.history || []).map((h, i) => <div key={i} className="hist">Earlier rejection: {h.reason}</div>)}
      {actions && s.status === "pending" ? (
        <>
          <div className="acts"><Btn busy={busy} className="ok" onClick={approve}><Icon n="check" size={18} />Approve</Btn><button className="btn ghost" disabled={busy} onClick={() => setRejecting((r) => !r)}><Icon n="x" size={18} />Reject</button></div>
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
