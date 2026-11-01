"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../lib/client.js";
import { useApp } from "../../../components/Providers.js";
import Icon from "../../../components/icons.js";

export default function Page() {
  const { me, setMe, toast } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const admin = async () => {
    setBusy(true);
    try { await api("/me/become-admin", { method: "POST" }); setMe({ ...me, can_create_groups: true }); router.push("/groups/new"); } catch (e) { toast(e.message, "bad"); setBusy(false); }
  };
  const Choice = ({ icon, title, text, ...rest }) => (
    <>
      <span className="step" style={{ display: "contents" }} />
      <span className="row" style={{ gap: 16, alignItems: "flex-start" }}>
        <span className="ico" style={{ width: 46, height: 46, borderRadius: 13, background: "var(--primary)", color: "var(--primary-fg)", display: "grid", placeItems: "center", flex: "none" }}><Icon n={icon} size={22} /></span>
        <span className="grow"><span style={{ display: "block", font: "800 20px/1.1 var(--font-head)", letterSpacing: "-.03em" }}>{title}</span><span className="muted" style={{ display: "block", marginTop: 6 }}>{text}</span></span>
        <Icon n="arrow" size={20} className="c-mute" />
      </span>
    </>
  );
  return (
    <>
      <div className="page-head"><h1>What do you want to do?</h1><p>One account works for both. You can do the other later.</p></div>
      <button className="card gcard" style={{ textAlign: "left", cursor: "pointer", width: "100%", opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={admin}><Choice icon="shield" title="Create an admin account" text="Create hunts, publish weekly challenges and review photos." /></button>
      <Link className="card gcard" href="/join"><Choice icon="key" title="Join as a player" text="Use the invitation link or code your admin sent you." /></Link>
    </>
  );
}
