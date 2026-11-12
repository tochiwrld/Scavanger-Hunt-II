"use client";
import { useEffect, useState } from "react";
import Icon from "../../../components/icons.js";
import Duels from "../duels/page.js";
import Teams from "../teams/page.js";

/** VS: 1v1 and Team vs under one bottom-bar tab. The choice is kept in the address (#team) so links and Back work. */
export default function Page() {
  const [tab, setTab] = useState("1v1");
  useEffect(() => {
    const read = () => setTab(location.hash === "#team" ? "team" : "1v1");
    read(); addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);
  const go = (t) => { setTab(t); history.replaceState(null, "", t === "team" ? "#team" : location.pathname); };
  return (
    <>
      <div className="vs-seg" role="tablist" aria-label="VS mode">
        <button role="tab" aria-selected={tab === "1v1"} onClick={() => go("1v1")}><Icon n="swords" size={18} />1v1</button>
        <button role="tab" aria-selected={tab === "team"} onClick={() => go("team")}><Icon n="team" size={18} />Team vs</button>
      </div>
      {tab === "team" ? <Teams /> : <Duels />}
    </>
  );
}
