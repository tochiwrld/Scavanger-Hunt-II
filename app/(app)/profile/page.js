"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../lib/client.js";
import { useApp } from "../../../components/Providers.js";
import { Btn, ErrBox, useForm } from "../../../components/ui.js";

export default function Page() {
  const { me, setMe, toast, refreshMe } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const nick = useForm(async (v) => { await api("/me", { method: "PUT", json: v }); setMe({ ...me, nickname: v.nickname }); toast("Saved", "good"); });
  const pw = useForm(async (v, f) => { await api("/me/password", { method: "POST", json: v }); toast("Password changed", "good"); f.reset(); });
  const logout = async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); setMe(null); router.push("/login"); };
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
        <div className="field" style={{ marginTop: 10 }}><label>Current password</label><input name="current" type="password" autoComplete="current-password" /></div>
        <div className="field"><label>New password</label><input name="password" type="password" autoComplete="new-password" /></div>
        <div className="field"><label>Confirm new password</label><input name="confirm" type="password" autoComplete="new-password" /></div>
        <Btn busy={pw.busy} className="block" type="submit">Change password</Btn>
      </form>
      <div className="card"><h3>Account</h3>
        <p className="muted">{me.can_create_groups ? "You can create and run hunts, and still play in others." : "You're a player. You can switch on admin tools any time."}</p>
        {me.can_create_groups ? null : <Btn busy={busy} className="block ghost" onClick={admin}>🛡️ Create an admin account</Btn>}
      </div>
      <button className="btn block bad" onClick={logout}>Log out</button>
    </>
  );
}
