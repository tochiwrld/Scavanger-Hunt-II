"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api, safeNext } from "../lib/client.js";
import { useApp } from "./Providers.js";
import { Brand, ThemeToggle } from "./Brand.js";
import Icon from "./icons.js";
import { Btn, ErrBox, useForm } from "./ui.js";

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
        <input id="invite" value={v} onChange={(e) => setV(e.target.value)} placeholder="Paste your invite link" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <button className="btn" type="submit" disabled={!v.trim()}>Join<Icon n="arrow" size={17} /></button>
      </div>
      <p className="hint">Hunt Week is invite-only. Ask your group admin for the link.</p>
    </form>
  );
}

const STEPS = [
  ["hunt", "A new list every Monday", "Your admin drops a fresh list of real-world items at 12:00 AM Lagos time. Each one has its own point value."],
  ["camera", "Find it, snap it twice", "Spot an item out in the world and send two photos as proof, straight from your phone camera."],
  ["check", "Get approved, earn points", "Every submission is reviewed by hand. Approved items add points to your weekly score."],
  ["trophy", "Top the board by Sunday", "The leaderboard locks at 11:59 PM Sunday. First place takes the weekly prize."],
];

function Inner({ mode }) {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { refreshMe } = useApp();
  const form = useForm(async (v) => {
    await api(mode === "login" ? "/auth/login" : "/auth/register", { method: "POST", json: v });
    await refreshMe();
    router.push(next || (mode === "register" ? "/start" : "/"));
  });
  const q = next ? "?next=" + encodeURIComponent(next) : "";
  const invited = next && next.startsWith("/join/");
  return (
    <div className="landing">
      <section className="hero-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="bg" src={HERO_IMG} alt="" fetchPriority="high" />
        <div className="hero-top">
          <Brand href="/login" />
          <div className="acts"><ThemeToggle />{mode === "login" ? <Link className="pill-btn" href={"/register" + q}>Sign up</Link> : <Link className="pill-btn" href={"/login" + q}>Log in</Link>}</div>
        </div>
        <div className="inner">
          <span className="kicker">The weekly scavenger hunt</span>
          <h1 className="headline">Find it.<br />Snap it <em>twice.</em><br />Win the week.</h1>
          <p className="lede">A private, weekly scavenger hunt for your crew. New items every Monday, two photos per find, real points on a real leaderboard — and ₦3,000 for whoever finishes on top.</p>
          {invited ? null : <InviteBox />}
          <div className="closes"><div className="label" style={{ color: "oklch(85% .015 275)" }}>Free to play</div><div className="v">No entry fees, ever. Just friends, phones and bragging rights.</div></div>
        </div>
      </section>

      <div className="auth-body">
        <section className="card" id="account">
          {invited ? <div className="card mist flat" style={{ marginBottom: 16 }}>You've been invited to a group. {mode === "login" ? "Log in" : "Create an account"} to join it.</div> : null}
          <div className="tabs" style={{ marginBottom: 18 }}>
            <Link className={"tab" + (mode === "login" ? " on" : "")} href={"/login" + q}>Log in</Link>
            <Link className={"tab" + (mode === "register" ? " on" : "")} href={"/register" + q}>Create account</Link>
          </div>
          <form onSubmit={form.onSubmit} noValidate>
            <ErrBox error={form.error} />
            {mode === "register" ? <div className="field"><label htmlFor="nickname">Nickname</label><input id="nickname" name="nickname" autoComplete="nickname" maxLength={20} required /><div className="muted">The only thing other players see. Your email stays private.</div></div> : null}
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" required /></div>
            <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required /></div>
            {mode === "register" ? <div className="field"><label htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div> : null}
            <Btn busy={form.busy} className="block" type="submit">{mode === "login" ? "Log in" : "Create my account"}<Icon n="arrow" size={18} /></Btn>
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
          <div className="codebox"><div>TOCHI — 500 pts — reached 3:32 PM</div><div className="dim">MIKE — 500 pts — reached 4:08 PM</div><div className="res">→ Tochi takes first place.</div></div>
        </section>

        <section className="card plist">
          <h2 style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}><Icon n="lock" size={22} className="c-primary" />Your privacy</h2>
          <p><b>Email</b> — used only to log you in, reset your password and send game updates. It is never shown to other players.</p>
          <p><b>Photos</b> — stored privately and only seen by you and the admin reviewing them. Other players never see your evidence.</p>
          <p><b>Nickname</b> — the only thing that appears on leaderboards and results.</p>
          <p><b>No location tracking</b> — we never ask for GPS, phone numbers, real names or payment details.</p>
        </section>

        <div className="foot-brand"><Brand href="/login" /><div>A free social game among friends. Prizes are paid out personally by each group's admin.</div></div>
      </div>
    </div>
  );
}
export default function AuthForm({ mode }) {
  return <Suspense fallback={null}><Inner mode={mode} /></Suspense>;
}
