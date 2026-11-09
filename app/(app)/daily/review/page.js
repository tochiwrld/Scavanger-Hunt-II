"use client";
import { useState } from "react";
import { api, burst, fmtDate } from "../../../../lib/client.js";
import { useApp } from "../../../../components/Providers.js";
import Icon from "../../../../components/icons.js";
import { Async, Btn, Empty, Photos, useApi } from "../../../../components/ui.js";

/** PrimaHunt admin: approve or reject daily hunt finds. Photos are deleted as soon as a find is judged. */
function DailyReviewCard({ f, onDone }) {
  const { toast, refreshMe } = useApp();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [gone, setGone] = useState(false);
  const done = () => { refreshMe(); setGone(true); setTimeout(onDone, 200); };
  const approve = async () => {
    setBusy(true);
    try { await api(`/daily/review/${f.id}/approve`, { method: "POST" }); toast(`Approved. ${f.nickname}'s streak counts.`, "good"); burst(); done(); }
    catch (e) { toast(e.message, "bad"); setBusy(false); }
  };
  const reject = async () => {
    if (reason.trim().length < 3) return toast("Give the player a reason", "bad");
    setBusy(true);
    try { await api(`/daily/review/${f.id}/reject`, { method: "POST", json: { reason } }); toast("Rejected. The player has been told."); done(); }
    catch (e) { toast(e.message, "bad"); setBusy(false); }
  };
  return (
    <article className={"card review" + (gone ? " gone" : "")}>
      <div className="row between wrap"><span style={{ font: "800 19px/1.1 var(--font-head)", textTransform: "uppercase", letterSpacing: "-.02em" }}>{f.nickname}</span><span className="st pending">Pending</span></div>
      <h3 style={{ margin: "12px 0 8px", fontSize: 18, textTransform: "none", letterSpacing: "-.02em" }}>{f.item}</h3>
      <div className="muted">Day of {new Date(f.day + "T12:00:00+01:00").toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })} · sent {fmtDate(f.created_at)}</div>
      <Photos base="/api/daily-photo" id={f.id} count={f.photos} who={f.nickname} thumb={false} />
      <div className="acts"><Btn busy={busy} className="ok" onClick={approve}><Icon n="check" size={18} />Approve</Btn><button className="btn ghost" disabled={busy} onClick={() => setRejecting((r) => !r)}><Icon n="x" size={18} />Reject</button></div>
      {rejecting ? (
        <div className="stack" style={{ marginTop: 10 }}>
          <textarea aria-label="Reason for rejecting" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it rejected? The player will see this." maxLength={200} />
          <Btn busy={busy} className="bad block" onClick={reject}>Send rejection</Btn>
        </div>
      ) : null}
    </article>
  );
}

export default function Page() {
  const st = useApi("/daily/review", { poll: 60000 });
  return (
    <Async st={st}>{(d) => (
      <>
        <div className="page-head"><h1>Daily finds</h1><p>Approve a find and that day counts toward the player's streak. Photos are deleted the moment you decide.</p></div>
        {d.pending.length ? d.pending.map((f) => <DailyReviewCard key={f.id} f={f} onDone={st.reload} />)
          : <Empty icon="✅" title="All caught up" text={d.reviewed_today ? `You reviewed ${d.reviewed_today} find${d.reviewed_today === 1 ? "" : "s"} in the last 24 hours.` : "New daily finds will show up here."} />}
      </>
    )}</Async>
  );
}
