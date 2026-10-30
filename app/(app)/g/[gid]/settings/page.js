"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, shrink } from "../../../../../lib/client.js";
import { useApp } from "../../../../../components/Providers.js";
import { Async, Btn, ErrBox, useApi, useForm } from "../../../../../components/ui.js";

const TOGGLES = [["notify_new_challenge", "New challenge is live", ""], ["notify_submission", "New submission to review", "Sent to you"], ["notify_approved", "Submission approved", ""], ["notify_rejected", "Submission rejected", ""], ["notify_ending", "Challenge ending reminder", ""], ["notify_results", "Weekly results are ready", ""]];

export default function Page() {
  const { gid } = useParams();
  const { groups, refreshGroups, toast } = useApp();
  const g = groups?.find((x) => String(x.id) === gid);
  const st = useApi(`/groups/${gid}/settings`);
  const [s, setS] = useState(null);
  useEffect(() => { if (st.data) setS(st.data.settings); }, [st.data]);
  const save = async (patch) => {
    setS((o) => ({ ...o, ...patch }));
    try { await api(`/groups/${gid}/settings`, { method: "PUT", json: patch }); toast("Saved", "good"); } catch (e) { toast(e.message, "bad"); st.reload(); }
  };
  const edit = useForm(async (v) => { await api(`/groups/${gid}`, { method: "PUT", json: v }); await refreshGroups(); toast("Saved", "good"); });
  const image = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { const fd = new FormData(); fd.append("image", await shrink(f, 512), "g.jpg"); await api(`/groups/${gid}/image`, { method: "POST", form: fd }); await refreshGroups(); toast("Group image updated", "good"); } catch (err) { toast(err.message, "bad"); }
  };
  return (
    <Async st={st}>{(d) => (
      <>
        {g ? (
          <form className="card" onSubmit={edit.onSubmit} noValidate><h2>Group details</h2><ErrBox error={edit.error} />
            <div className="field" style={{ marginTop: 10 }}><label>Group name</label><input name="name" defaultValue={g.name} maxLength={60} required /></div>
            <div className="field"><label>Description</label><textarea name="description" defaultValue={g.description} maxLength={300} /></div>
            <div className="field"><label>Group image</label><input type="file" accept="image/*" onChange={image} /></div>
            <Btn busy={edit.busy} className="block" type="submit">Save group</Btn></form>
        ) : null}
        {s ? (
          <div className="card"><h2>Notifications</h2>
            {TOGGLES.map(([k, label, sub]) => <div key={k} className="sw"><div><b>{label}</b>{sub ? <div className="muted">{sub}</div> : null}</div><input type="checkbox" checked={!!s[k]} onChange={(e) => save({ [k]: e.target.checked })} /></div>)}
            <div className="sw"><div><b>Reminder time</b><div className="muted">Hours before the week closes</div></div><input type="number" min={1} max={72} defaultValue={s.reminder_hours} style={{ width: 90 }} onBlur={(e) => +e.target.value !== s.reminder_hours && save({ reminder_hours: +e.target.value })} /></div>
            <div className="sw"><div><b>Send emails too</b><div className="muted">{d.email_configured ? "Email delivery is set up." : "Email isn't set up yet, so only in-app alerts go out. See the README."}</div></div><input type="checkbox" checked={!!s.email_enabled} onChange={(e) => save({ email_enabled: e.target.checked })} /></div>
          </div>
        ) : null}
      </>
    )}</Async>
  );
}
