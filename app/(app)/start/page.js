"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../lib/client.js";
import { useApp } from "../../../components/Providers.js";

export default function Page() {
  const { me, setMe, toast } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const admin = async () => {
    setBusy(true);
    try { await api("/me/become-admin", { method: "POST" }); setMe({ ...me, can_create_groups: true }); router.push("/groups/new"); } catch (e) { toast(e.message, "bad"); setBusy(false); }
  };
  return (
    <>
      <div><h1>What do you want to do?</h1><p className="muted">One account works for both. You can do the other later.</p></div>
      <button className={"btn block" + (busy ? " spin" : "")} disabled={busy} onClick={admin} style={{ padding: 22 }}>🛡️ Create an admin account<br /><small style={{ fontWeight: 500 }}>Run groups and weekly hunts</small></button>
      <Link className="btn block ghost" href="/join" style={{ padding: 22 }}>🎯 Join as a player<br /><small style={{ fontWeight: 500 }}>Use an invitation link or code</small></Link>
    </>
  );
}
