"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../lib/client.js";
import { useApp } from "../../../components/Providers.js";
import Link from "next/link";
import { Btn, ErrBox, NewPasswordFields, PasswordInput, useForm } from "../../../components/ui.js";
import Icon from "../../../components/icons.js";
import { RETAIN_DAYS } from "../../../lib/shared.js";
import BecomeAdmin from "../../../components/BecomeAdmin.js";
import { AlertsToggle } from "../../../components/StarsCard.js";

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
    try { await api("/me/reminders", { method: "PUT", json: { on } }); setMe({ ...me, email_reminders: on }); toast(on ? "Game emails on" : "Game emails off", "good"); } catch (e) { setRem(!on); toast(e.message, "bad"); }
  };
  const [ask, setAsk] = useState(false);
  const stopAdmin = async () => {
    setBusy(true);
    try { await api("/me/stop-admin", { method: "POST" }); setMe({ ...me, can_create_groups: false }); toast("Admin tools are off", "good"); } catch (e) { toast(e.message, "bad"); } finally { setBusy(false); }
  };
  return (
    <>
      <h1>Profile</h1>
      <Link href="/daily" className="card streak-card" style={{ display: "flex" }}>
        <span className="flame" aria-hidden="true">🔥</span>
        <div className="grow">
          <div className="eyebrow">Daily hunt streak</div>
          <div style={{ font: "800 26px/1.1 var(--font-head)", marginTop: 4 }}>{me.streak?.current || 0} day{(me.streak?.current || 0) === 1 ? "" : "s"}</div>
          <div className="muted" style={{ fontSize: 14 }}>Best {me.streak?.best || 0} · {me.streak?.total || 0} found{me.streak?.done_today ? " · today ✅" : " · today's item is waiting"}</div>
        </div>
        <Icon n="arrow" size={18} />
      </Link>
      <Link href="/stars" className="card streak-card" style={{ display: "flex" }}>
        <span className="flame" aria-hidden="true">⭐</span>
        <div className="grow">
          <div className="eyebrow">Star hunt</div>
          <div style={{ font: "800 26px/1.1 var(--font-head)", marginTop: 4 }}>{me.stars?.caught || 0} star{(me.stars?.caught || 0) === 1 ? "" : "s"}</div>
          <div className="muted" style={{ fontSize: 14 }}>{me.stars?.pips || 0} star pips · stars are on the Lagos map</div>
        </div>
        <Icon n="arrow" size={18} />
      </Link>
      {me.hunter ? (
        <div className="card hunter-badge" role="status">
          <span className="medal" aria-hidden="true">🏅</span>
          <div>
            <div className="eyebrow">{me.hunter.current ? "Hunter of the week" : "Former Hunter of the week"}</div>
            <div style={{ font: "800 20px/1.15 var(--font-head)", textTransform: "uppercase", letterSpacing: "-.02em", marginTop: 4 }}>{me.nickname}</div>
            <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>
              PRIMAHUNT OFFICIAL winner{me.hunter.weeks.length > 1 ? ` ${me.hunter.weeks.length} times` : ""}{me.hunter.weeks.filter(Boolean).length ? ` · Week${me.hunter.weeks.length > 1 ? "s" : ""} ${me.hunter.weeks.filter(Boolean).sort((a, b) => a - b).join(", ")}` : ""}
            </div>
          </div>
        </div>
      ) : null}
      <form className="card" onSubmit={nick.onSubmit} noValidate>
        <h3>Nickname</h3><ErrBox error={nick.error} />
        <div className="field" style={{ marginTop: 10 }}><input name="nickname" defaultValue={me.nickname} maxLength={20} aria-label="Nickname" /></div>
        <Btn busy={nick.busy} className="block" type="submit">Save nickname</Btn>
      </form>
      <form className="card" onSubmit={pw.onSubmit} noValidate>
        <h3>Change password</h3><ErrBox error={pw.error} />
        <div className="field" style={{ marginTop: 10 }}><label htmlFor="pw-current">Current password</label><PasswordInput id="pw-current" name="current" autoComplete="current-password" /></div>
        <NewPasswordFields label="New password" confirmLabel="Confirm new password" idPrefix="chg" />
        <Btn busy={pw.busy} className="block" type="submit">Change password</Btn>
      </form>
      <div className="card"><h3>Account</h3>
        <p className="muted">{me.can_create_groups ? "You can create and run hunts, and still play in others." : "You're a player. You can switch on admin tools any time."}</p>
        {me.can_create_groups
          ? <Btn busy={busy} className="block ghost" onClick={stopAdmin}>Switch admin tools off</Btn>
          : <Btn className="block ghost" onClick={() => setAsk(true)}>🛡️ Turn on admin tools</Btn>}
        {ask ? <BecomeAdmin onClose={() => setAsk(false)} onDone={() => { setAsk(false); toast("Admin tools are on", "good"); }} /> : null}
      </div>
      <div className="card"><h3>Emails and alerts</h3>
        <div className="sw"><div><b>Game emails</b></div>
          <input type="checkbox" checked={rem} onChange={(e) => toggleRem(e.target.checked)} aria-label="Game emails" /></div>
        <AlertsToggle />
      </div>
      <div className="card"><h3>Your data</h3>
        <p className="muted">Photos, submissions, comments and 1v1 lists are deleted automatically {RETAIN_DAYS} days after each hunt ends. Only score cards are kept. <Link className="link" href="/privacy">Privacy Policy</Link></p>
        <button className="btn block ghost" onClick={exportData}><Icon n="download" size={18} />Download my data</button>
      </div>
      <button className="btn block ghost" onClick={logout}>Log out</button>
      <div className="card danger-zone" style={{ marginTop: 16 }}><h3 className="c-bad">Delete my account</h3>
        {!delOpen ? (
          <>
            <p className="muted">Permanently erases your account, email, photos, submissions and comments. Other players keep their results: you'll show as "Deleted player" on past leaderboards. This can't be undone.</p>
            <button className="btn block bad" onClick={() => setDelOpen(true)}>Delete my account…</button>
          </>
        ) : (
          <form onSubmit={del.onSubmit} noValidate>
            <ErrBox error={del.error} />
            <ul className="muted" style={{ paddingLeft: 18, margin: "6px 0 14px" }}>
              <li>Your email, password and nickname are erased, and you can't log in again.</li>
              <li>All your photos, submissions and comments are deleted.</li>
              <li>Past leaderboards, results and prizes stay as they are for everyone else, with you shown as "Deleted player".</li>
              <li>Hunts you run pass to your co-admin. Without a co-admin, the hunt stays readable for its players but closes to new finds.</li>
              <li>A 1v1 you're playing right now is forfeited to your opponent. Finished 1v1s keep their result.</li>
            </ul>
            <div className="field"><label htmlFor="del-pw">Your password</label><PasswordInput id="del-pw" name="password" autoComplete="current-password" required /></div>
            <div className="field"><label htmlFor="del-word">Type DELETE to confirm</label><input id="del-word" name="confirm" autoComplete="off" autoCapitalize="characters" placeholder="DELETE" required /></div>
            <Btn busy={del.busy} className="block bad" type="submit">Delete my account forever</Btn>
            <button type="button" className="btn block ghost" style={{ marginTop: 8 }} onClick={() => setDelOpen(false)}>Cancel</button>
          </form>
        )}
      </div>
    </>
  );
}
