"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, burst, fmtDate, fmtMinutes, pad2 } from "../../../../lib/client.js";
import { useApp } from "../../../../components/Providers.js";
import Icon from "../../../../components/icons.js";
import ReviewCard from "../../../../components/ReviewCard.js";
import SubmitSheet from "../../../../components/SubmitSheet.js";
import FindPost from "../../../../components/FindPost.js";
import { Async, Btn, Countdown, Empty, ErrBox, Plate, Sheet, StatusPill, useApi, useForm } from "../../../../components/ui.js";

export default function Page() {
  const { id } = useParams();
  const st = useApi(`/duels/${id}`);
  const phase = st.data?.duel.phase;
  // Keep the room in sync with the other player (accepting, finishing their list, sending photos).
  useEffect(() => {
    if (!phase || phase === "finished" || phase === "cancelled") return undefined;
    const t = setInterval(() => { if (!document.hidden) st.reload(); }, 10000);
    return () => clearInterval(t);
  }, [phase, st.reload]);
  return <Async st={st}>{(d) => <Room d={d} reload={st.reload} />}</Async>;
}

const PHASE_LABEL = { waiting: "Waiting for opponent", setup: "Writing lists", live: "Live now", judging: "Time's up · judging", finished: "Final result" };

function Room({ d, reload }) {
  const { duel, me, them } = d;
  const { toast } = useApp();
  const [hunting, setHunting] = useState(null);
  const [picked, setPicked] = useState(null);
  const base = `/duels/${duel.id}`;
  if (duel.phase === "cancelled") return <Empty icon="🚫" title="This 1v1 was called off" text="Start a new one whenever you're ready."><Link className="btn" href="/duels">Back to 1v1</Link></Empty>;
  const started = ["live", "judging", "finished"].includes(duel.phase);
  // Your hunt while it's running; Finds once it's over. The player's own choice wins after that.
  const tab = picked || (duel.phase === "finished" ? "finds" : "hunt");
  const setTab = setPicked;
  return (
    <>
      <Link href="/duels" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon n="back" size={16} />All 1v1s</Link>
      <Plate>
        <div className={"eyebrow" + (duel.phase === "live" ? " live" : "")}>1v1 · {PHASE_LABEL[duel.phase] || duel.phase}</div>
        <div className="week">{me.nickname} <span style={{ color: "var(--muted-fg)" }}>vs</span> {them ? them.nickname : "???"}</div>
        <div className="meta">{duel.item_count} item{duel.item_count === 1 ? "" : "s"} each · {fmtMinutes(duel.minutes)} on the clock</div>
        {duel.phase === "live" ? <Countdown end={duel.end_at} onDone={reload} /> : null}
        {started ? (
          <div className="tiles">
            <div className="tile score"><div className="label">You found</div><div className="n">{me.score}<small>/ {duel.item_count}</small></div></div>
            <div className="tile rank"><div className="label">{them.nickname} found</div><div className="n">{them.score}<small>/ {duel.item_count}</small></div></div>
          </div>
        ) : null}
        {duel.phase === "judging" ? <p className="gap-note">Time's up. Judge the last photos — anything not judged by <b>{fmtDate(new Date(new Date(duel.end_at).getTime() + duel.grace_minutes * 60000))}</b> is approved automatically.</p> : null}
        {duel.phase === "finished" && duel.result === "won" ? <WinVideo className="win-inline" /> : null}
        {duel.phase === "finished" ? <div className="state-box earned" style={{ marginTop: 16, fontFamily: "var(--font-head)", textTransform: "uppercase", fontSize: 22, letterSpacing: "-.02em", ...(duel.result === "lost" ? { color: "var(--danger)", background: "color-mix(in oklch,var(--danger) 12%,var(--card))" } : duel.result === "tie" ? { color: "var(--warning)", background: "color-mix(in oklch,var(--warning) 12%,var(--card))" } : {}) }}>{duel.result === "won" ? "You won!" : duel.result === "lost" ? `${them.nickname} won` : "It's a tie"}</div> : null}
        <p className="muted" style={{ margin: "14px 0 0", fontSize: 13 }}>Most approved items wins. Tied? Whoever got there first wins.</p>
      </Plate>

      {duel.phase === "finished" && duel.result === "won" ? <WinOverlay id={duel.id} them={them.nickname} me={me.score} total={duel.item_count} /> : null}
      {duel.phase === "waiting" ? <Waiting duel={duel} reload={reload} /> : null}
      {duel.phase === "setup" ? <Setup d={d} reload={reload} /> : null}

      {started ? (
        <>
          <div className="tabs" role="tablist" aria-label="1v1 sections">
            <button role="tab" aria-selected={tab === "hunt"} className={"tab" + (tab === "hunt" ? " on" : "")} onClick={() => setTab("hunt")}>
              Your hunt{d.review.length ? <span className="n hot">{d.review.length}</span> : null}
            </button>
            <button role="tab" aria-selected={tab === "finds"} className={"tab" + (tab === "finds" ? " on" : "")} onClick={() => setTab("finds")}>
              Finds<span className="n">{d.finds.length}</span>
            </button>
          </div>

          {tab === "hunt" ? (
            <>
              {d.review.length ? (
                <>
                  <div className="sec-title"><h2>Judge {them.nickname}'s photos</h2></div>
                  {d.review.map((s) => <ReviewCard key={s.id} s={{ ...s, nickname: them.nickname, status: "pending" }} base={base} photoBase="/api/duel-photo" onChanged={reload} />)}
                </>
              ) : null}
              <div className="sec-title" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}><h2>Your hunt</h2><span className="muted">{them.nickname} wrote these for you. Send at least one photo for each; {them.nickname} judges them. Find everything first to win.</span></div>
              {duel.phase === "live" && me.score >= duel.item_count ? <div className="state-box earned" style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.4 }}>You found everything! The 1v1 ends as soon as {them.nickname} finishes or time runs out.</div> : null}
              {d.hunt.map((it) => <DuelItem key={it.id} it={it} canSubmit={duel.phase === "live"} onSubmit={setHunting} />)}
              <div className="sec-title"><h2>Your list for {them.nickname}</h2></div>
              {d.my_list.map((it) => <DuelItem key={it.id} it={it} theirs={them.nickname} />)}
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: 0 }}>Every approved find from both of you. Only you and {them.nickname} can see these.</p>
              {d.finds.length ? d.finds.map((f) => (
                <FindPost key={f.id} id={f.id} photos={f.photos} photoBase="/api/duel-photo" nickname={f.nickname} title={f.title} at={f.found_at} now={d.now} mine={f.mine}
                  badge={<span className={"st " + (f.mine ? "approved" : "pending")} style={{ alignSelf: "flex-start" }}>{f.mine ? "+1 you" : `+1 ${them.nickname}`}</span>} />
              )) : <div className="card empty" style={{ padding: "24px 18px" }}><div className="big">📸</div><h3>No finds yet</h3><p className="muted" style={{ margin: 0 }}>Approved photos from both of you show up here.</p></div>}
            </>
          )}
        </>
      ) : null}

      {hunting ? <SubmitSheet it={hunting} endpoint={`${base}/items/${hunting.id}/submit`} onClose={() => setHunting(null)} onDone={() => { setHunting(null); toast(`Sent! Waiting for ${them.nickname} to judge it.`, "good"); reload(); }} /> : null}
    </>
  );
}

/** The "YOU WIN" animation (converted from the GIF to a small looping video). */
function WinVideo({ className = "" }) {
  return (
    <video className={"win-video " + className} autoPlay muted loop playsInline poster="/img/you-win.jpg" aria-label="You win!">
      <source src="/img/you-win.webm" type="video/webm" />
      <source src="/img/you-win.mp4" type="video/mp4" />
    </video>
  );
}

/** Full-screen celebration the first time the winner opens a finished 1v1. Only ever rendered for the winner. */
function WinOverlay({ id, them, me, total }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem("won:" + id) === "1"; localStorage.setItem("won:" + id, "1"); } catch {}
    if (!seen) { setOpen(true); burst(); }
  }, [id]);
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  if (!open) return null;
  return (
    <div className="win-overlay" role="dialog" aria-modal="true" aria-label="You won the 1v1" onClick={() => setOpen(false)}>
      <div className="win-box" onClick={(e) => e.stopPropagation()}>
        <WinVideo />
        <h2>You beat {them}!</h2>
        <p className="muted" style={{ margin: "6px 0 18px" }}>{me}/{total} found. First to finish takes the win.</p>
        <button className="btn block" onClick={() => setOpen(false)}>Let's go<Icon n="arrow" size={18} /></button>
      </div>
    </div>
  );
}

function Waiting({ duel, reload }) {
  const { toast } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!duel.mine) return <Empty icon="⏳" title="Waiting to start" text="Hang tight." />;
  const link = `${window.location.origin}/vs/${duel.token}`;
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast("1v1 link copied", "good"); } catch { window.prompt("Copy this link:", link); } };
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: "1v1 on Hunt Week", text: "I challenge you to a 1v1 hunt!", url: link }); } catch {} } else copy(); };
  const cancel = async () => {
    if (!confirm("Call off this 1v1? The link will stop working.")) return;
    setBusy(true);
    try { await api(`/duels/${duel.id}/cancel`, { method: "POST" }); router.push("/duels"); } catch (e) { toast(e.message, "bad"); setBusy(false); reload(); }
  };
  return (
    <section className="card stack">
      <h2>Send your private link</h2>
      <p className="muted" style={{ margin: 0 }}>It works for <b style={{ color: "var(--fg)" }}>one person only</b>: the first person to accept it. After that, nobody else can use it.</p>
      <div className="inset mono" style={{ wordBreak: "break-all", fontSize: 13 }}>{link}</div>
      <button className="btn block" onClick={copy}><Icon n="copy" size={18} />Copy link</button>
      <button className="btn block ghost" onClick={share}><Icon n="share" size={18} />Share</button>
      <Btn busy={busy} className="block ghost" onClick={cancel} style={{ color: "var(--danger)" }}>Call it off</Btn>
    </section>
  );
}

function Setup({ d, reload }) {
  const { duel, me, them } = d;
  const { toast } = useApp();
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(null);
  const full = me.written >= duel.item_count;
  const add = useForm(async (v, f) => { await api(`/duels/${duel.id}/items`, { method: "POST", json: v }); f.reset(); reload(); });
  const act = async (name, fn) => { setBusy(name); try { await fn(); } catch (e) { toast(e.message, "bad"); } finally { setBusy(""); reload(); } };
  const ready = (on) => act("ready", async () => {
    const r = await api(`/duels/${duel.id}/ready`, { method: "POST", json: { ready: on } });
    if (r.started) { burst(); toast("Both lists are done. The timer has started!", "good"); }
  });
  const del = (it) => act("del" + it.id, () => api(`/duels/${duel.id}/items/${it.id}`, { method: "DELETE" }));
  const Who = ({ name, p }) => (
    <div className="inset row between">
      <b>{name}</b>
      {p.ready ? <span className="st approved"><Icon n="check" size={12} />Done</span> : <span className="st pending"><Icon n="pencil" size={12} />{p.written}/{duel.item_count} written</span>}
    </div>
  );
  return (
    <>
      <section className="card stack">
        <h2>Ready check</h2>
        <p className="muted" style={{ margin: 0 }}>The timer starts as soon as both lists are marked Done.</p>
        <Who name="You" p={me} />
        <Who name={them.nickname} p={them} />
      </section>

      <section className="card stack">
        <h2>Your list for {them.nickname}</h2>
        <p className="muted" style={{ margin: 0 }}>Write {duel.item_count} thing{duel.item_count === 1 ? "" : "s"} {them.nickname} has to find and photograph. They can't see your list until the timer starts, and you'll judge their photos.</p>
        {d.my_list.map((it) => (
          <div key={it.id} className="inset">
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div className="grow"><span className="mono c-mute" style={{ fontSize: 12, letterSpacing: ".1em" }}>ITEM {pad2(it.number)}</span><div style={{ fontWeight: 700, marginTop: 4 }}>{it.title}</div>{it.instructions ? <div className="muted" style={{ marginTop: 4 }}>{it.instructions}</div> : null}</div>
              {!me.ready ? <div className="row" style={{ gap: 4, flex: "none" }}>
                <button className="icon-btn" aria-label={`Edit item ${it.number}`} onClick={() => setEditing(it)}><Icon n="pencil" size={17} /></button>
                <button className="icon-btn" aria-label={`Remove item ${it.number}`} disabled={busy === "del" + it.id} onClick={() => del(it)}><Icon n="trash" size={17} /></button>
              </div> : null}
            </div>
          </div>
        ))}
        {!me.ready && !full ? (
          <form onSubmit={add.onSubmit} noValidate style={{ marginTop: 4 }}>
            <div className="field"><label htmlFor="dtitle">Item {me.written + 1} of {duel.item_count}</label><input id="dtitle" name="title" maxLength={160} placeholder="A yellow danfo bus" required /></div>
            <div className="field"><label htmlFor="dins">Photo instructions (optional)</label><input id="dins" name="instructions" maxLength={1000} placeholder="Show the whole bus with your thumb in the shot" /></div>
            <ErrBox error={add.error} />
            <Btn busy={add.busy} className="block ghost" type="submit"><Icon n="plus" size={18} />Add item</Btn>
          </form>
        ) : null}
        {me.ready
          ? <Btn busy={busy === "ready"} className="block ghost" onClick={() => ready(false)}><Icon n="pencil" size={18} />Edit my list</Btn>
          : <Btn busy={busy === "ready"} className="block" disabled={!full} onClick={() => ready(true)}><Icon n="check" size={18} />Done{full ? "" : ` (add ${duel.item_count - me.written} more)`}</Btn>}
        <Btn busy={busy === "cancel"} className="block ghost" style={{ color: "var(--danger)" }} onClick={() => confirm("Call off this 1v1?") && act("cancel", () => api(`/duels/${duel.id}/cancel`, { method: "POST" }))}>Call it off</Btn>
      </section>
      {editing ? <EditItem duel={duel} it={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
    </>
  );
}

function EditItem({ duel, it, onClose, onSaved }) {
  const form = useForm(async (v) => { await api(`/duels/${duel.id}/items/${it.id}`, { method: "PUT", json: v }); onSaved(); });
  return (
    <Sheet onClose={onClose}>
      <h2>Edit item {it.number}</h2>
      <form style={{ marginTop: 18 }} onSubmit={form.onSubmit} noValidate>
        <div className="field"><label htmlFor="etitle">Item</label><input id="etitle" name="title" maxLength={160} defaultValue={it.title} required /></div>
        <div className="field"><label htmlFor="eins">Photo instructions (optional)</label><textarea id="eins" name="instructions" maxLength={1000} defaultValue={it.instructions} /></div>
        <ErrBox error={form.error} />
        <Btn busy={form.busy} className="block" type="submit">Save item</Btn>
      </form>
    </Sheet>
  );
}

/** One item: on your hunt (with Submit) or on your own list (showing how your opponent is doing). */
function DuelItem({ it, canSubmit, onSubmit, theirs }) {
  return (
    <article className={`card item ${it.status}`} style={{ animation: "rise .3s both" }}>
      <div className="head"><span className="num">Item {pad2(it.number)}</span><StatusPill status={it.status} label={it.status === "approved" ? "Found" : undefined} /></div>
      <h3>{it.title}</h3>
      {it.instructions ? <p className="txt">{it.instructions}</p> : null}
      {theirs ? <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{theirs}'s progress on this one</p> : null}
      {!theirs && it.status === "rejected" ? <div className="reason" style={{ marginTop: 12 }}><b>Rejected:</b> {it.rejection_reason}</div> : null}
      {!theirs && it.status === "pending" ? <div className="state-box" style={{ marginTop: 14 }}>Photos sent · waiting to be judged</div> : null}
      {!theirs && canSubmit && (it.status === "not_submitted" || it.status === "rejected")
        ? <button className="btn block" style={{ marginTop: 14 }} onClick={() => onSubmit(it)}><Icon n="camera" size={18} />{it.status === "rejected" ? "Send new photos" : "Send photos"}</button> : null}
    </article>
  );
}
