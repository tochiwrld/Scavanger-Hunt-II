"use client";
import { useEffect, useState } from "react";
import { useApp } from "./Providers.js";
import StarMap from "./StarMap.js";
import Icon from "./icons.js";
import { distBearing, fmtDist, whereAmI } from "../lib/stars-client.js";

/** Full-screen Lagos map: every live star; tap one to hunt it. */
export default function StarSheet() {
  const { stars, loadStars, starTarget, openStarHunt, setStarMapOpen } = useApp();
  const [me, setMe] = useState(null);
  const [pick, setPick] = useState(starTarget);
  const [center, setCenter] = useState(starTarget ? { lat: starTarget.lat, lon: starTarget.lon, zoom: 13 } : null);
  const [note, setNote] = useState("Tap a star to see it");
  const close = () => setStarMapOpen(false);

  useEffect(() => {
    if (!stars) loadStars();
    whereAmI().then((p) => { if (p) { setMe(p); setNote("Blue dot is you"); } else setNote("Turn on location to see how far each star is"); });
    const esc = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const live = (stars || []).filter((s) => !s.caught).length;
  const choose = (st) => { setPick(st); setCenter({ lat: st.lat, lon: st.lon, zoom: 13 }); };
  return (
    <div className="sh-sheet" role="dialog" aria-modal="true" aria-label="Stars in Lagos">
      <div className="hd">
        <button className="icon-btn" onClick={close} aria-label="Close the map"><Icon n="close" size={20} /></button>
        <div className="grow"><h2>Stars in Lagos</h2><div className="muted" style={{ fontSize: 13 }}>{stars ? `${live} to catch · ` : ""}{note}</div></div>
        <button className="icon-btn" aria-label="Show where I am" onClick={() => me && setCenter({ ...me, zoom: 14 })}><Icon n="locate" size={20} /></button>
      </div>
      <div className="body">
        <StarMap style={{ position: "absolute", inset: 0 }} stars={stars || []} me={me} target={pick} center={center} onPick={choose} />
        {pick ? (
          <div className="sh-float sh-pick">
            <div className="row between"><div><div className="eyebrow">{pick.area || "Lagos"}</div><h3 style={{ marginTop: 5 }}>{pick.name}</h3></div><span className="pts">{pick.pips} PIPS</span></div>
            <div className="meta">
              <span className="chip">{me ? fmtDist(distBearing(me, pick).d) + " away" : "Distance: turn on location"}</span>
              <span className="chip">{pick.pips >= 50 ? "Rare star" : "Star"}</span>
              <span className="chip">{pick.catches} caught it</span>
            </div>
            <button className="btn block" disabled={pick.caught} onClick={() => openStarHunt(pick)}><Icon n="star" size={18} />{pick.caught ? "You caught this one" : "Hunt this star"}</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
