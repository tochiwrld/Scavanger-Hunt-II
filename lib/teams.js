// Team vs: 2v2, 3v3 ... 6v6. Same rhythm as a 1v1, with teams:
// each team writes a list for the other, any teammate can hunt any item (it counts once for the team),
// and any member of the team that wrote an item can judge its photos. Most items found wins; ties go to whoever finished first.
import { q } from "./db.js";
import { REVIEW_GRACE_MINUTES } from "./duel.js";

export const TEAM_SIZES = [2, 3, 4, 5, 6];
export const TEAM_MAX_ITEMS = 15;
export const other = (side) => (side === "a" ? "b" : "a");

/** waiting (rival captain not in yet) | setup (filling teams, writing lists) | live | judging | finished | cancelled */
export function matchPhase(m) {
  if (m.status !== "live") return m.status;
  return new Date(m.end_at) > Date.now() ? "live" : "judging";
}

export async function teamScores(m) {
  if (m.status === "finished" && m.a_items != null) {
    return { a: { items: m.a_items, reached_at: m.a_reached_at }, b: { items: m.b_items, reached_at: m.b_reached_at } };
  }
  const rows = await q(`SELECT side, count(*)::int AS items, max(submitted_at) AS reached_at FROM team_submissions WHERE match_id=$1 AND status='approved' GROUP BY side`, [m.id]);
  const by = Object.fromEntries(rows.map((r) => [r.side, r]));
  const s = (k) => ({ items: by[k]?.items || 0, reached_at: by[k]?.reached_at || null });
  return { a: s("a"), b: s("b") };
}

function pickWinner(sc) {
  if (sc.a.items !== sc.b.items) return sc.a.items > sc.b.items ? "a" : "b";
  if (!sc.a.items) return null;
  const ta = new Date(sc.a.reached_at).getTime(), tb = new Date(sc.b.reached_at).getTime();
  return ta === tb ? null : ta < tb ? "a" : "b";
}

/** Close matches that are over: time up with nothing pending (pending photos auto-approve after the grace period), or both teams found everything. */
export async function finishTeamMatches() {
  await q(
    `UPDATE team_submissions s SET status='approved', reviewed_at=now() FROM team_matches m
      WHERE s.match_id=m.id AND s.status='pending' AND m.status='live' AND m.end_at <= now() - make_interval(mins => $1::int)`,
    [REVIEW_GRACE_MINUTES]
  );
  const done = await q(
    `UPDATE team_matches m SET status='finished', finished_at=now(), end_at=LEAST(m.end_at, now())
      WHERE m.status='live' AND (
        (m.end_at <= now() AND NOT EXISTS (SELECT 1 FROM team_submissions s WHERE s.match_id=m.id AND s.status='pending'))
        OR ((SELECT count(*) FROM team_submissions s WHERE s.match_id=m.id AND s.side='a' AND s.status='approved') >= m.item_count
            AND (SELECT count(*) FROM team_submissions s WHERE s.match_id=m.id AND s.side='b' AND s.status='approved') >= m.item_count)
      ) RETURNING *`
  );
  for (const m of done) {
    const sc = await teamScores({ ...m, status: "live" });
    m.winner_side = pickWinner(sc);
    await q(`UPDATE team_matches SET winner_side=$2, a_items=$3, b_items=$4, a_reached_at=$5, b_reached_at=$6 WHERE id=$1`,
      [m.id, m.winner_side, sc.a.items, sc.b.items, sc.a.reached_at, sc.b.reached_at]);
    m.members = await q(`SELECT user_id, side FROM team_members WHERE match_id=$1`, [m.id]);
  }
  return done;
}
