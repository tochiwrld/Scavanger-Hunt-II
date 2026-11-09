// "NO FORGET YOUR HUNT O!" reminder emails.
// 1. Players in a hunt with a live week who haven't opened the app for NUDGE_ACTIVE_DAYS: at most one email every NUDGE_ACTIVE_DAYS.
// (The old 14-day "away" nudge is replaced by Pip's 30/60-day win-backs in lib/emails.js.)
// Opening the app resets the count. Only between 10:00 and 19:59 Lagos time. Users can switch these off (profile or the email's link).
import crypto from "node:crypto";
import { q } from "./db.js";
import { sendEmails, emailConfigured } from "./notify.js";
import { NUDGE_ACTIVE_DAYS } from "./shared.js";

const appUrl = () => (process.env.APP_URL || process.env.URL || "").replace(/\/$/, "");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** One-click unsubscribe signature. Its own HMAC context, so it can never be mistaken for a login token. */
export const unsubSig = (uid) => crypto.createHmac("sha256", process.env.SESSION_SECRET || "").update(`email-reminders-off:${uid}`).digest("base64url").slice(0, 32);
export const unsubOk = (uid, sig) => {
  const a = Buffer.from(String(sig || "")), b = Buffer.from(unsubSig(uid));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export async function liveHuntCount() {
  return (await q(
    `SELECT (SELECT count(*) FROM challenges c JOIN groups g ON g.id=c.group_id AND g.status='active' AND g.admin_left_at IS NULL
              WHERE c.status='published' AND c.start_at <= now() AND c.end_at > now())::int
          + (SELECT count(*) FROM duels WHERE status='live' AND end_at > now())::int AS n`))[0].n;
}

function email({ nickname, mine, total, uid }) {
  const base = appUrl();
  const names = mine.slice(0, 3).map((h) => `<b>${esc(h)}</b>`).join(", ") + (mine.length > 3 ? ` and ${mine.length - 3} more` : "");
  const yours = mine.length
    ? `<p style="margin:0 0 12px">You're in <b>${mine.length} live hunt${mine.length === 1 ? "" : "s"}</b> right now: ${names}. The list is waiting and the leaderboard is moving without you.</p>`
    : `<p style="margin:0 0 12px">We haven't seen you in a while. Your crew is still out there hunting.</p>`;
  return `<div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#16141f;color:#f4f2fb;padding:28px 22px;border-radius:16px;max-width:520px">
  <div style="font-size:18px;letter-spacing:-.5px;font-weight:800;color:#f4f2fb">Prima<span style="color:#FFD21F">Hunt</span></div>
  <h1 style="font-size:30px;line-height:1.1;margin:10px 0 16px;color:#FFD21F;text-transform:uppercase">NO FORGET YOUR HUNT O!</h1>
  <p style="margin:0 0 12px">Hi ${esc(nickname)},</p>
  ${yours}
  <div style="background:#24212f;border-radius:12px;padding:16px;margin:16px 0;text-align:center">
    <div style="font-size:40px;font-weight:bold;color:#FFD21F;line-height:1">${total}</div>
    <div style="font-size:14px;color:#c9c5d8;margin-top:6px">hunt${total === 1 ? "" : "s"} going on right now</div>
  </div>
  ${base ? `<p style="margin:20px 0"><a href="${base}/" style="background:#FFD21F;color:#16141f;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block">Jump back in</a></p>` : ""}
  <p style="font-size:12px;color:#9a96ab;margin:22px 0 0">You're getting this because you have a PrimaHunt account and haven't opened the app in a while.
  ${base ? `<a href="${base}/api/unsubscribe?u=${uid}&s=${unsubSig(uid)}" style="color:#9a96ab">Stop these reminders</a>, or turn them off in your profile.` : "Turn them off in your profile."}</p>
</div>`;
}

export async function runReminders() {
  if (!emailConfigured()) return { skipped: "email not configured" };
  const lagosHour = (new Date().getUTCHours() + 1) % 24;
  if (lagosHour < 10 || lagosHour >= 20) return { skipped: "outside 10:00-20:00 Lagos" };

  // Claim the users first (sets last_nudge_at), so overlapping cron runs never email anyone twice.
  const due = await q(
    `WITH live AS (
       SELECT gm.user_id, array_agg(DISTINCT g.name) AS hunts
         FROM group_members gm JOIN groups g ON g.id=gm.group_id AND g.status='active' AND g.admin_left_at IS NULL
           AND COALESCE((g.settings->>'email_enabled')::boolean, true)
         JOIN challenges c ON c.group_id=g.id AND c.status='published' AND c.start_at <= now() AND c.end_at > now()
        WHERE gm.status='active' AND gm.role='player'
        GROUP BY gm.user_id
     ), pick AS (
       SELECT u.id, true AS in_live
         FROM users u JOIN live ON live.user_id=u.id
        WHERE u.status='active' AND u.email_reminders
          AND u.last_seen_at < now() - make_interval(days => $1)
          AND (u.last_nudge_at IS NULL OR u.last_nudge_at < now() - make_interval(days => $1))
        ORDER BY u.last_seen_at LIMIT 40
        FOR UPDATE OF u SKIP LOCKED
     )
     UPDATE users u SET last_nudge_at=now(), nudge_count = u.nudge_count + (CASE WHEN pick.in_live THEN 0 ELSE 1 END)
       FROM pick LEFT JOIN live ON live.user_id=pick.id
      WHERE u.id=pick.id
      RETURNING u.id, u.nickname, u.email, COALESCE(live.hunts, '{}') AS hunts`,
    [NUDGE_ACTIVE_DAYS]
  );
  if (!due.length) return { sent: 0 };
  const total = await liveHuntCount();
  await sendEmails(due.map((u) => ({
    to: u.email,
    subject: u.hunts.length ? `NO FORGET YOUR HUNT O! ${u.hunts.length} live hunt${u.hunts.length === 1 ? "" : "s"} waiting` : `NO FORGET YOUR HUNT O! ${total} hunt${total === 1 ? " is" : "s are"} live`,
    html: email({ nickname: u.nickname, mine: u.hunts, total, uid: u.id }),
  })));
  return { sent: due.length };
}
