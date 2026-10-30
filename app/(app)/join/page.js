"use client";
import { useRouter } from "next/navigation";
import { Btn, ErrBox, useForm } from "../../../components/ui.js";

export default function Page() {
  const router = useRouter();
  const form = useForm(async (v) => {
    const t = String(v.code || "").trim().split(/[/?#]/).filter(Boolean).pop();
    if (!t) throw new Error("Paste your invitation link or code");
    router.push("/join/" + encodeURIComponent(t));
  });
  return (
    <>
      <div className="page-head"><h1>Join a group</h1><p>Paste the invitation link or code you were sent.</p></div>
      <form className="card" onSubmit={form.onSubmit} noValidate>
        <ErrBox error={form.error} />
        <div className="field"><label htmlFor="code">Invitation link or code</label><input id="code" name="code" style={{ fontFamily: "var(--font-mono)" }} autoCapitalize="off" autoComplete="off" placeholder="https://…/join/8xK29LmQ" required /></div>
        <Btn busy={form.busy} className="block" type="submit">Continue</Btn>
      </form>
    </>
  );
}
