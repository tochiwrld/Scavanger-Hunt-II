"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api, safeNext } from "../lib/client.js";
import { useApp } from "./Providers.js";
import { Btn, ErrBox, useForm } from "./ui.js";

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
  return (
    <div className="auth">
      <div className="hero">WEEKLY<br />HUNT</div>
      <div className="tag">Find it. Snap it twice. Climb the board.</div>
      <div className="stripe-band" />
      {next && next.startsWith("/join/") ? <div className="card mist" style={{ marginBottom: 12 }}>You've been invited to a group. {mode === "login" ? "Log in" : "Create an account"} to join it.</div> : null}
      <div className="tabs">
        <Link className={"tab" + (mode === "login" ? " on" : "")} href={"/login" + q}>Log in</Link>
        <Link className={"tab" + (mode === "register" ? " on" : "")} href={"/register" + q}>Create account</Link>
      </div>
      <form className="card" onSubmit={form.onSubmit} noValidate>
        <ErrBox error={form.error} />
        {mode === "register" ? <div className="field"><label htmlFor="nickname">Nickname</label><input id="nickname" name="nickname" autoComplete="nickname" maxLength={20} required /><div className="muted">Shown to your groups. Your email stays private.</div></div> : null}
        <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" inputMode="email" autoComplete="email" required /></div>
        <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required /></div>
        {mode === "register" ? <div className="field"><label htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div> : null}
        <Btn busy={form.busy} className="block" type="submit">{mode === "login" ? "Log in" : "Create my account"}</Btn>
        {mode === "login" ? <p style={{ textAlign: "center", margin: "14px 0 0" }}><Link href="/forgot">Forgot your password?</Link></p> : null}
      </form>
    </div>
  );
}
export default function AuthForm({ mode }) {
  return <Suspense fallback={null}><Inner mode={mode} /></Suspense>;
}
