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
import { WinVideo, WinOverlay } from "../../../../components/Win.js";
import { ShareResult } from "../../../../components/Share.js";
import { Async, Btn, Countdown, Empty, ErrBox, Plate, Sheet, StatusPill, useApi, useForm } from "../../../../components/ui.js";

export default function Page() {
  const { id } = useParams();
  const st = useApi(`/teams/${id}`);
  const phase = st.data?.match.phase;
  useEffect(() => {
    if (!phase || phase === "finished" || phase === "cancelled") return undefined;
    const t = setInterval(() => { if (!document.hidden) st.reload(); }, 10000);
    return () => clearInterval(t);
  }, [phase, st.reload]);
  return <Async st={st}>{(d) => <Room d={d} reload={st.reload} />}</Async>;
}

const PHASE_LABEL = { waiting: "Waiting for a rival", setup: "Filling teams · writing lists", live: "Live now", judging: "Time's up · judging", finished: "Final result" };

function Room({ d, reload }) {
  const { match: m, us, them } = d;
  const { toast } = useApp();
  const [hunting, setHunting] = useState(null);
  const [picked, setPicked] = useState(null);
  const base = `/teams/${m.id}`;
  if (m.phase === "cancelled") return <Empty icon="🚫" title="This match was called off" text="Start a new one whenever you're ready."><Link className="btn" href="/teams">Back to Team vs</Link></Empty>;
  const started = ["live", "judging", "finished"].includes(m.phase);
  const tab = picked || (m.phase === "finished" ? "finds" : "hunt");
  const vs = `${m.size}v${m.size}`;
  const share = m.phase === "finished" ? {
    text: m.result === "won" ? `${us.name} just beat ${them.name} ${us.score}–${them.score} in a ${vs} on PrimaHunt 🏆`
      : m.result === "lost" ? `${them.name} edged ${us.name} ${them.score}–${us.score} in a ${vs} on PrimaHunt. We'll be back 😤`
      : `${us.name} vs ${them.name} ended in a ${us.score}–${them.score} tie in our ${vs} on PrimaHunt 🤝`,
    card: { kicker: `Team vs · ${vs}`, title: m.result === "won" ? `${us.name} won` : m.result === "lost" ? `${them.name} won` : "Dead tie", big: `${us.score}–${them.score}`, line: `${us.name} vs ${them.name}`, sub: `${m.item_count} item${m.item_count === 1 ? "" : "s"} per team · most finds wins` },
  } : null;
  return (
    <>
      <Link href="/teams" className="link" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon n="back" size={16} />All team matches</Link>
      <Plate>
        <div className={"eyebrow" + (m.phase === "live" ? " live" : "")}>{vs} · {PHASE_LABEL[m.phase] || m.phase}</div>
        <div className="week">{us.name} <span style={{ color: "var(--muted-fg)" }}>vs</span> {them.name}</div>
        <div className="meta">You're on {us.name}{m.captain ? " (captain)" : ""} · {m.item_count} item{m.item_count === 1 ? "" : "s"} per team · {fmtMinutes(m.minutes)} on the clock</div>
        {m.phase === "live" ? <Countdown end={m.end_at} onDone={reload} /> : null}
        {started ? (
          <div className="tiles">
            <div className="tile score"><div className="label">Your team found</div><div className="n">{us.score}<small>/ {m.item_count}</small></div></div>
            <div className="tile rank"><div className="label">{them.name} found</div><div className="n">{them.score}<small>/ {m.item_count}</small></div></div>
          </div>
        ) : null}
        {m.phase === "judging" ? <p className="gap-note">Time's up. Judge the last photos — anything not judged by <b>{fmtDate(new Date(new Date(m.end_at).getTime() + m.grace_minutes * 60000))}</b> is approved automatically.</p> : null}
        {m.phase === "finished" && m.result === "won" ? <WinVideo className="win-inline" /> : null}
        {m.phase === "finished" ? <div className="state-box earned" style={{ marginTop: 16, fontFamily: "var(--font-head)", textTransform: "uppercase", fontSize: 22, letterSpacing: "-.02em", ...(m.result === "lost" ? { color: "var(--danger)", background: "color-mix(in oklch,var(--danger) 12%,var(--card))" } : m.result === "tie" ? { color: "var(--warning)", background: "color-mix(in oklch,var(--warning) 12%,var(--card))" } : {}) }}>{m.result === "won" ? "Your team won!" : m.result === "lost" ? `${them.name} won` : "It's a tie"}</div> : null}
        {share ? <ShareResult {...share} label={m.result === "won" ? "Share the win" : "Share your result"} /> : null}
        {m.purged ? <p className="gap-note">The photos and lists from this match were deleted {m.retain_days} days after it ended. The score card is kept.</p> : null}
        <p className="muted" style={{ margin: "14px 0 0", fontSize: 13 }}>Most approved items wins. Tied? Whichever team got there first wins.</p>
      </Plate>

      {share ? <WinOverlay storageKey={(m.result === "won" ? "teamwon:" : "teamres:") + m.id} result={m.result} share={share}
        title={m.result === "won" ? "Your team won!" : m.result === "lost" ? `${them.name} won this one` : "It's a tie!"}
        line={m.result === "won" ? `${us.score}/${m.item_count} found. Take a bow, ${us.name}.` : m.result === "lost" ? `${us.score}–${them.score}. Regroup and run it back.` : `${us.score}–${them.score}. Nobody blinked.`} /> : null}

      <Teams d={d} reload={reload} />
      {m.phase === "waiting" || m.phase === "setup" ? <Links d={d} reload={reload} /> : null}
      {m.phase === "waiting" || m.phase === "setup" ? <Setup d={d} reload={reload} /> : null}

      {started ? (
        <>
          <div className="tabs" role="tablist" aria-label="Match sections">
            <button role="tab" aria-selected={tab === "hunt"} className={"tab" + (tab === "hunt" ? " on" : "")} onClick={() => setPicked("hunt")}>
              Your hunt{d.review.length ? <span className="n hot">{d.review.length}</span> : null}
            </button>
            <button role="tab" aria-selected={tab === "finds"} className={"tab" + (tab === "finds" ? " on" : "")} onClick={() => setPicked("finds")}>
              Finds<span className="n">{d.finds.length}</span>
            </button>
          </div>
          {tab === "hunt" ? (
            <>
              {d.review.length ? (
                <>
                  <div className="sec-title"><h2>Judge {them.name}'s photos</h2></div>
                  <p className="muted" style={{ margin: 0 }}>Anyone on your team can judge these.</p>
                  {d.review.map((s) => <ReviewCard key={s.id} s={{ ...s, status: "pending" }} base={base} photoBase="/api/team-photo" onChanged={reload} />)}
                </>
              ) : null}
              <div className="sec-title" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}><h2>Your team's hunt</h2><span className="muted">{them.name} wrote these. Anyone on your team can send proof for any item; it counts once for the team.</span></div>
              {m.phase === "live" && us.score >= m.item_count ? <div className="state-box earned" style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.4 }}>Your team found everything! The match ends as soon as {them.name} finishes or time runs out.</div> : null}
              {d.hunt.map((it) => <TeamItem key={it.id} it={it} canSubmit={m.phase === "live"} onSubmit={setHunting} />)}
              <div className="sec-title"><h2>Your list for {them.name}</h2></div>
              {d.my_list.map((it) => <TeamItem key={it.id} it={it} theirs={them.name} />)}
            </>
          ) : (
            <>
              <p className="muted" style={{ margin: 0 }}>Every approved find from both teams. Only players in this match can see these.</p>
              {d.finds.length ? d.finds.map((f) => (
                <FindPost key={f.id} id={f.id} photos={f.photos} photoBase="/api/team-photo" nickname={f.nickname} title={f.title} at={f.found_at} now={d.now} mine={f.mine}
                  badge={<span className={"st " + (f.ours ? "approved" : "pending")} style={{ alignSelf: "flex-start" }}>{f.ours ? `+1 ${us.name}` : `+1 ${them.name}`}</span>} />
              )) : <div className="card empty" style={{ padding: "24px 18px" }}><div className="big">📸</div><h3>No finds yet</h3><p className="muted" style={{ margin: 0 }}>Approved photos from both teams show up here.</p></div>}
            </>
          )}
        </>
      ) : null}

      {hunting ? <SubmitSheet it={hunting} endpoint={`${base}/items/${hunting.id}/submit`} onClose={() => setHunting(null)} onDone={() => { setHunting(null); toast(`Sent! Waiting for ${them.name} to judge it.`, "good"); reload(); }} /> : null}
    </>
  );
}

function Teams({ d, reload }) {
  const { match: m, us, them } = d;
  const [naming, setNaming] = useState(false);
  const canName = m.captain && ["waiting", "setup"].includes(m.phase);
  const Side = ({ t }) => (
    <div className="inset">
      <div className="row between" style={{ marginBottom: 8 }}>
        <b className="row" style={{ gap: 6 }}>{t.name}{t === us && canName ? <button className="icon-btn" style={{ width: 30, height: 30 }} aria-label="Rename your team" onClick={() => setNaming(true)}><Icon n="pencil" size={15} /></button> : null}</b>
        <span className="muted" style={{ fontSize: 13 }}>{t.members.length}/{m.size}{["waiting", "setup"].includes(m.phase) ? (t.ready ? " · ✅ ready" : ` · ${t.written}/${m.item_count} written`) : ""}</span>
      </div>
      {t.members.length ? t.members.map((p, i) => (
        <div key={i} className="row" style={{ gap: 8, padding: "3px 0" }}>
          <span>{p.captain ? "👑" : "•"}</span><span>{p.nickname}{p.me ? " (you)" : ""}</span>{p.captain ? <span className="muted" style={{ fontSize: 12 }}>captain</span> : null}
        </div>
      )) : <span className="muted">Waiting for a captain</span>}
      {Array.from({ length: Math.max(0, m.size - t.members.length) }).map((_, i) => <div key={"e" + i} className="muted" style={{ padding: "3px 0" }}>○ open spot</div>)}
    </div>
  );
  return (
    <section className="card stack">
      <h2>Teams</h2>
      {canName && !us.custom ? <button className="card mist flat" style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => setNaming(true)}>🏷️ <b>Name your team.</b> You're “{us.name}” for now. Tap to pick a name before the timer starts.</button> : null}
      <Side t={us} />
      <Side t={them} />
      {naming ? <NameTeam m={m} current={us.custom ? us.name : ""} onClose={() => setNaming(false)} onSaved={() => { setNaming(false); reload(); }} /> : null}
    </section>
  );
}

function NameTeam({ m, current, onClose, onSaved }) {
  const { toast } = useApp();
  const form = useForm(async (v) => { const r = await api(`/teams/${m.id}/name`, { method: "PUT", json: { name: v.name } }); toast(`You're now “${r.name}”`, "good"); onSaved(); });
  return (
    <Sheet onClose={onClose}>
      <h2>Name your team</h2>
      <form style={{ marginTop: 18 }} onSubmit={form.onSubmit} noValidate>
        <div className="field"><label htmlFor="tnm">Team name</label><input id="tnm" name="name" maxLength={24} defaultValue={current} placeholder="e.g. Lekki Lions" autoFocus autoComplete="off" /><div className="muted">2 to 24 characters. Everyone in the match sees it. Leave it empty to go back to Team A/B.</div></div>
        <ErrBox error={form.error} />
        <Btn busy={form.busy} className="block" type="submit">Save name</Btn>
      </form>
    </Sheet>
  );
}

function ShareLink({ title, link, text, note }) {
  const { toast } = useApp();
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast("Link copied", "good"); } catch { window.prompt("Copy this link:", link); } };
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: "PrimaHunt Team vs", text, url: link }); } catch {} } else copy(); };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <h3>{title}</h3>
      <p className="muted" style={{ margin: 0 }}>{note}</p>
      <div className="inset mono" style={{ wordBreak: "break-all", fontSize: 13 }}>{link}</div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn grow" onClick={copy}><Icon n="copy" size={18} />Copy</button>
        <button className="btn grow ghost" onClick={share}><Icon n="share" size={18} />Share</button>
      </div>
    </div>
  );
}

function Links({ d, reload }) {
  const { match: m, us } = d;
  const { toast } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const leave = async () => {
    if (!confirm("Leave this team?")) return;
    setBusy(true);
    try { await api(`/teams/${m.id}/leave`, { method: "POST" }); router.push("/teams"); } catch (e) { toast(e.message, "bad"); setBusy(false); reload(); }
  };
  const cancel = async () => {
    if (!confirm("Call off this match for everyone? The links will stop working.")) return;
    setBusy(true);
    try { await api(`/teams/${m.id}/cancel`, { method: "POST" }); router.push("/teams"); } catch (e) { toast(e.message, "bad"); setBusy(false); reload(); }
  };
  return (
    <section className="card stack">
      {m.rival_token ? <ShareLink title="1. Send the rival link" link={`${origin}/t/${m.rival_token}`} text={`I challenge your team to a ${m.size}v${m.size}!`}
        note="Send this to the other team's captain. It works for one person only: whoever accepts first captains the other team." /> : null}
      {m.mate_token ? <ShareLink title={`${m.rival_token ? "2. " : ""}Bring in your teammates`} link={`${origin}/t/${m.mate_token}`} text={`Join my team for a ${m.size}v${m.size} on PrimaHunt!`}
        note={`Only for ${us.name}. ${m.size - us.members.length} spot${m.size - us.members.length === 1 ? "" : "s"} left. The link stops working once the team is full.`} /> : null}
      {!m.mate_token ? <p className="muted" style={{ margin: 0 }}>✅ {us.name} is full.</p> : null}
      {m.captain ? <Btn busy={busy} className="block ghost" onClick={cancel} style={{ color: "var(--danger)" }}>Call off the match</Btn>
        : <Btn busy={busy} className="block ghost" onClick={leave}>Leave this team</Btn>}
    </section>
  );
}

function Setup({ d, reload }) {
  const { match: m, us, them } = d;
  const { toast } = useApp();
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(null);
  const full = us.written >= m.item_count;
  const teamFull = us.members.length >= m.size;
  const add = useForm(async (v, f) => { await api(`/teams/${m.id}/items`, { method: "POST", json: v }); f.reset(); reload(); });
  const act = async (name, fn) => { setBusy(name); try { await fn(); } catch (e) { toast(e.message, "bad"); } finally { setBusy(""); reload(); } };
  const ready = (on) => act("ready", async () => {
    const r = await api(`/teams/${m.id}/ready`, { method: "POST", json: { ready: on } });
    if (r.started) { burst(); toast("Both teams are ready. The timer has started!", "good"); }
  });
  const del = (it) => act("del" + it.id, () => api(`/teams/${m.id}/items/${it.id}`, { method: "DELETE" }));
  return (
    <>
      <section className="card stack">
        <h2>Your team's list for {them.name}</h2>
        <p className="muted" style={{ margin: 0 }}>Write {m.item_count} thing{m.item_count === 1 ? "" : "s"} {them.name} has to find. Anyone on your team can add or edit items until your captain taps Done. {them.name} can't see the list until the timer starts, and your team judges their photos.</p>
        {d.my_list.map((it) => (
          <div key={it.id} className="inset">
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div className="grow"><span className="mono c-mute" style={{ fontSize: 12, letterSpacing: ".1em" }}>ITEM {pad2(it.number)}</span><div style={{ fontWeight: 700, marginTop: 4 }}>{it.title}</div>{it.instructions ? <div className="muted" style={{ marginTop: 4 }}>{it.instructions}</div> : null}</div>
              {!us.ready ? <div className="row" style={{ gap: 4, flex: "none" }}>
                <button className="icon-btn" aria-label={`Edit item ${it.number}`} onClick={() => setEditing(it)}><Icon n="pencil" size={17} /></button>
                <button className="icon-btn" aria-label={`Remove item ${it.number}`} disabled={busy === "del" + it.id} onClick={() => del(it)}><Icon n="trash" size={17} /></button>
              </div> : null}
            </div>
          </div>
        ))}
        {!us.ready && !full ? (
          <form onSubmit={add.onSubmit} noValidate style={{ marginTop: 4 }}>
            <div className="field"><label htmlFor="ttitle">Item {us.written + 1} of {m.item_count}</label><input id="ttitle" name="title" maxLength={160} placeholder="A yellow danfo bus" required /></div>
            <div className="field"><label htmlFor="tins">Photo instructions (optional)</label><input id="tins" name="instructions" maxLength={1000} placeholder="Show the whole bus" /></div>
            <ErrBox error={add.error} />
            <Btn busy={add.busy} className="block ghost" type="submit"><Icon n="plus" size={18} />Add item</Btn>
          </form>
        ) : null}
        {m.captain ? (
          us.ready
            ? <Btn busy={busy === "ready"} className="block ghost" onClick={() => ready(false)}><Icon n="pencil" size={18} />Edit list</Btn>
            : <Btn busy={busy === "ready"} className="block" disabled={!full || !teamFull || m.phase !== "setup"} onClick={() => ready(true)}><Icon n="check" size={18} />
                {m.phase !== "setup" ? "Done (waiting for a rival)" : !teamFull ? `Done (need ${m.size - us.members.length} more player${m.size - us.members.length === 1 ? "" : "s"})` : full ? "Done" : `Done (add ${m.item_count - us.written} more)`}</Btn>
        ) : <p className="muted" style={{ margin: 0 }}>{us.ready ? "Your captain marked the list Done." : "Your captain taps Done when the list and team are complete."}</p>}
      </section>
      {editing ? <EditItem m={m} it={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} /> : null}
    </>
  );
}

function EditItem({ m, it, onClose, onSaved }) {
  const form = useForm(async (v) => { await api(`/teams/${m.id}/items/${it.id}`, { method: "PUT", json: v }); onSaved(); });
  return (
    <Sheet onClose={onClose}>
      <h2>Edit item {it.number}</h2>
      <form style={{ marginTop: 18 }} onSubmit={form.onSubmit} noValidate>
        <div className="field"><label htmlFor="tetitle">Item</label><input id="tetitle" name="title" maxLength={160} defaultValue={it.title} required /></div>
        <div className="field"><label htmlFor="teins">Photo instructions (optional)</label><textarea id="teins" name="instructions" maxLength={1000} defaultValue={it.instructions} /></div>
        <ErrBox error={form.error} />
        <Btn busy={form.busy} className="block" type="submit">Save item</Btn>
      </form>
    </Sheet>
  );
}

function TeamItem({ it, canSubmit, onSubmit, theirs }) {
  return (
    <article className={`card item ${it.status}`} style={{ animation: "rise .3s both" }}>
      <div className="head"><span className="num">Item {pad2(it.number)}</span><StatusPill status={it.status} label={it.status === "approved" ? "Found" : undefined} /></div>
      <h3>{it.title}</h3>
      {it.instructions ? <p className="txt">{it.instructions}</p> : null}
      {it.by && it.status !== "not_submitted" ? <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{it.status === "approved" ? "Found" : "Sent"} by {it.by}</p> : null}
      {theirs ? <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>{theirs}'s progress on this one</p> : null}
      {!theirs && it.status === "rejected" ? <div className="reason" style={{ marginTop: 12 }}><b>Rejected:</b> {it.rejection_reason}</div> : null}
      {!theirs && it.status === "pending" ? <div className="state-box" style={{ marginTop: 14 }}>Photos sent · waiting to be judged</div> : null}
      {!theirs && canSubmit && (it.status === "not_submitted" || it.status === "rejected")
        ? <button className="btn block" style={{ marginTop: 14 }} onClick={() => onSubmit(it)}><Icon n="camera" size={18} />{it.status === "rejected" ? "Send new photos" : "Send photos"}</button> : null}
    </article>
  );
}
