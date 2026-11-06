"use client";
import { useState } from "react";
import { api } from "../lib/client.js";
import { useApp } from "./Providers.js";
import { Btn, ErrBox, Sheet } from "./ui.js";

/** "Are you sure?" step before switching on admin tools. They can be switched off later in Profile (once you run no hunts). */
export default function BecomeAdmin({ onClose, onDone }) {
  const { me, setMe } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try {
      await api("/me/become-admin", { method: "POST", json: { confirm: true } });
      setMe({ ...me, can_create_groups: true });
      onDone?.();
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Sheet onClose={onClose}>
      <h2>Turn on admin tools?</h2>
      <ErrBox error={err} />
      <ul className="muted" style={{ paddingLeft: 18, margin: "12px 0 16px", lineHeight: 1.6 }}>
        <li>You'll be able to create hunts, invite players, write each week's list and review photos.</li>
        <li>As a hunt admin you're responsible for its items: nothing dangerous or illegal (see the <a className="link" href="/terms" target="_blank" rel="noreferrer">Terms</a>).</li>
        <li>You keep playing in other hunts as normal.</li>
        <li>You can switch admin tools off again in Profile once you don't run any hunts.</li>
      </ul>
      <Btn className="block" busy={busy} onClick={go}>Yes, turn on admin tools</Btn>
      <button type="button" className="btn block ghost" style={{ marginTop: 8 }} onClick={onClose}>Not now</button>
    </Sheet>
  );
}
