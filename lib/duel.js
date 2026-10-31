import { q } from "./db.js";

/** Time limits the creator can pick, in minutes: 30 min, 1 h, 3 h, 12 h, 1 day, 3 days, 7 days. */
export const DUEL_DURATIONS = [30, 60, 180, 720, 1440, 4320, 10080];
export const DUEL_MAX_ITEMS = 10;
/** After the timer ends, players have this long to judge photos that came in on time. Anything still pending is then approved. */
export const REVIEW_GRACE_MINUTES = 60;

/** waiting (link not accepted) | setup (writing lists) | live (timer running) | judging (timer over, photos pending) | finished | cancelled */
export function duelPhase(d) {
  if (d.status !== "live") return d.status;
  return new Date(d.end_at) > Date.now() ? "live" : "judging";
}

export const isPlayer = (d, uid) => d.creator_id === uid || d.opponent_id === uid;
export const opponentOf = (d, uid) => (d.creator_id === uid ? d.opponent_id : d.creator_id);

/** Approved items per player. Equal counts go to whoever reached that count first. */
export async function duelScores(d) {
  const rows = await q(
    `SELECT user_id, count(*)::int AS items, max(submitted_at) AS reached_at FROM duel_submissions WHERE duel_id=$1 AND status='approved' GROUP BY user_id`,
    [d.id]
  );
  const by = new Map(rows.map((r) => [r.user_id, r]));
  const s = (uid) => ({ items: by.get(uid)?.items || 0, reached_at: by.get(uid)?.reached_at || null });
  return { [d.creator_id]: s(d.creator_id), [d.opponent_id]: s(d.opponent_id) };
}

function pickWinner(d, sc) {
  const a = sc[d.creator_id], b = sc[d.opponent_id];
  if (a.items !== b.items) return a.items > b.items ? d.creator_id : d.opponent_id;
  if (!a.items) return null;
  const ta = new Date(a.reached_at).getTime(), tb = new Date(b.reached_at).getTime();
  return ta === tb ? null : ta < tb ? d.creator_id : d.opponent_id;
}

/** Close duels whose timer is over and whose photos are all judged (or whose review window ran out). Returns the duels it finished. */
export async function finishDuels() {
  await q(
    `UPDATE duel_submissions s SET status='approved', reviewed_at=now() FROM duels d
      WHERE s.duel_id=d.id AND s.status='pending' AND d.status='live' AND d.end_at <= now() - make_interval(mins => $1::int)`,
    [REVIEW_GRACE_MINUTES]
  );
  const done = await q(
    `UPDATE duels d SET status='finished', finished_at=now()
      WHERE d.status='live' AND d.end_at <= now() AND NOT EXISTS (SELECT 1 FROM duel_submissions s WHERE s.duel_id=d.id AND s.status='pending')
      RETURNING *`
  );
  for (const d of done) {
    d.winner_id = pickWinner(d, await duelScores(d));
    await q(`UPDATE duels SET winner_id=$2 WHERE id=$1`, [d.id, d.winner_id]);
  }
  return done;
}
