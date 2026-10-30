"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../lib/client.js";
import { Btn, ErrBox, useForm } from "../../../components/ui.js";

export default function Page() {
  const [sent, setSent] = useState(false);
  const form = useForm(async (v) => { await api("/auth/forgot", { method: "POST", json: v }); setSent(true); });
  return (
    <div className="auth">
      <div className="hero" style={{ fontSize: 40 }}>WEEKLY HUNT</div><div className="stripe-band" />
      <h2>Forgot your password?</h2>
      {sent ? <div className="card mist" style={{ marginTop: 12 }}>If that email has an account, a reset link is on its way. It works for one hour.</div> : (
        <form className="card" onSubmit={form.onSubmit} noValidate style={{ marginTop: 12 }}>
          <p className="muted">Enter your email and we'll send a reset link.</p>
          <ErrBox error={form.error} />
          <div className="field"><label>Email</label><input name="email" type="email" inputMode="email" autoComplete="email" required /></div>
          <Btn busy={form.busy} className="block" type="submit">Send reset link</Btn>
        </form>
      )}
      <Link className="btn ghost block" href="/login" style={{ marginTop: 12 }}>Back to log in</Link>
    </div>
  );
}
