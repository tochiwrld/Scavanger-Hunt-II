"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../lib/client.js";
import { useApp } from "../../../components/Providers.js";
import Link from "next/link";
import { Btn, ErrBox, PasswordInput, useForm } from "../../../components/ui.js";
import Icon from "../../../components/icons.js";
import { RETAIN_DAYS } from "../../../lib/shared.js";

export default function Page() {
  const { me, setMe, toast, refreshMe } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const nick = useForm(async (v) => { await api("/me", { method: "PUT", json: v }); setMe({ ...me, nickname: v.nickname }); toast("Saved", "good"); });
  const pw = useForm(async (v, f) => { await api("/me/password", { method: "POST", json: v }); toast("Password changed", "good"); f.reset(); });
  const logout = async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); setMe(null); router.push("/login"); };
  const [delOpen, setDelOpen] = useState(false);
  const del = useForm(async (v) => {
    await api("/me", { method: "DELETE", json: v });
    setMe(null);
    router.replace("/login?deleted=1");
  });
  const exportData = async () => {
    try {
      const r = await fetch("/api/me/export", { credentials: "same-origin" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || "Couldn't prepare your data");
      const url = URL.createObjectURL(await r.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: "hunt-week-my-data.json" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { toast(e.message, "bad"); }
  };
  const [rem, setRem] = useState(me.email_reminders !== false);
  const toggleRem = async (on) => {
    setRem(on);
    try { await api("/me/reminders", { method: "PUT", json: { on } }); setMe({ ...me, email_reminders: on }); toast(on ? "Reminder emails on" : "Reminder emails off", "good"); } catch (e) { setRem(!on); toast(e.message, "bad"); }
  };
  const admin = async () => { setBusy(true); try { await api("/me/become-admin", { method: "POST" }); await refreshMe(); toast("Admin tools are on", "good"); } finally { setBusy(false); } };
  return (
    <>
      <h1>Profile</h1>
      <form className="card" onSubmit={nick.onSubmit} noValidate>
        <h3>Nickname</h3><ErrBox error={nick.error} />
        <div className="field" style={{ marginTop: 10 }}><input name="nickname" defaultValue={me.nickname} maxLength={20} /></div>
        <Btn busy={nick.busy} className="block" type="submit">Save nickname</Btn>
      </form>
      <form className="card" onSubmit={pw.onSubmit} noValidate>
        <h3>Change password</h3><ErrBox error={pw.error} />
        <div className="field" style={{ marginTop: 10 }}><label>Current password</label><PasswordInput name="current" autoComplete="current-password" /></div>
        <div className="field"><label>New password</label><PasswordInput name="password" autoComplete="new-password" /></div>
        <div className="field"><label>Confirm new password</label><PasswordInput name="confirm" autoComplete="new-password" /></div>
        <Btn busy={pw.busy} className="block" type="submit">Change password</Btn>
      </form>
      <div className="card"><h3>Account</h3>
        <p className="muted">{me.can_create_groups ? "You can create and run hunts, and still play in others." : "You're a player. You can switch on admin tools any time."}</p>
        {me.can_create_groups ? null : <Btn busy={busy} className="block ghost" onClick={admin}>🛡️ Create an admin account</Btn>}
      </div>
      <div className="card"><h3>Emails</h3>
        <div className="sw"><div><b>Reminder emails</b><div className="muted">"NO FORGET YOUR HUNT O!": a nudge when you're in a live hunt and haven't opened PrimaHunt for a few days, or after a couple of weeks away.</div></div>
          <input type="checkbox" checked={rem} onChange={(e) => toggleRem(e.target.checked)} aria-label="Reminder emails" /></div>
      </div>
      <div className="card"><h3>Your data</h3>
        <p className="muted">Photos, submissions, comments and 1v1 lists are deleted automatically {RETAIN_DAYS} days after each hunt ends. Only score cards are kept. <Link className="link" href="/privacy">Privacy Policy</Link></p>
        <button className="btn block ghost" onClick={exportData}><Icon n="download" size={18} />Download my data</button>
      </div>
      <button className="btn block ghost" onClick={logout}>Log out</button>
      <div className="card danger-zone" style={{ marginTop: 16 }}><h3 className="c-bad">Delete my account</h3>
        {!delOpen ? (
          <>
            <p className="muted">Permanently deletes your account, photos, submissions, comments, scores and 1v1s. {me.can_create_groups ? "Any hunts you run are deleted too, for everyone in them. " : ""}This can't be undone.</p>
            <button className="btn block bad" onClick={() => setDelOpen(true)}>Delete my account…</button>
          </>
        ) : (
          <form onSubmit={del.onSubmit} noValidate>
            <ErrBox error={del.error} />
            <ul className="muted" style={{ paddingLeft: 18, margin: "6px 0 14px" }}>
              <li>Your account, email and password are erased.</li>
              <li>Your photos are deleted from storage, and your submissions, comments, points and results are removed from every hunt.</li>
              <li>Hunts you run are deleted for all their players. Their members get a short notice.</li>
              <li>1v1s you played are deleted for both players.</li>
            </ul>
            <div className="field"><label>Your password</label><PasswordInput name="password" autoComplete="current-password" required /></div>
            <div className="field"><label>Type DELETE to confirm</label><input name="confirm" autoComplete="off" autoCapitalize="characters" placeholder="DELETE" required /></div>
            <Btn busy={del.busy} className="block bad" type="submit">Delete my account forever</Btn>
            <button type="button" className="btn block ghost" style={{ marginTop: 8 }} onClick={() => setDelOpen(false)}>Cancel</button>
          </form>
        )}
      </div>
    </>
  );
}
