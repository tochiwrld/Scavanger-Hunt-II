"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { api } from "../../../lib/client.js";
import { useApp } from "../../../components/Providers.js";
import StarMap from "../../../components/StarMap.js";
import Icon from "../../../components/icons.js";
import { Btn, Skel } from "../../../components/ui.js";
import { distBearing, fmtDist, whereAmI } from "../../../lib/stars-client.js";

export default function Page() {
  return <Suspense fallback={<Skel />}><Stars /></Suspense>;
}

function Stars() {
  const { stars, starMe, starAdmin, loadStars, openStarHunt, setStarMapOpen, setStarTarget } = useApp();
  const params = useSearchParams();
  const [me, setMe] = useState(null);
  useEffect(() => { loadStars(); whereAmI().then(setMe); }, [loadStars]);
  // Opened from a push alert: go straight to that star on the map.
  useEffect(() => {
    const id = Number(params.get("star"));
    if (id && stars) { const st = stars.find((s) => s.id === id); if (st) { setStarTarget(st); setStarMapOpen(true); } }
  }, [params, stars]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!stars) return <Skel />;
  const sorted = [...stars].sort((a, b) => (a.caught - b.caught) || (me ? distBearing(me, a).d - distBearing(me, b).d : a.id - b.id));
  return (
    <>
      <div className="page-head"><h1>Star hunt</h1><p>Stars drop at real spots around Lagos. Go there, open the camera with the big star button, find the spinning star and catch it. You have to be within about 30 m.</p></div>
      <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, textAlign: "center" }}>
        <div><div className="pts" style={{ fontSize: 24 }}>{starMe?.caught || 0}</div><div className="muted" style={{ fontSize: 12 }}>Stars caught</div></div>
        <div><div className="pts" style={{ fontSize: 24 }}>{starMe?.pips || 0}</div><div className="muted" style={{ fontSize: 12 }}>Star pips</div></div>
        <div><div className="pts" style={{ fontSize: 24 }}>{stars.filter((s) => !s.caught).length}</div><div className="muted" style={{ fontSize: 12 }}>Left to catch</div></div>
      </div>
      <button className="btn block" onClick={() => setStarMapOpen(true)}><Icon n="map" size={18} />Open the Lagos map</button>
      <div className="sec-title"><h2>{me ? "Nearest first" : "All stars"}</h2></div>
      <div className="sh-list">
        {sorted.map((s) => (
          <button key={s.id} className="sh-row" onClick={() => (s.caught ? null : openStarHunt(s))} disabled={s.caught} style={s.caught ? { opacity: 0.55 } : undefined}>
            <span style={{ color: s.caught ? "var(--muted-fg)" : "var(--primary)" }}><Icon n="star" size={22} /></span>
            <span className="grow"><b>{s.name}</b><span className="muted" style={{ fontSize: 13 }}>{s.area}{me ? " · " + fmtDist(distBearing(me, s).d) : ""}{s.caught ? " · caught ✅" : ""}</span></span>
            <span className="pts">{s.pips} PIPS</span>
          </button>
        ))}
        {!stars.length ? <p className="muted">No stars right now. We'll ping you when one drops.</p> : null}
      </div>
      <div className="card mist" style={{ fontSize: 14 }}>
        <b>Stay safe.</b> Stars are only placed in public places. Hunt in daylight, never step into traffic, and don't go into private property or anywhere you feel unsafe. No star is worth it.
      </div>
      {starAdmin ? <DropStar stars={stars} me={me} onDone={loadStars} /> : null}
    </>
  );
}

/** PrimaHunt admin: tap the map (or use your location) to drop a star. Everyone with alerts on gets a push. */
function DropStar({ stars, me, onDone }) {
  const { toast } = useApp();
  const [spot, setSpot] = useState(null);
  const [name, setName] = useState(""), [area, setArea] = useState(""), [pips, setPips] = useState(20), [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const drop = async () => {
    if (!spot) return toast("Tap the map where the star should go", "bad");
    setBusy(true);
    try {
      const r = await api("/stars", { method: "POST", json: { name, area, pips, days, lat: spot.lat, lon: spot.lon } });
      toast(`Star dropped. Alert sent to ${r.pushed} phone${r.pushed === 1 ? "" : "s"}.`, "good");
      setSpot(null); setName(""); setArea(""); onDone();
    } catch (e) { toast(e.message, "bad"); }
    setBusy(false);
  };
  const remove = async (s) => {
    try { await api(`/stars/${s.id}`, { method: "DELETE" }); toast(`Removed ${s.name}`); onDone(); } catch (e) { toast(e.message, "bad"); }
  };
  return (
    <section className="card stack" style={{ borderColor: "color-mix(in oklch,var(--primary) 40%,var(--border))" }}>
      <div><div className="eyebrow">PrimaHunt admin</div><h2 style={{ marginTop: 6 }}>Drop a star</h2><p className="muted" style={{ margin: "6px 0 0" }}>Tap the map where the star goes. Pick public, safe places people can walk to. Everyone gets a notification on their phone straight away.</p></div>
      <StarMap stars={stars} me={me} pending={spot} onMapTap={setSpot} center={spot ? { ...spot, zoom: 15 } : null} style={{ height: 320, borderRadius: 16 }} />
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn ghost" type="button" onClick={() => me ? setSpot({ lat: me.lat, lon: me.lon }) : toast("Turn on location first", "bad")}><Icon n="locate" size={16} />Use where I am</button>
        {spot ? <span className="chip mono">{spot.lat.toFixed(5)}, {spot.lon.toFixed(5)}</span> : <span className="muted" style={{ fontSize: 14 }}>No spot picked yet</span>}
      </div>
      <div className="field"><label htmlFor="sname">Place name</label><input id="sname" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Freedom Park" /></div>
      <div className="field"><label htmlFor="sarea">Area</label><input id="sarea" value={area} onChange={(e) => setArea(e.target.value)} maxLength={40} placeholder="e.g. Lagos Island" /></div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="grow field"><label htmlFor="spips">Worth</label><select id="spips" value={pips} onChange={(e) => setPips(+e.target.value)}><option value={20}>20 pips</option><option value={30}>30 pips</option><option value={50}>50 pips (rare)</option></select></div>
        <div className="grow field"><label htmlFor="sdays">Stays for</label><select id="sdays" value={days} onChange={(e) => setDays(+e.target.value)}><option value={1}>1 day</option><option value={3}>3 days</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={0}>Until removed</option></select></div>
      </div>
      <Btn busy={busy} className="block" onClick={drop}><Icon n="star" size={18} />Drop star and send alert</Btn>
      <div className="sec-title"><h3>Live stars</h3></div>
      <div className="sh-list">
        {stars.map((s) => (
          <div key={s.id} className="sh-row" style={{ cursor: "default" }}>
            <span className="grow"><b>{s.name}</b><span className="muted" style={{ fontSize: 13 }}>{s.area} · {s.pips} pips · caught {s.catches}×{s.ends_at ? " · ends " + new Date(s.ends_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" }) : ""}</span></span>
            <button className="text-btn" onClick={() => remove(s)}>Remove</button>
          </div>
        ))}
      </div>
    </section>
  );
}
