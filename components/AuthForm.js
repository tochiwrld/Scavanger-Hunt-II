"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, safeNext } from "../lib/client.js";
import { useApp } from "./Providers.js";
import { Brand, ThemeToggle } from "./Brand.js";
import Icon from "./icons.js";
import { Btn, ErrBox, NewPasswordFields, PasswordInput, useForm } from "./ui.js";
import { useConsent } from "./Consent.js";
import { RETAIN_DAYS, WEEK_END_RULE } from "../lib/shared.js";
import ActiveHunts from "./ActiveHunts.js";

export const HERO_IMG = "https://iwljafkilkizabmgczjn.supabase.co/storage/v1/object/public/site/hero.jpg";

/** Accepts a full invite link or just the code, and opens the join page. */
function InviteBox() {
  const router = useRouter();
  const [v, setV] = useState("");
  const go = (e) => {
    e.preventDefault();
    const t = v.trim().replace(/\/+$/, "").split("/").pop();
    if (t) router.push("/join/" + encodeURIComponent(t));
  };
  return (
    <form className="glass" onSubmit={go}>
      <label htmlFor="invite"><Icon n="key" size={16} />Got an invite code?</label>
      <div className="join-row">
        <input id="invite" value={v} onChange={(e) => setV(e.target.value)} placeholder="Invite code" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <button className="btn" type="submit" disabled={!v.trim()}>Join<Icon n="arrow" size={17} /></button>
      </div>
      <p className="hint">Friends' hunts are invite-only: ask the hunt admin for the link. Every account also joins PRIMAHUNT OFFICIAL, our public hunt, which you can leave any time.</p>
    </form>
  );
}

const STEPS = [
  ["hunt", "A new list every Monday", "Your admin drops a fresh list of real-world items at 12:00 AM Lagos time. Each one has its own pip value."],
  ["camera", "Find it, snap it", "Spot an item out in the world and send a photo as proof, straight from your phone camera. Add up to four if one shot doesn't tell the whole story."],
  ["check", "Get approved, earn pips", "Every submission is reviewed by hand. Approved items add pips to your weekly score."],
  ["trophy", "Top the board by Sunday", WEEK_END_RULE],
];

function Inner({ mode: startMode }) {
  // Switching between Log in and Create account happens in place (no page change), so the page never jumps back to the top.
  const [mode, setMode] = useState(startMode);
  const router = useRouter();
  const sp = useSearchParams();
  const next = safeNext(sp.get("next"));
  const deleted = sp.get("deleted") === "1";
  const { refreshMe } = useApp();
  const consent = useConsent();
  const form = useForm(async (v) => {
    await api(mode === "login" ? "/auth/login" : "/auth/register", { method: "POST", json: mode === "login" ? v : { ...v, consent: consent.consent } });
    await refreshMe();
    router.push(next || (mode === "register" ? "/start" : "/"));
  });
  // The header button takes you down to the form instead of leaving you at the top of the page.
  const q = next ? "?next=" + encodeURIComponent(next) : "";
  const switchTo = (m, toForm) => (e) => {
    e.preventDefault();
    if (m !== mode) { setMode(m); try { window.history.replaceState(null, "", "/" + m + q); } catch {} }
    if (toForm) document.getElementById("account")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const invited = next && next.startsWith("/join/");
  const challenged = next && next.startsWith("/vs/");
  return (
    <div className="landing">
      <section className="hero-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bg" src={HERO_IMG} alt="" fetchPriority="high" />
        <div className="hero-top">
          <Brand href="/login" />
          <div className="acts"><ThemeToggle />{mode === "login" ? <Link className="pill-btn" href={"/register" + q} onClick={switchTo("register", true)}>Sign up</Link> : <Link className="pill-btn" href={"/login" + q} onClick={switchTo("login", true)}>Log in</Link>}</div>
        </div>
        <div className="inner">
          <div className="row wrap" style={{ gap: 10 }}><span className="kicker">The weekly scavenger hunt</span><ActiveHunts hero /></div>
          <h1 className="headline">Hunt it.<br />Snap <em>it.</em><br />Win the week.</h1>
          <p className="lede">Your city is the game board. Race your crew to the wildest finds, snap the proof, and watch the leaderboard flip in real time. A fresh list drops every Monday — and by Sunday, someone owns the bragging rights.</p>
          {invited || challenged ? null : <InviteBox />}
          <div className="closes"><div className="label" style={{ color: "oklch(85% .015 275)" }}>Free to play</div><div className="v">No entry fees, ever. Just friends, phones and bragging rights.</div></div>
        </div>
      </section>

      <div className="auth-body">
        <section className="card" id="account">
          {deleted ? <div className="card mist flat" style={{ marginBottom: 16 }}>Your account and its data have been deleted.</div> : null}
          {invited ? <div className="card mist flat" style={{ marginBottom: 16 }}>You've been invited to a hunt. {mode === "login" ? "Log in" : "Create an account"} to join it.</div> : null}
          {challenged ? <div className="card mist flat" style={{ marginBottom: 16 }}>You've been challenged to a 1v1. {mode === "login" ? "Log in" : "Create an account"} to accept it.</div> : null}
          <div className="tabs" style={{ marginBottom: 18 }}>
            <Link className={"tab" + (mode === "login" ? " on" : "")} href={"/login" + q} onClick={switchTo("login")}>Log in</Link>
            <Link className={"tab" + (mode === "register" ? " on" : "")} href={"/register" + q} onClick={switchTo("register")}>Create account</Link>
          </div>
          <form onSubmit={form.onSubmit} noValidate>
            <ErrBox error={form.error} />
            {mode === "register" ? <div className="field"><label htmlFor="nickname">Nickname</label><input id="nickname" name="nickname" autoComplete="nickname" maxLength={20} required /><div className="muted">The only thing other players see. Your email stays private.</div></div> : null}
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" required /></div>
            {mode === "login"
              ? <div className="field"><label htmlFor="password">Password</label><PasswordInput id="password" name="password" autoComplete="current-password" required /></div>
              : <NewPasswordFields idPrefix="reg" />}
            {mode === "register" ? consent.view : null}
            <Btn busy={form.busy} className="block" type="submit" disabled={mode === "register" && !consent.all}>{mode === "login" ? "Log in" : "Create my account"}<Icon n="arrow" size={18} /></Btn>
            {mode === "login" ? <p style={{ textAlign: "center", margin: "16px 0 0" }}><Link className="link" href="/forgot">Forgot your password?</Link></p> : null}
          </form>
        </section>

        <h2 style={{ marginTop: 18 }}>How the hunt works</h2>
        <div className="steps">
          {STEPS.map(([ic, t, d], i) => (
            <section key={t} className="card step"><span className="no">0{i + 1}</span><div className="ico"><Icon n={ic} size={22} /></div><h3>{t}</h3><p>{d}</p></section>
          ))}
        </div>

        <section className="card" style={{ marginTop: 18 }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}><Icon n="timer" size={22} className="c-primary" />The tie-breaker</h2>
          <p className="prose" style={{ margin: 0 }}>If two players finish the week on the same score, the one who <b>reached that score first</b> ranks higher. We use the server time of the approval that brought each player to their final total — so the earlier hunter wins. Never a coin toss.</p>
          <div className="codebox"><div>TOCHI — 500 pips — reached 3:32 PM</div><div className="dim">MIKE — 500 pips — reached 4:08 PM</div><div className="res">→ Tochi takes first place.</div></div>
        </section>

        <div className="foot-brand"><Brand href="/login" /><div>A free social game among friends. Prizes are paid out personally by each hunt's admin.</div><div style={{ marginTop: 8 }}><Link className="link" href="/privacy">Privacy Policy</Link> · <Link className="link" href="/terms">Terms</Link></div></div>
      </div>
    </div>
  );
}
export default function AuthForm({ mode }) {
  return <Suspense fallback={null}><Inner mode={mode} /></Suspense>;
}
