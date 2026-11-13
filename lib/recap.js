import { pushGame } from "./push.js";
// End-of-week stat recap ("tochi was in the lead 48% of the week, dabere never took the lead, jeff never played")
// and "Hunter of the week" for PRIMAHUNT OFFICIAL. Both are part of the score card and survive the 7-day deletion.
import { q } from "./db.js";

const DAY = 864e5;

/** Replays the week's pips in time order (same tie-break as the leaderboard: equal pips → whoever got there first). */
export async function buildRecap(ch, rows) {
  const start = new Date(ch.start_at).getTime(), end = new Date(ch.end_at).getTime(), span = Math.max(1, end - start);
  const ids = new Set(rows.map((r) => r.id));
  const events = (await q(
    `SELECT pt.user_id, pt.points, pt.earned_at, pt.transaction_type, i.difficulty
       FROM point_transactions pt LEFT JOIN challenge_items i ON i.id=pt.item_id
      WHERE pt.challenge_id=$1 ORDER BY pt.earned_at, pt.id`, [ch.id])).filter((e) => ids.has(e.user_id));
  const pts = {}, reached = {}, lead = {}, finds = {}, extreme = {};
  let leader = null, changes = 0, prevT = start, firstFind = null;
  const top = () => {
    let best = null;
    for (const u of Object.keys(pts)) {
      if (pts[u] <= 0) continue;
      if (!best || pts[u] > pts[best] || (pts[u] === pts[best] && reached[u] < reached[best])) best = u;
    }
    return best;
  };
  for (const e of events) {
    const t = Math.min(end, Math.max(start, new Date(e.earned_at).getTime()));
    if (leader) lead[leader] = (lead[leader] || 0) + (t - prevT);
    prevT = t;
    const u = String(e.user_id);
    pts[u] = (pts[u] || 0) + e.points;
    reached[u] = new Date(e.earned_at).getTime();
    if (e.transaction_type === "approval") {
      finds[u] = (finds[u] || 0) + 1;
      if (e.difficulty === "extreme") extreme[u] = (extreme[u] || 0) + 1;
      if (!firstFind) firstFind = { uid: +u, after_ms: t - start };
    }
    const now = top();
    if (now !== leader) { if (leader && now) changes++; leader = now; }
  }
  if (leader) lead[leader] = (lead[leader] || 0) + (end - prevT);

  const played = new Set((await q(`SELECT DISTINCT s.user_id FROM submissions s JOIN challenge_items i ON i.id=s.item_id WHERE i.challenge_id=$1`, [ch.id])).map((r) => r.user_id));
  const scored = rows.filter((r) => r.points > 0);
  const leaders = Object.entries(lead).map(([u, ms]) => ({ uid: +u, pct: Math.round((ms / span) * 100) })).filter((x) => x.pct > 0).sort((a, b) => b.pct - a.pct);
  const mf = Object.entries(finds).sort((a, b) => b[1] - a[1]);
  const xt = Object.entries(extreme).sort((a, b) => b[1] - a[1]);
  return {
    winner: scored[0] ? { uid: scored[0].id, points: scored[0].points, margin: scored[1] ? scored[0].points - scored[1].points : null } : null,
    leaders,
    changes,
    never_led: scored.filter((r) => !lead[r.id]).map((r) => r.id),
    no_score: rows.filter((r) => r.points <= 0 && played.has(r.id)).map((r) => r.id),
    no_play: rows.filter((r) => r.points <= 0 && !played.has(r.id)).map((r) => r.id),
    first_find: firstFind,
    most_finds: mf[0] && (!mf[1] || mf[0][1] > mf[1][1]) ? { uid: +mf[0][0], n: mf[0][1] } : null,
    extreme: xt[0] ? { uid: +xt[0][0], n: xt[0][1] } : null,
    players: rows.length,
  };
}

const dur = (ms) => {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.round(ms / DAY);
  return `${d} day${d === 1 ? "" : "s"}`;
};
const list = (names) => (names.length <= 3 ? names.join(names.length === 2 ? " and " : ", ").replace(/, ([^,]*)$/, " and $1") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} other${names.length - 3 === 1 ? "" : "s"}`);

/** Turns stored ids into sentences, with today's nicknames (a deleted account reads "Deleted player"). */
export async function recapLines(data) {
  if (!data) return [];
  const ids = new Set([data.winner?.uid, data.first_find?.uid, data.most_finds?.uid, data.extreme?.uid, ...data.leaders.map((l) => l.uid), ...data.never_led, ...data.no_score, ...data.no_play].filter(Boolean));
  const nick = Object.fromEntries((await q(`SELECT id, nickname FROM users WHERE id = ANY($1::int[])`, [[...ids]])).map((r) => [r.id, r.nickname]));
  const n = (id) => nick[id] || "Deleted player";
  const out = [];
  if (data.winner) out.push(["👑", `${n(data.winner.uid)} won with ${data.winner.points} pips${data.winner.margin == null ? "" : data.winner.margin > 0 ? `, ${data.winner.margin} clear of second place` : ", level on pips but first to get there"}.`]);
  else out.push(["🫥", "Nobody scored this week."]);
  data.leaders.slice(0, 3).forEach((l, i) => out.push([i ? "⏱️" : "🔥", l.pct >= 99 ? `${n(l.uid)} led from start to finish.` : `${n(l.uid)} was in the lead ${l.pct}% of the week.`]));
  if (data.changes > 0) out.push(["🔄", `The lead changed hands ${data.changes} time${data.changes === 1 ? "" : "s"}.`]);
  if (data.never_led.length) out.push(["🙈", `${list(data.never_led.map(n))} never took the lead.`]);
  if (data.first_find) out.push(["⚡", `${n(data.first_find.uid)} got the first find, ${dur(data.first_find.after_ms)} in.`]);
  if (data.most_finds && data.most_finds.n > 1) out.push(["🎯", `${n(data.most_finds.uid)} found the most items (${data.most_finds.n}).`]);
  if (data.extreme) out.push(["💀", `${n(data.extreme.uid)} cracked ${data.extreme.n} extreme item${data.extreme.n === 1 ? "" : "s"}.`]);
  if (data.no_score.length) out.push(["😅", `${list(data.no_score.map(n))} tried but didn't score.`]);
  if (data.no_play.length) out.push(["😴", `${list(data.no_play.map(n))} never played.`]);
  return out.map(([icon, text]) => ({ icon, text }));
}

/** Called from refreshResults(): store the recap (only while submissions still exist) and keep the official hunt's Hunter of the week in sync. */
export async function updateRecapAndHunter(ch, rows) {
  const meta = (await q(`SELECT c.purged_at, g.is_official FROM challenges c JOIN groups g ON g.id=c.group_id WHERE c.id=$1`, [ch.id]))[0];
  if (!meta) return;
  if (!meta.purged_at) {
    const data = await buildRecap(ch, rows);
    await q(`INSERT INTO week_recaps (challenge_id, group_id, data) VALUES ($1,$2,$3)
             ON CONFLICT (challenge_id) DO UPDATE SET data=EXCLUDED.data, updated_at=now()`, [ch.id, ch.group_id, JSON.stringify(data)]);
  }
  if (!meta.is_official) return;
  const winner = rows[0] && rows[0].points > 0 ? rows[0].id : null;
  const cur = (await q(`SELECT user_id FROM hunter_awards WHERE challenge_id=$1`, [ch.id]))[0];
  if (!winner) { if (cur) await q(`DELETE FROM hunter_awards WHERE challenge_id=$1`, [ch.id]); return; }
  if (cur?.user_id === winner) return;
  await q(`INSERT INTO hunter_awards (challenge_id, user_id, week_number) VALUES ($1,$2,$3)
           ON CONFLICT (challenge_id) DO UPDATE SET user_id=EXCLUDED.user_id, awarded_at=now()`, [ch.id, winner, ch.week_number]);
  await q(`INSERT INTO notifications (user_id, group_id, type, title, message, link) VALUES ($1,$2,'hunter','Hunter of the week',$3,'/profile')`,
    [winner, ch.group_id, `🏅 You're the Hunter of the Week${ch.week_number ? ` for Week ${ch.week_number}` : ""} in PRIMAHUNT OFFICIAL! It's on your profile now.`]);
  await pushGame([winner], { title: "Hunter of the week 🏅", body: `You're the Hunter of the Week${ch.week_number ? ` for Week ${ch.week_number}` : ""} in PRIMAHUNT OFFICIAL!`, url: "/profile" });
}

/** The current Hunter of the week: winner of the most recent finished official week (skips deleted accounts). */
export async function currentHunter() {
  const h = (await q(
    `SELECT u.id, u.nickname, u.status, a.week_number FROM hunter_awards a JOIN challenges c ON c.id=a.challenge_id JOIN users u ON u.id=a.user_id
      ORDER BY c.end_at DESC LIMIT 1`))[0];
  return h && h.status === "active" ? { id: h.id, nickname: h.nickname, week_number: h.week_number } : null;
}
