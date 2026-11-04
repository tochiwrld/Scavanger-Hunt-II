"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, cap, colorFor, fmtLeft, naira, pad2, TZ, zoom } from "../lib/client.js";
import Icon from "./icons.js";
import { useApp } from "./Providers.js";

/** Fetch helper: { data, error, loading, reload }. Reloads when alerts arrive. */
/**
 * Loads `path`. With { poll: ms } it also re-checks quietly every `ms` while the page is on screen, pauses when the
 * tab is hidden or the phone is locked, and checks right away on return. A failed background check keeps the last data.
 */
export function useApi(path, { poll } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const [tick, setTick] = useState(0);
  const quiet = useRef(false);
  useEffect(() => {
    if (!path) return undefined;
    let dead = false;
    const bg = quiet.current;
    quiet.current = false;
    api(path).then((data) => !dead && setState({ data, error: null, loading: false }))
      .catch((error) => !dead && setState((st) => (bg && st.data ? st : { data: null, error, loading: false })));
    return () => { dead = true; };
  }, [path, tick]);
  useEffect(() => {
    if (!poll || !path) return undefined;
    let timer;
    const check = () => { quiet.current = true; setTick((t) => t + 1); };
    const start = () => { clearInterval(timer); timer = setInterval(check, poll); };
    const onVis = () => { if (document.hidden) clearInterval(timer); else { check(); start(); } };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVis); };
  }, [poll, path]);
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
  return <div className="card empty"><div className="big">{icon}</div><h3>{title}</h3>{text ? <p className="muted" style={{ maxWidth: 420, margin: "0 auto 4px" }}>{text}</p> : null}{children ? <div style={{ marginTop: 14 }}>{children}</div> : null}</div>;
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
export const RoleBadge = ({ g }) => <span className={"role" + (g.role === "owner" ? " owner" : "")}>{g.role === "owner" ? (g.co_admin ? "Co-admin" : "Admin") : "Player"}</span>;

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

const reached = (d) => new Date(d).toLocaleString("en-NG", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" }).replace(/\s?([AP]M)$/i, (m, x) => " " + x.toLowerCase());

/** Leaderboard rows. Shows "reached at" only where a tie makes it matter. */
export function LbRows({ rows, prize }) {
  return (
    <div className="lb">
      {rows.map((r, i) => {
        const tied = r.points > 0 && r.reached_at && ((rows[i - 1] && rows[i - 1].points === r.points) || (rows[i + 1] && rows[i + 1].points === r.points));
        const top = r.points > 0 && r.rank <= 3 ? " top" + r.rank : "";
        return (
          <div key={i} className={"r" + top + (r.me ? " me" : "")} style={{ animation: "rise .35s both", animationDelay: Math.min(i, 12) * 35 + "ms" }}>
            <div className="pos">{r.rank}</div>
            <div className="who">
              <div className="nm"><span>{r.nickname}</span>{r.rank === 1 && r.points > 0 ? <Icon n="crown" size={16} /> : null}{r.me ? <span className="you">YOU</span> : null}</div>
              <div className="sub"><span>{r.tier ? r.tier : `${r.items} item${r.items === 1 ? "" : "s"} approved`}</span>{tied ? <span className="reach"><Icon n="timer" size={13} />reached {reached(r.reached_at)}</span> : null}</div>
            </div>
            <div className="score"><div className="pt">{r.points}</div><div className="unit">{prize && r.rank === 1 && r.points > 0 ? naira(prize) : "PTS"}</div></div>
          </div>
        );
      })}
    </div>
  );
}

export function Plate({ children, className = "" }) {
  return <section className={"plate " + className}><div className="stripe" /><div className="in">{children}</div></section>;
}

const fmtShort = (d) => new Date(d).toLocaleString("en-NG", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function ChallengeHead({ c, countdown, onDone, count }) {
  return (
    <section className="card">
      <div className="eyebrow">{c.week_number ? `Week ${pad2(c.week_number)} · ` : ""}{count != null ? `${count} item${count === 1 ? "" : "s"}` : ""}{c.prize_amount > 0 ? `${count != null ? " · " : ""}Prize ${naira(c.prize_amount)}` : ""}</div>
      <h1 style={{ margin: "10px 0 12px", fontSize: "clamp(30px,8vw,40px)" }}>{c.title}</h1>
      {c.description ? <p className="prose" style={{ margin: "0 0 8px" }}>{c.description}</p> : null}
      <div className="muted" style={{ fontSize: 13 }}>{fmtShort(c.start_at)} → {fmtShort(c.end_at)} · Africa/Lagos</div>
      {countdown ? <Countdown end={c.end_at} onDone={onDone} /> : null}
      <details className="rules">
        <summary><Icon n="scroll" size={18} />Challenge rules &amp; tie-breaker<Icon n="chevron" size={18} /></summary>
        <div className="body">{c.rules ? c.rules + "\n\n" : ""}{c.tie_rule}</div>
      </details>
    </section>
  );
}

const STATUS = {
  not_submitted: ["dashed", "Not submitted"], pending: ["clock", "Pending review"],
  approved: ["check", "Approved"], rejected: ["x", "Rejected"],
};
export function StatusPill({ status, label }) {
  const [ic, l] = STATUS[status] || ["dashed", status];
  return <span className={`st ${status}`}><Icon n={ic} size={13} />{label || l}</span>;
}
export function Difficulty({ d }) {
  const bars = { easy: 1, medium: 2, hard: 3, extreme: 3 }[d] || 1;
  return <span className={`chip ${d}`}><span className="sig">{[1, 2, 3].map((k) => <i key={k} className={k <= bars ? "on" : ""} />)}</span>{cap(d)}</span>;
}

export function ItemCard({ it, gid, preview, onSubmit }) {
  return (
    <article className={`card item ${it.status}`} style={{ animation: "rise .3s both" }}>
      <div className="head"><span className="num">Item {pad2(it.number)}</span><StatusPill status={it.status} /></div>
      <h3>{it.title}</h3>
      <div className="tags"><Difficulty d={it.difficulty} /><span className="pts">{it.points} PTS</span></div>
      {it.description ? <p className="txt">{it.description}</p> : null}
      {it.instructions ? <p className="txt">{it.instructions}</p> : null}
      {it.has_reference ? <img className="refimg" loading="lazy" src={`/api/groups/${gid}/items/${it.id}/reference`} alt="Reference" onClick={(e) => zoom(e.currentTarget.src)} /> : null}
      {it.hint ? <details className="hint"><summary><Icon n="bulb" size={15} />Show hint</summary><p>{it.hint}</p></details> : null}
      {preview ? null : (
        <div className="foot">
          {it.status === "not_submitted" ? <button className="btn block" onClick={() => onSubmit(it)}><Icon n="camera" size={18} />Submit photos</button> : null}
          {it.status === "pending" ? <div className="state-box">{it.submitted_at ? "Submitted " + fmtShort(it.submitted_at) + " · " : ""}photos locked while in review</div> : null}
          {it.status === "approved" ? <div className="state-box earned">+{it.points} points earned</div> : null}
          {it.status === "rejected" ? (
            <>
              <div className="reason"><b>Rejected:</b> {it.rejection_reason}</div>
              <button className="btn block" onClick={() => onSubmit(it)}><Icon n="camera" size={18} />Submit new photos</button>
            </>
          ) : null}
        </div>
      )}
    </article>
  );
}

/** 1 to 4 photos of one submission, laid out like a social post. Tap to zoom. */
/** Photo grid. thumb=true shows the small copies (feed, finds, my submissions) and opens the full photo on tap; admin review passes thumb={false}. */
export function Photos({ base = "/api/photo", id, count, who = "", thumb = true }) {
  if (Number(count) === 0) return <p className="muted" style={{ margin: "8px 0" }}>📷 Photos are deleted once an admin reviews them. The result and points stay.</p>;
  const n = Math.max(1, Math.min(4, Number(count) || 2));
  return (
    <div className={"photo-grid n" + n}>
      {Array.from({ length: n }, (_, i) => {
        const full = `${base}/${id}/${i + 1}`;
        return <img key={i} loading="lazy" decoding="async" src={thumb ? `${full}?s=thumb` : full} alt={`${who ? who + "'s " : ""}photo ${i + 1}`} onClick={() => zoom(full)} />;
      })}
    </div>
  );
}

/** Password field with a show/hide eye. */
export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <input {...props} type={show ? "text" : "password"} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button type="button" className="pw-eye" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>
        <Icon n={show ? "eyeoff" : "eye"} size={19} />
      </button>
    </div>
  );
}
