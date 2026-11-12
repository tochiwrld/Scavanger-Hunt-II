"use client";
import { useEffect, useRef, useState } from "react";
import { LAGOS, loadLeaflet } from "../lib/stars-client.js";

const STAR_SVG = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.5 1.3 6.6L12 17.2l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z" fill="#ffcc1f" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>';

/**
 * The Lagos map with every live star.
 * `interactive` false = a still preview (tap handled by the parent). `onPick(star)` when a star is tapped.
 * `onMapTap({lat, lon})` (admin) when empty map is tapped. `center` re-centres when it changes.
 */
export default function StarMap({ stars = [], me = null, target = null, pending = null, interactive = true, zoom = 11, center = null, onPick, onMapTap, className = "", style, children }) {
  const box = useRef(null), map = useRef(null), layer = useRef(null), meMark = useRef(null), pendingMark = useRef(null);
  const [failed, setFailed] = useState(false);
  const pickRef = useRef(onPick), tapRef = useRef(onMapTap);
  pickRef.current = onPick; tapRef.current = onMapTap;

  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !box.current || map.current) return;
      const m = L.map(box.current, { zoomControl: interactive, attributionControl: interactive, dragging: interactive, touchZoom: interactive, scrollWheelZoom: interactive, doubleClickZoom: interactive, boxZoom: false, keyboard: interactive, tap: false })
        .setView(center ? [center.lat, center.lon] : LAGOS, zoom);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      m.on("click", (e) => tapRef.current?.({ lat: e.latlng.lat, lon: e.latlng.lng }));
      map.current = m;
      draw();
      setTimeout(() => m.invalidateSize(), 60);
    }).catch(() => !dead && setFailed(true));
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.current?.invalidateSize()) : null;
    if (ro && box.current) ro.observe(box.current);
    return () => { dead = true; ro?.disconnect(); map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function draw() {
    const L = window.L, m = map.current;
    if (!L || !m) return;
    layer.current.clearLayers();
    for (const st of stars) {
      const cls = "sh-mark" + (st.pips >= 50 ? " rare" : "") + (st.caught ? " caught" : "") + (target && target.id === st.id ? " target" : "");
      const mk = L.marker([st.lat, st.lon], { icon: L.divIcon({ className: "", html: `<div class="${cls}">${STAR_SVG}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }), keyboard: false, title: st.name, interactive: Boolean(interactive && onPick) });
      mk.on("click", () => pickRef.current?.(st));
      mk.addTo(layer.current);
    }
    if (me) {
      if (meMark.current) meMark.current.setLatLng([me.lat, me.lon]);
      else meMark.current = L.marker([me.lat, me.lon], { icon: L.divIcon({ className: "", html: '<div class="sh-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, keyboard: false }).addTo(m);
    }
    if (pendingMark.current) { pendingMark.current.remove(); pendingMark.current = null; }
    if (pending) pendingMark.current = L.marker([pending.lat, pending.lon], { icon: L.divIcon({ className: "", html: `<div class="sh-mark target new">${STAR_SVG}</div>`, iconSize: [34, 34], iconAnchor: [17, 17] }), interactive: false }).addTo(m);
  }
  useEffect(draw, [stars, me, target, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (center && map.current) map.current.setView([center.lat, center.lon], Math.max(map.current.getZoom(), center.zoom || 13)); }, [center]);

  return (
    <div className={"sh-map " + className} style={style}>
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      {failed ? <div className="sh-map-off" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 16, textAlign: "center", color: "var(--muted-fg)", fontSize: 14 }}>The map couldn't load. Check your connection.</div> : null}
      {children}
    </div>
  );
}
