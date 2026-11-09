"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { api, fmtDate } from "../../../../../lib/client.js";
import { useApp } from "../../../../../components/Providers.js";
import { Async, Btn, useApi } from "../../../../../components/ui.js";

export default function Page() {
  const { gid } = useParams();
  const { toast, groups } = useApp();
  const st = useApi(`/groups/${gid}/invite`);
  const [days, setDays] = useState("0");
  const [busy, setBusy] = useState("");
  const [to, setTo] = useState("");
  const g = groups?.find((x) => String(x.id) === gid);
  const act = async (name, fn) => { setBusy(name); try { await fn(); } catch (e) { toast(e.message, "bad"); } finally { setBusy(""); } };
  const copy = async (link) => { try { await navigator.clipboard.writeText(link); toast("Invite link copied 📋", "good"); } catch { window.prompt("Copy this link:", link); } };
  const share = async (link) => {
    if (navigator.share) { try { await navigator.share({ title: g?.name, text: `Join ${g?.name} on PrimaHunt`, url: link }); } catch {} } else copy(link);
  };
  return (
    <Async st={st}>{(d) => {
      const link = `${window.location.origin}/join/${d.token}`;
      const state = !d.active ? "Disabled" : !d.valid ? "Expired" : "Active";
      return (
        <>
          <div className="card stack"><h2>Invite players</h2><p className="muted">Share this link with your players:</p>
            <div className="card flat" style={{ wordBreak: "break-all", fontWeight: 700 }}>{link}</div>
            <span className={`st ${state === "Active" ? "approved" : "rejected"}`}>{state}{d.expires_at && state === "Active" ? " · expires " + fmtDate(d.expires_at) : ""}</span>
            <button className="btn block" onClick={() => copy(link)}>📋 Copy invite link</button>
            <button className="btn block ghost" onClick={() => share(link)}>📤 Share</button></div>
          {state === "Active" ? (
            <form className="card stack" onSubmit={(e) => { e.preventDefault(); act("mail", async () => { await api(`/groups/${gid}/invite/email`, { method: "POST", json: { email: to } }); toast(`Invite sent to ${to}`, "good"); setTo(""); }); }}>
              <h3>Invite by email</h3><p className="muted">Pip sends them your invite link. We use the address for this one email and don't keep it.</p>
              <input type="email" aria-label="Their email" placeholder="friend@example.com" value={to} onChange={(e) => setTo(e.target.value)} required autoComplete="off" />
              <Btn busy={busy === "mail"} className="block" type="submit">✉️ Send invite</Btn>
            </form>
          ) : null}
          <div className="card stack"><h3>Replace this link</h3><p className="muted">Making a new link switches off the old one immediately. Existing players aren't affected.</p>
            <select aria-label="Link expiry" value={days} onChange={(e) => setDays(e.target.value)}><option value="0">Never expires</option><option value="7">Expires in 7 days</option><option value="30">Expires in 30 days</option></select>
            <Btn busy={busy === "regen"} className="block ghost" onClick={() => confirm("This switches off the old link. Continue?") && act("regen", async () => { await api(`/groups/${gid}/invite/regenerate`, { method: "POST", json: { expires_days: +days } }); toast("New invite link ready", "good"); st.reload(); })}>🔄 Generate a new link</Btn>
            {d.active ? <Btn busy={busy === "dis"} className="block bad" onClick={() => confirm("Disable the invite link? No one new can join until you generate a new one.") && act("dis", async () => { await api(`/groups/${gid}/invite/disable`, { method: "POST" }); toast("Invite link disabled"); st.reload(); })}>Disable invite link</Btn> : null}</div>
        </>
      );
    }}</Async>
  );
}
