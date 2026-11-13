"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { CONSENT_ITEMS, RETAIN_DAYS } from "../lib/shared.js";
import { api, safeNext } from "../lib/client.js";
import { useApp } from "./Providers.js";
import { Brand } from "./Brand.js";
import { Btn, ErrBox } from "./ui.js";

/** The privacy acknowledgement: every statement is its own unticked box, and all are required. */
export function useConsent() {
  // One tick at the end confirms every statement listed above it (each one is still recorded on its own).
  const [agreed, setAgreed] = useState(false);
  const all = agreed;
  const consent = Object.fromEntries(CONSENT_ITEMS.map(([k]) => [k, agreed]));
  const view = (
    <fieldset className="consent">
      <legend>Privacy acknowledgement</legend>
      <p className="consent-sum">You're 18+, you play safely, your photos are seen by your hunt and deleted {RETAIN_DAYS} days after it ends, you join PRIMAHUNT OFFICIAL (leave any time), and your data is stored with our providers abroad. See the <Link className="link" href="/privacy" target="_blank">Privacy Policy</Link> and <Link className="link" href="/terms" target="_blank">Terms</Link>.</p>
      <details className="consent-more">
        <summary>Read all {CONSENT_ITEMS.length} statements</summary>
        <ul className="consent-list">
          {CONSENT_ITEMS.map(([k, label]) => (
            <li key={k}>{k === "policy" ? <>I have read and agree to the <Link className="link" href="/privacy" target="_blank">Privacy Policy</Link>.</>
              : k === "terms" ? <>I agree to the <Link className="link" href="/terms" target="_blank">Terms</Link>: I play at my own risk, I'll stay safe and within the law, I won't post or set anything dangerous or illegal, and PrimaHunt isn't responsible for what players or hunt admins do.</>
              : label}</li>
          ))}
        </ul>
      </details>
      <label className="consent-row consent-all">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
        <span><b>I agree to all {CONSENT_ITEMS.length} statements, the Privacy Policy and the Terms.</b></span>
      </label>
    </fieldset>
  );
  return { all, consent, view };
}

function Gate() {
  const { me, refreshMe, setMe } = useApp();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const c = useConsent();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const accept = async () => {
    setBusy(true); setErr("");
    try {
      await api("/me/consent", { method: "POST", json: { consent: c.consent } });
      await refreshMe();
      if (next) router.replace(next);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const logout = async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); setMe(null); router.push("/login"); };
  return (
    <main style={{ paddingTop: 24 }}>
      <div style={{ marginBottom: 14 }}><Brand /></div>
      <h1>Before you keep hunting</h1>
      <p className="muted">Hi {me?.nickname}. We've updated our Privacy Policy and added Terms covering safety: no dangerous or illegal items, and you play at your own risk. Please read them and tick the box to keep playing.</p>
      <div className="card"><ErrBox error={err} />{c.view}
        <Btn className="block" busy={busy} disabled={!c.all} onClick={accept}>Accept and continue</Btn></div>
      <p className="muted" style={{ textAlign: "center" }}>Don't agree? <button className="link" onClick={logout}>Log out</button>, or accept and delete your account from your profile.</p>
    </main>
  );
}
export default function ConsentGate() {
  return <Suspense fallback={null}><Gate /></Suspense>;
}
