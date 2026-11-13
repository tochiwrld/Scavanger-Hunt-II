// Come-back push nudges, written in Pip's voice like the emails.
// Away 5 h → nudge 1, 10 h → nudge 2, 1 day → nudge 3. Opening the app resets the count (currentUser()).
// Only between 08:00 and 21:59 Lagos; if a step comes due at night, the latest due step goes out in the morning.
// Also sends anything waiting in push_outbox (one-off tests and announcements), at any hour.
import { q } from "./db.js";
import { pushTo } from "./push.js";
import { DAILY_ITEMS, lagosDay, dailyIndex } from "./shared.js";

const STAGES = [5, 10, 24]; // hours away
const lagosHour = () => (new Date().getUTCHours() + 1) % 24;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Pip's three come-back messages. `h` = a live hunt they're in (or null), `item` = today's daily item. */
export function nudgeCopy(stage, nickname, h, item) {
  const left = h ? Math.max(0, h.items - h.done) : 0;
  if (h && left > 0) {
    if (stage === 1) return { title: `Pip here, ${nickname} 👋`, body: `${h.name} is live and the board is moving. ${plural(left, "find")} still waiting for you. Snap one now.`, url: `/g/${h.gid}/hunt` };
    if (stage === 2) return { title: "NO FORGET YOUR HUNT O! 📸", body: `${plural(left, "item")} still open in ${h.name}. Snap now. Brag later.`, url: `/g/${h.gid}/hunt` };
    return { title: "Your hunt misses you 👀", body: `A whole day! Someone took your spot on the board in ${h.name}. Come take it back.`, url: `/g/${h.gid}/ranks` };
  }
  if (stage === 1) return { title: `Pip here, ${nickname} 👋`, body: `Today's daily item is ${item}. Find it and keep your streak alive 🔥`, url: "/daily" };
  if (stage === 2) return { title: "NO FORGET YOUR HUNT O! 📸", body: `Today's daily item is still waiting: ${item}. One photo, that's all.`, url: "/daily" };
  return { title: "Pip misses you 👀", body: "Your crew are hunting without you. Come back and snap something.", url: "/" };
}

async function sendOutbox() {
  const rows = await q(`UPDATE push_outbox SET sent_at=now() WHERE sent_at IS NULL AND created_at > now() - interval '1 day'
                        RETURNING id, user_id, title, body, url`);
  let phones = 0;
  for (const r of rows) {
    const n = await pushTo(r.user_id ? [r.user_id] : null, { title: r.title, body: r.body, url: r.url, tag: "pip-" + r.id }, "account").catch(() => 0);
    await q(`UPDATE push_outbox SET phones=$2 WHERE id=$1`, [r.id, n]);
    phones += n;
  }
  return { outbox: rows.length, outbox_phones: phones };
}

export async function runPushNudges() {
  const out = await sendOutbox().catch((e) => { console.error("push outbox", e); return { outbox_error: true }; });
  const hr = lagosHour();
  if (hr < 8 || hr >= 22) return { ...out, nudges: "outside 08:00-22:00 Lagos" };

  const users = await q(
    `SELECT u.id, u.nickname, u.push_nudge_stage AS stage, EXTRACT(EPOCH FROM now() - u.last_seen_at) / 3600 AS hrs
       FROM users u
      WHERE u.status='active' AND u.push_games AND u.last_seen_at < now() - interval '5 hours' AND u.push_nudge_stage < 3
        AND EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id=u.id)`
  );
  const due = users
    .map((u) => ({ ...u, next: STAGES.filter((h) => Number(u.hrs) >= h).length }))
    .filter((u) => u.next > u.stage);
  if (!due.length) return { ...out, nudged: 0 };

  // One live hunt per player: their friends' hunts before PRIMAHUNT OFFICIAL, then the one ending soonest.
  const hunts = await q(
    `SELECT DISTINCT ON (gm.user_id) gm.user_id, g.id AS gid, g.name,
            (SELECT count(*)::int FROM challenge_items i WHERE i.challenge_id=c.id) AS items,
            (SELECT count(*)::int FROM submissions s JOIN challenge_items i ON i.id=s.item_id
              WHERE i.challenge_id=c.id AND s.user_id=gm.user_id AND s.status IN ('approved','pending')) AS done
       FROM group_members gm JOIN groups g ON g.id=gm.group_id JOIN challenges c ON c.group_id=g.id
      WHERE gm.user_id = ANY($1::int[]) AND gm.status='active' AND gm.role='player' AND g.status='active' AND g.admin_left_at IS NULL
        AND c.status='published' AND c.start_at <= now() AND c.end_at > now()
      ORDER BY gm.user_id, g.is_official ASC, c.end_at ASC`,
    [due.map((u) => u.id)]
  );
  const huntOf = new Map(hunts.map((h) => [h.user_id, h]));
  const item = DAILY_ITEMS[dailyIndex(lagosDay()) % DAILY_ITEMS.length];

  let nudged = 0, phones = 0;
  for (const u of due) {
    // Claim the step first so two cron runs can never send the same nudge twice.
    const claimed = await q(`UPDATE users SET push_nudge_stage=$2 WHERE id=$1 AND push_nudge_stage=$3 RETURNING id`, [u.id, u.next, u.stage]);
    if (!claimed[0]) continue;
    const msg = nudgeCopy(u.next, u.nickname, huntOf.get(u.id) || null, item);
    const n = await pushTo([u.id], { ...msg, tag: "nudge" }, "games").catch(() => 0);
    nudged += 1; phones += n;
  }
  return { ...out, nudged, phones };
}
