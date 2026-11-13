"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/client.js";
import { useApp } from "./Providers.js";
import Icon from "./icons.js";
import { Sheet } from "./ui.js";
import {
  canPromptInstall, countVisit, initInstall, isStandalone, markInstalled, markShown, mayAsk, onInstallChange,
  platform, promptInstall, snooze, takeMoment,
} from "../lib/install.js";

export const INSTALL_BONUS = 30;
const busyScreen = () => document.querySelector(".cam-overlay,.sh-hunt,.sh-sheet,.scrim,.win-overlay,.consent");

/**
 * Lives in AppShell. Tells the server once when PrimaHunt is opened from the home screen (for the bonus),
 * and opens Pip's install suggestion at good moments: the welcome screen after sign-up or joining a hunt,
 * the small "Pip has a suggestion!" card after other moments (two finds in a row, first approval, the board,
 * second visit). Capped and snoozable in lib/install.js.
 */
export default function InstallManager() {
  const { me, refreshMe } = useApp();
  const [open, setOpen] = useState(null); // null | "welcome" | "pip"

  useEffect(() => { initInstall(); }, []);

  // Opened from the home screen: record it once per account on this phone.
  useEffect(() => {
    if (!me?.id || !isStandalone() || me.installed) return;
    api("/me/installed", { method: "POST" }).then(() => refreshMe()).catch(() => {});
  }, [me?.id, me?.installed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!me?.id) return undefined;
    // Installed on any phone: no more home screen suggestions anywhere, even in a normal browser tab.
    if (me.installed || isStandalone()) { markInstalled(); takeMoment(); return undefined; }
    let t = 0;
    const show = (kind) => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!mayAsk() || busyScreen() || me.installed) return;
        markShown();
        setOpen(kind === "register" || kind === "join" ? "welcome" : "pip");
      }, kind === "register" || kind === "join" ? 900 : 1600);
    };
    const pending = takeMoment();
    if (pending) show(pending);
    else if (countVisit()) show("visit");
    const on = (e) => { takeMoment(); show(e.detail); };
    window.addEventListener("ph:moment", on);
    return () => { clearTimeout(t); window.removeEventListener("ph:moment", on); };
  }, [me?.id, me?.installed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (me?.installed) setOpen(null); }, [me?.installed]);

  if (!open) return null;
  return <InstallSheet variant={open} onClose={(later) => { if (later) snooze(); setOpen(null); }} />;
}

/** The install screen itself. variant: "welcome" (big onboarding screen), "pip" (Pip's short suggestion) or "steps". */
export function InstallSheet({ variant = "pip", onClose }) {
  const { toast } = useApp();
  const [, force] = useState(0);
  const [steps, setSteps] = useState(variant === "steps");
  useEffect(() => onInstallChange(() => force((n) => n + 1)), []);
  const p = platform();

  const add = async () => {
    if (canPromptInstall()) {
      const r = await promptInstall();
      if (r === "accepted") { toast("PrimaHunt is on your home screen 🎯 Open it from there.", "good"); onClose(false); return; }
      if (r === "dismissed") return;
    }
    setSteps(true);
  };


  return (
    <Sheet onClose={() => onClose(true)}>
      <div className="inst">
        {steps ? <Steps p={p} /> : variant === "welcome" ? (
          <>
            <div className="inst-phone" aria-hidden="true"><Icon n="phone" size={30} /></div>
            <h2 className="inst-h">Make PrimaHunt part of your phone.</h2>
            <p className="muted inst-lead">Your next hunt is one tap away.</p>
            <ul className="inst-list">
              <li><Icon n="check" size={16} />Launch hunts straight from your home screen</li>
              <li><Icon n="check" size={16} />Get back to your live challenges faster</li>
              <li><Icon n="check" size={16} />Never lose track of a hunt, with alerts on your phone</li>
            </ul>
          </>
        ) : (
          <>
            <div className="eyebrow">Pip has a suggestion!</div>
            <h2 className="inst-h" style={{ marginTop: 8 }}>Hey hunter! Why not keep PrimaHunt closer?</h2>
            <p className="muted inst-lead">Add us to your home screen and get straight into your next adventure.</p>
          </>
        )}
        {steps ? (
          <button className="btn block" onClick={() => onClose(false)}>Got it</button>
        ) : (
          <>
            <button className="btn block" onClick={add}><Icon n="addsq" size={18} />{variant === "welcome" ? "Add PrimaHunt to home screen" : "Add to home screen"}</button>
            <button className="btn block ghost" onClick={() => onClose(true)}>Maybe later</button>
          </>
        )}
      </div>
    </Sheet>
  );
}

function Steps({ p }) {
  const list =
    p === "ios" ? [
      [<Icon key="i" n="share" size={18} />, <>Tap the <b>Share</b> button at the bottom of Safari</>],
      [<Icon key="i" n="addsq" size={18} />, <>Scroll down and tap <b>Add to Home Screen</b></>],
      [<Icon key="i" n="check" size={18} />, <>Tap <b>Add</b> in the top corner</>],
    ] : p === "ios-other" ? [
      [<Icon key="i" n="share" size={18} />, <>Tap the <b>Share</b> button next to the web address (top right)</>],
      [<Icon key="i" n="addsq" size={18} />, <>Tap <b>Add to Home Screen</b> (scroll down if you can't see it)</>],
      [<Icon key="i" n="check" size={18} />, <>Tap <b>Add</b>. If it isn't there, open primahunt.com in Safari instead</>],
    ] : p === "android" ? [
      [<Icon key="i" n="dotsv" size={18} />, <>Tap the <b>three dots</b> at the top right of Chrome</>],
      [<Icon key="i" n="addsq" size={18} />, <>Tap <b>Install app</b> or <b>Add to Home screen</b></>],
      [<Icon key="i" n="check" size={18} />, <>Tap <b>Install</b> to confirm</>],
    ] : p === "inapp" ? [
      [<Icon key="i" n="more" size={18} />, <>Tap the <b>menu</b> (••• or ⋮) in this app's browser</>],
      [<Icon key="i" n="globe" size={18} />, <>Choose <b>Open in browser</b> (Chrome or Safari)</>],
      [<Icon key="i" n="addsq" size={18} />, <>Then add PrimaHunt to your home screen from there</>],
    ] : [
      [<Icon key="i" n="addsq" size={18} />, <>Click the <b>install</b> icon at the right of the address bar, or open the browser menu</>],
      [<Icon key="i" n="check" size={18} />, <>Choose <b>Install PrimaHunt</b></>],
      [<Icon key="i" n="phone" size={18} />, <>Best on your phone: open primahunt.com there and add it to your home screen</>],
    ];
  return (
    <>
      <div className="eyebrow">{p === "ios" || p === "ios-other" ? "iPhone" : p === "android" ? "Android" : p === "inapp" ? "First, open your browser" : "Computer"}</div>
      <h2 className="inst-h" style={{ marginTop: 8 }}>Add PrimaHunt in 3 taps</h2>
      <ol className="inst-steps">
        {list.map(([ico, text], i) => <li key={i}><span className="n">{i + 1}</span><span className="ico">{ico}</span><span>{text}</span></li>)}
      </ol>
      {p === "ios" ? <p className="muted" style={{ fontSize: 13, margin: "0 0 4px" }}>Then open PrimaHunt from your home screen. That's where your alerts live.</p> : null}
    </>
  );
}

/**
 * No card on Profile: installing is suggested by pop-ups only, and never again once installed.
 * This only opens the steps when someone taps "Show me how" in Pip's reminder email (/profile?install=1).
 */
export function InstallCard() {
  const { me } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    initInstall();
    if (!isStandalone() && new URLSearchParams(window.location.search).get("install") === "1") setOpen(true);
  }, []);
  if (!me || me.installed || !open) return null;
  return <InstallSheet variant="steps" onClose={() => setOpen(false)} />;
}
