"use client";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../lib/client.js";
import { useApp } from "../../../../components/Providers.js";
import { Btn, ErrBox, useForm } from "../../../../components/ui.js";

export default function Page() {
  const { token } = useParams();
  const router = useRouter();
  const { toast } = useApp();
  const form = useForm(async (v) => {
    await api("/auth/reset", { method: "POST", json: { ...v, token } });
    toast("Password changed. Log in.", "good");
    router.push("/login");
  });
  return (
    <div className="auth">
      <div className="hero" style={{ fontSize: 40 }}>WEEKLY HUNT</div><div className="stripe-band" />
      <h2>Choose a new password</h2>
      <form className="card" onSubmit={form.onSubmit} noValidate style={{ marginTop: 12 }}>
        <ErrBox error={form.error} />
        <div className="field"><label>New password</label><input name="password" type="password" autoComplete="new-password" required /></div>
        <div className="field"><label>Confirm password</label><input name="confirm" type="password" autoComplete="new-password" required /></div>
        <Btn busy={form.busy} className="block" type="submit">Save password</Btn>
      </form>
    </div>
  );
}
