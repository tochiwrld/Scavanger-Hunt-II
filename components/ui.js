"use client";
import { useCallback, useEffect, useState } from "react";
import { api, cap, colorFor, fmtLeft, medal, statusIcon, statusLabel, naira, zoom } from "../lib/client.js";
import { useApp } from "./Providers.js";

/** Fetch helper: { data, error, loading, reload }. Reloads when alerts arrive. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    let dead = false;
    api(path).then((data) => !dead && setState({ data, error: null, loading: false }))
      .catch((error) => !dead && setState({ data: null, error, loading: false }));
    return () => { dead = true; };
  }, [path, tick]);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    window.addEventListener("hunt:refresh", f);
    return () => window.removeEventListener("hunt:refresh", f);
  }, []);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export const Skel = () => <><div className="skel" /><div className="skel" /><div className="skel" /></>;

export function Empty({ icon, title, text, children }) {
  return <div className="card empty"><div className="big">{icon}</div><h3>{title}</h3>{text ? <p className="muted">{text}</p> : null}{children}</div>;
}

/** Renders loading / error states, then children(data). */
export function Async({ st, children }) {
  if (st.loading) return <Skel />;
  if (st.error) return <Empty icon="😵" title="Couldn't load this page" text={st.error.message}><button className="btn" onClick={st.reload}>Try again</button></Empty>;
  return children(st.data);
}

export function Btn({ busy, className = "", children, ...rest }) {
  return <button {...rest} className={`btn ${className} ${busy ? "spin" : ""}`} disabled={busy || rest.disabled}>{children}</button>;
}

/** Form helper: runs fn(values, formEl), tracks busy + error text. */
export function useForm(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const onSubmit = async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    setBusy(true); setError("");
    try { await fn(Object.fromEntries(new FormData(f)), f); } catch (ex) { setError(ex.message); } finally { setBusy(false); }
  };
  return { onSubmit, busy, error };
}
export const ErrBox = ({ error }) => (error ? <div className="err">{error}</div> : null);

export function Sheet({ onClose, children }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true"><button className="x" onClick={onClose} aria-label="Close">×</button>{children}</div>
    </div>
  );
}

export function Avatar({ g }) {
  return <div className="av" style={{ "--gc": colorFor(g.id) }}>{g.has_image ? <img src={`/api/groups/${g.id}/image`} alt="" /> : (g.name || "?").trim().charAt(0).toUpperCase()}</div>;
}
export const RoleBadge = ({ g }) => <span className="role">{g.role === "owner" ? "ADMIN" : "PLAYER"}</span>;

export function Countdown({ end, onDone }) {
  const { offset } = useApp();
  const [ms, setMs] = useState(() => new Date(end) - (Date.now() + offset));
  useEffect(() => {
    let done = false;
    const tick = () => {
      const left = new Date(end) - (Date.now() + offset);
      setMs(left);
      if (left <= 0 && !done) { done = true; if (onDone) setTimeout(onDone, 800); }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [end, offset, onDone]);
  return <div className={"cd" + (ms > 0 && ms < 86400000 ? " low" : "")}>{fmtLeft(ms)}</div>;
}

export function CountUp({ to }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to || 0); return undefined; }
    let raf; const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 800);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{v.toLocaleString()}</>;
}

export function LbRows({ rows }) {
  return (
    <div className="lb">
      {rows.map((r, i) => (
        <div key={i} className={`r ${r.me ? "me" : ""} ${r.points > 0 && r.rank <= 3 ? "top" + r.rank : ""}`} style={{ animation: "drop .35s both", animationDelay: Math.min(i, 12) * 35 + "ms" }}>
          <div className="pos">{medal(r.rank, r.points)}</div>
          <div className="nm">{r.nickname}{r.me ? " (you)" : ""}</div>
          <div className="muted">{r.items} item{r.items === 1 ? "" : "s"}</div>
          <div className="pt">{r.points}</div>
        </div>
      ))}
    </div>
  );
}

export function Plate({ children }) {
  return <section className="plate"><div className="stripe" /><div className="in">{children}</div></section>;
}

export function ChallengeHead({ c, countdown, onDone }) {
  return (
    <Plate>
      <div className="muted" style={{ color: "#c9c2b4" }}>{c.week_number ? `Week ${String(c.week_number).padStart(2, "0")} · ` : ""}Prize {naira(c.prize_amount)}</div>
      <div className="week">{c.title}</div>
      {countdown ? <Countdown end={c.end_at} onDone={onDone} /> : null}
      {c.description ? <p style={{ margin: "10px 0 0", color: "#e7e1d3" }}>{c.description}</p> : null}
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700, color: "var(--gc)" }}>Rules</summary>
        <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", color: "#e7e1d3" }}>{c.rules || ""}</p>
        <p style={{ margin: "8px 0 0", color: "#e7e1d3" }}>⚖️ {c.tie_rule}</p>
      </details>
    </Plate>
  );
}

export function ItemCard({ it, gid, preview, onSubmit }) {
  return (
    <article className={`card item ${it.status}`}>
      {it.status === "approved" ? <div className="stamp">+{it.points} PTS</div> : null}
      <div className="row wrap"><span className="num">Item {it.number}</span><span className={`chip ${it.difficulty}`}>{cap(it.difficulty)}</span></div>
      <h3>{it.title}</h3>
      {it.description ? <p>{it.description}</p> : null}
      {it.instructions ? <p className="muted">{it.instructions}</p> : null}
      {it.has_reference ? <img className="refimg" loading="lazy" src={`/api/groups/${gid}/items/${it.id}/reference`} alt="Reference" onClick={(e) => zoom(e.currentTarget.src)} /> : null}
      {it.hint ? <details><summary>💡 Need a hint?</summary><p className="muted" style={{ marginTop: 6 }}>{it.hint}</p></details> : null}
      <div className="row between" style={{ marginTop: 10 }}><span className="pts">{it.points} pts</span><span className={`st ${it.status}`}>{statusIcon[it.status]} {statusLabel[it.status]}</span></div>
      {!preview && it.status === "not_submitted" ? <button className="btn block" onClick={() => onSubmit(it)}>📷 Submit photos</button> : null}
      {!preview && it.status === "pending" ? <p className="muted" style={{ margin: "10px 0 0" }}>Both photos are in. Points arrive once the admin approves.</p> : null}
      {!preview && it.status === "rejected" ? (
        <>
          <div className="reason"><b>Rejected:</b> {it.rejection_reason}</div>
          <button className="btn block" style={{ marginTop: 10 }} onClick={() => onSubmit(it)}>📷 Submit new photos</button>
        </>
      ) : null}
    </article>
  );
}
