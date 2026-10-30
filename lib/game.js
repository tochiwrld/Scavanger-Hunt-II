import { q } from "./db.js";

export const DIFFICULTIES = ["easy", "medium", "hard", "extreme"];
export const TIE_RULE = "Tied on points? Whoever reached that score first ranks higher (server time of the approved submission that got them there).";

/** Africa/Lagos is UTC+1 all year. Default window: Monday 12:00 AM to Sunday 11:59:59 PM, Lagos time. */
export function defaultWindow(from = new Date()) {
  const H = 3600000;
  const lagos = new Date(from.getTime() + H);
  const dow = lagos.getUTCDay(); // 0 Sun .. 6 Sat (Lagos wall clock)
  const daysToMon = ((8 - dow) % 7) || 7;
  const monLagos = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate() + daysToMon);
  const start = new Date(monLagos - H);
  const end = new Date(start.getTime() + 7 * 86400000 - 1000);
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

export function phaseOf(c) {
  if (!c || c.status !== "published") return "draft";
  const now = Date.now();
  if (new Date(c.start_at) > now) return "upcoming";
  if (new Date(c.end_at) <= now) return "closed";
  return "active";
}

export async function getActive(gid) {
  return (await q(`SELECT * FROM challenges WHERE group_id=$1 AND status='published' AND start_at <= now() AND end_at > now() ORDER BY start_at DESC LIMIT 1`, [gid]))[0] || null;
}
export async function getUpcoming(gid) {
  return (await q(`SELECT * FROM challenges WHERE group_id=$1 AND status='published' AND start_at > now() ORDER BY start_at ASC LIMIT 1`, [gid]))[0] || null;
}
export async function getLastClosed(gid) {
  return (await q(`SELECT * FROM challenges WHERE group_id=$1 AND status='published' AND end_at <= now() ORDER BY end_at DESC LIMIT 1`, [gid]))[0] || null;
}
/** Always scoped by group: a challenge id from another group simply isn't found. */
export async function getChallenge(gid, cid) {
  return (await q(`SELECT * FROM challenges WHERE id=$1 AND group_id=$2`, [cid, gid]))[0] || null;
}

/** Group leaderboard for one challenge. Only this group's players; ties broken by earliest time the final score was reached. */
export async function leaderboard(gid, ch) {
  const closed = phaseOf(ch) === "closed";
  const rows = await q(
    `SELECT u.id, u.nickname,
            COALESCE(SUM(pt.points),0)::int AS points,
            MAX(pt.earned_at) AS reached_at,
            (COUNT(DISTINCT pt.item_id) FILTER (WHERE pt.transaction_type='approval'))::int AS items
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       LEFT JOIN point_transactions pt ON pt.user_id = u.id AND pt.challenge_id = $2 AND pt.group_id = $1
      WHERE gm.group_id = $1 AND gm.role = 'player' AND gm.joined_at < $3
        AND (gm.status = 'active' OR ($4::boolean AND EXISTS (SELECT 1 FROM point_transactions x WHERE x.user_id = u.id AND x.challenge_id = $2 AND x.group_id = $1)))
      GROUP BY u.id, u.nickname
      ORDER BY points DESC, MAX(pt.earned_at) ASC NULLS LAST, lower(u.nickname)`,
    [gid, ch.id, ch.end_at, closed]
  );
  let prev = null;
  return rows.map((r, i) => {
    const same = prev && prev.points === r.points && String(prev.reached_at) === String(r.reached_at);
    const out = { ...r, rank: same ? prev.rank : i + 1 };
    prev = out;
    return out;
  });
}

export async function standings(gid, ch, userId) {
  const rows = await leaderboard(gid, ch);
  const m = rows.find((r) => r.id === userId);
  let me = null;
  if (m) {
    const above = [...rows].reverse().find((r) => r.rank < m.rank);
    me = { rank: m.rank, points: m.points, items: m.items, above: above ? above.nickname : null, gap: above ? above.points - m.points + 1 : 0 };
  }
  return {
    rows: rows.map((r) => ({ rank: r.rank, nickname: r.nickname, points: r.points, items: r.items, reached_at: r.reached_at, me: r.id === userId })),
    me,
    total: rows.length,
    group_points: rows.reduce((a, r) => a + r.points, 0),
  };
}

export async function userItems(challengeId, userId) {
  const rows = await q(
    `SELECT i.id, i.title, i.description, i.instructions, i.difficulty, i.points, i.hint, (i.reference_image_key IS NOT NULL) AS has_reference,
            s.id AS sub_id, s.status AS sub_status, s.submitted_at, s.rejection_reason,
            (SELECT count(*) FROM submissions x WHERE x.user_id=$2 AND x.item_id=i.id AND x.status='rejected')::int AS rejections
       FROM challenge_items i
       LEFT JOIN LATERAL (
         SELECT * FROM submissions s WHERE s.user_id=$2 AND s.item_id=i.id
          ORDER BY (s.status='approved') DESC, (s.status='pending') DESC, s.submitted_at DESC LIMIT 1
       ) s ON true
      WHERE i.challenge_id=$1 ORDER BY i.display_order, i.id`,
    [challengeId, userId]
  );
  return rows.map((r, i) => ({
    id: r.id, number: i + 1, title: r.title, description: r.description, instructions: r.instructions,
    difficulty: r.difficulty, points: r.points, hint: r.hint, has_reference: r.has_reference,
    status: r.sub_status || "not_submitted", submission_id: r.sub_id, submitted_at: r.submitted_at,
    rejection_reason: r.sub_status === "rejected" ? r.rejection_reason : null, rejections: r.rejections,
  }));
}

/** Snapshot final results and keep the prize winner in sync (until the prize is marked paid). */
export async function refreshResults(ch) {
  const rows = await leaderboard(ch.group_id, ch);
  await q(`DELETE FROM weekly_results WHERE challenge_id=$1`, [ch.id]);
  if (rows.length) {
    await q(
      `INSERT INTO weekly_results (group_id, challenge_id, user_id, final_points, final_rank, reached_at)
       SELECT $1, $2, t.u, t.p, t.r, t.ra FROM unnest($3::int[], $4::int[], $5::int[], $6::timestamptz[]) AS t(u, p, r, ra)`,
      [ch.group_id, ch.id, rows.map((r) => r.id), rows.map((r) => r.points), rows.map((r) => r.rank), rows.map((r) => r.reached_at)]
    );
  }
  const winner = rows[0] && rows[0].points > 0 ? rows[0].id : null;
  const prize = (await q(`SELECT id, status FROM prizes WHERE challenge_id=$1`, [ch.id]))[0];
  if (!prize) {
    if (winner) await q(`INSERT INTO prizes (group_id, challenge_id, winner_user_id, amount) VALUES ($1,$2,$3,$4)`, [ch.group_id, ch.id, winner, ch.prize_amount]);
  } else if (prize.status === "pending") {
    await q(`UPDATE prizes SET winner_user_id=$2 WHERE id=$1`, [prize.id, winner]);
  }
}
