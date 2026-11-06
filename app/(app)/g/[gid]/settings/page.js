"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, shrink } from "../../../../../lib/client.js";
import { useApp } from "../../../../../components/Providers.js";
import { Async, Btn, ErrBox, useApi, useForm } from "../../../../../components/ui.js";

const TOGGLES = [["notify_new_challenge", "New challenge is live", ""], ["notify_submission", "New submission to review", "Sent to you"], ["notify_approved", "Submission approved", ""], ["notify_rejected", "Submission rejected", ""], ["notify_ending", "Challenge ending reminder", ""], ["notify_results", "Weekly results are ready", ""]];

const norm = (v) => String(v || "").trim().replace(/\s+/g, " ").toLowerCase();

export default function Page() {
  const { gid } = useParams();
  const { groups, refreshGroups, toast } = useApp();
  const g = groups?.find((x) => String(x.id) === gid);
  const st = useApi(`/groups/${gid}/settings`);
  const [s, setS] = useState(null);
  const [pub, setPub] = useState(false);
  useEffect(() => { if (st.data) { setS(st.data.settings); setPub(Boolean(st.data.is_public)); } }, [st.data]);
  const setPublic = async (on) => {
    setPub(on);
    try { await api(`/groups/${gid}/public`, { method: "PUT", json: { is_public: on } }); toast(on ? "Listed in Global Hunt" : "Removed from Global Hunt", "good"); } catch (e) { toast(e.message, "bad"); st.reload(); }
  };
  const save = async (patch) => {
    setS((o) => ({ ...o, ...patch }));
    try { await api(`/groups/${gid}/settings`, { method: "PUT", json: patch }); toast("Saved", "good"); } catch (e) { toast(e.message, "bad"); st.reload(); }
  };
  const edit = useForm(async (v) => { await api(`/groups/${gid}`, { method: "PUT", json: v }); await refreshGroups(); toast("Saved", "good"); });
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/groups/${gid}`, { method: "DELETE", json: { confirm } });
      await refreshGroups();
      toast("Hunt deleted", "good");
      router.replace("/");
    } catch (e) { toast(e.message, "bad"); setDeleting(false); }
  };
  const image = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try { const fd = new FormData(); fd.append("image", await shrink(f, 512), "g.jpg"); await api(`/groups/${gid}/image`, { method: "POST", form: fd }); await refreshGroups(); toast("Hunt image updated", "good"); } catch (err) { toast(err.message, "bad"); }
  };
  return (
    <Async st={st}>{(d) => (
      <>
        {g ? (
          <form className="card" onSubmit={edit.onSubmit} noValidate><h2>Hunt details</h2><ErrBox error={edit.error} />
            <div className="field" style={{ marginTop: 10 }}><label>Hunt name</label><input aria-label="Hunt name" name="name" defaultValue={g.name} maxLength={60} required /></div>
            <div className="field"><label>Description</label><textarea aria-label="Description" name="description" defaultValue={g.description} maxLength={300} /></div>
            <div className="field"><label>Hunt image</label><input aria-label="Hunt image" type="file" accept="image/*" onChange={image} /></div>
            <Btn busy={edit.busy} className="block" type="submit">Save hunt</Btn></form>
        ) : null}
        <div className="card"><h2 style={{ marginBottom: 6 }}>Global Hunt</h2>
          <div className="sw"><div><b>List this hunt in Global Hunt</b><div className="muted">Anyone can find it on the home page and join without an invite. Points earned here count toward the global ranking.</div></div>
            <input type="checkbox" aria-label="List this hunt publicly" checked={pub} onChange={(e) => setPublic(e.target.checked)} /></div>
        </div>
        {s ? (
          <div className="card"><h2>Notifications</h2>
            {TOGGLES.map(([k, label, sub]) => <div key={k} className="sw"><div><b>{label}</b>{sub ? <div className="muted">{sub}</div> : null}</div><input type="checkbox" aria-label={label} checked={!!s[k]} onChange={(e) => save({ [k]: e.target.checked })} /></div>)}
            <div className="sw"><div><b>Reminder time</b><div className="muted">Hours before the week closes</div></div><input type="number" aria-label="Reminder hours before the end" min={1} max={72} defaultValue={s.reminder_hours} style={{ width: 90 }} onBlur={(e) => +e.target.value !== s.reminder_hours && save({ reminder_hours: +e.target.value })} /></div>
            <div className="sw"><div><b>Send emails too</b><div className="muted">{d.email_configured ? "Email delivery is set up." : "Email isn't set up yet, so only in-app alerts go out. See the README."}</div></div><input type="checkbox" aria-label="Email notifications" checked={!!s.email_enabled} onChange={(e) => save({ email_enabled: e.target.checked })} /></div>
          </div>
        ) : null}
        {g?.founder ? (
          <div className="card danger-zone"><h2 className="c-bad">Delete this hunt</h2>
            <p className="muted" style={{ margin: "6px 0 12px" }}>This permanently deletes the hunt for everyone: all its challenges, submissions and photos, the feed, leaderboards, prize records and members. It can't be undone.</p>
            <div className="field"><label htmlFor="del-confirm">Type the hunt's name to confirm</label>
              <div className="muted" style={{ margin: "2px 0 8px" }}>Its name is <b className="as-typed">{g.name}</b> (capitals don't matter).</div>
              <input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder={g.name} /></div>
            <Btn className="bad block" busy={deleting} disabled={norm(confirm) !== norm(g.name)} onClick={remove}>Delete hunt forever</Btn>
          </div>
        ) : null}
      </>
    )}</Async>
  );
}
