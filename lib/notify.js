import { q } from "./db.js";
import { refreshResults } from "./game.js";
import { finishDuels } from "./duel.js";

/** 1v1 alerts aren't tied to a group (group_id stays NULL). */
export const DUEL_GROUP = { id: null, name: "1v1", settings: {} };

export const DEFAULT_SETTINGS = {
  notify_new_challenge: true,
  notify_submission: true,
  notify_approved: true,
  notify_rejected: true,
  notify_ending: true,
  notify_results: true,
  reminder_hours: 24,
  email_enabled: true,
};
export const withDefaults = (s) => ({ ...DEFAULT_SETTINGS, ...(s || {}) });

const appUrl = () => (process.env.APP_URL || process.env.URL || "").replace(/\/$/, "");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Email goes out through Resend (RESEND_API_KEY + EMAIL_FROM) or, failing that, any SMTP account such as Gmail (SMTP_USER + SMTP_PASS). */
export const emailConfigured = () => Boolean((process.env.RESEND_API_KEY && process.env.EMAIL_FROM) || (process.env.SMTP_USER && process.env.SMTP_PASS));

let smtp = null;
async function smtpTransport() {
  if (!smtp) {
    const { default: nodemailer } = await import("nodemailer");
    const port = Number(process.env.SMTP_PORT || 465);
    smtp = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS || "").replace(/\s+/g, "") },
    });
  }
  return smtp;
}

export async function sendEmails(messages) {
  if (!messages.length) return false;
  const key = process.env.RESEND_API_KEY, resendFrom = process.env.EMAIL_FROM;
  if (key && resendFrom) {
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100).map((m) => ({ from: resendFrom, to: [m.to], subject: m.subject, html: m.html }));
      try {
        const res = await fetch("https://api.resend.com/emails/batch", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify(chunk),
        });
        if (!res.ok) console.error("Email send failed", res.status, await res.text());
      } catch (e) {
        console.error("Email send error", e);
      }
    }
    return true;
  }
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const from = process.env.EMAIL_FROM || `Weekly Hunt <${process.env.SMTP_USER}>`;
    const t = await smtpTransport();
    // One message per person, so nobody ever sees anyone else's address.
    const results = await Promise.allSettled(messages.map((m) => t.sendMail({ from, to: m.to, subject: m.subject, html: m.html })));
    for (const r of results) if (r.status === "rejected") console.error("Email send error", r.reason?.message || r.reason);
    return true;
  }
  console.warn("Email not configured: set SMTP_USER + SMTP_PASS (Gmail) or RESEND_API_KEY + EMAIL_FROM");
  return false;
}
export const emailHtml = (text, link, label = "Open the hunt") => {
  const base = appUrl();
  return `<div style="font-family:Arial,sans-serif;font-size:16px"><p>${esc(text)}</p>${link && base ? `<p><a href="${base}${link}" style="background:#FFC800;color:#14110F;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">${label}</a></p>` : ""}</div>`;
};

/**
 * Notify specific members of ONE group. `group` = {id, name, settings}.
 * Honors that group's notification toggles. Never exposes anyone's email to anyone else.
 */
export async function notifyEach(group, type, list, link = "") {
  if (!list.length) return;
  const s = withDefaults(group.settings);
  if (s[`notify_${type}`] === false) return;
  const ids = list.map((l) => l.userId);
  await q(
    `INSERT INTO notifications (user_id, group_id, type, title, message, link)
     SELECT t.u, $3, $4, $5, t.m, $6 FROM unnest($1::int[], $2::text[]) AS t(u, m)`,
    [ids, list.map((l) => l.message), group.id, type, group.name, link]
  );
  if (s.email_enabled) {
    const users = await q(`SELECT id, email FROM users WHERE id = ANY($1::int[])`, [ids]);
    const emailOf = new Map(users.map((u) => [u.id, u.email]));
    await sendEmails(
      list.filter((l) => emailOf.get(l.userId)).map((l) => ({ to: emailOf.get(l.userId), subject: group.name, html: emailHtml(l.message, link) }))
    );
  }
}
export const notify = (group, type, userIds, message, link) => notifyEach(group, type, userIds.map((userId) => ({ userId, message })), link);

const activePlayers = (gid) => q(`SELECT user_id AS id FROM group_members WHERE group_id=$1 AND role='player' AND status='active'`, [gid]);

/** Scheduled (every 15 min) and after publishing: going live, ending reminders, finalizing weeks. */
export async function runLifecycle() {
  const started = await q(
    `UPDATE challenges c SET start_notified = true FROM groups g
      WHERE g.id = c.group_id AND g.status='active' AND c.status='published' AND c.start_at <= now() AND c.end_at > now() AND NOT c.start_notified
      RETURNING c.id, c.group_id, c.week_number, g.name, g.settings`
  );
  for (const c of started) {
    const players = await activePlayers(c.group_id);
    await notify({ id: c.group_id, name: c.name, settings: c.settings }, "new_challenge", players.map((p) => p.id),
      `🚨 ${c.name} — Week ${c.week_number ?? ""} is LIVE! You've got 7 days. Good luck.`, `/g/${c.group_id}/hunt`);
  }

  const ending = await q(
    `UPDATE challenges c SET end_notified = true FROM groups g
      WHERE g.id = c.group_id AND g.status='active' AND c.status='published' AND c.start_at <= now() AND c.end_at > now() AND NOT c.end_notified
        AND c.end_at <= now() + make_interval(hours => COALESCE((g.settings->>'reminder_hours')::int, 24))
      RETURNING c.id, c.group_id, g.name, g.settings, COALESCE((g.settings->>'reminder_hours')::int, 24) AS hrs`
  );
  for (const c of ending) {
    const players = await q(
      `SELECT gm.user_id AS id,
              (SELECT count(*) FROM challenge_items i WHERE i.challenge_id=$1 AND NOT EXISTS (
                 SELECT 1 FROM submissions s WHERE s.item_id=i.id AND s.user_id=gm.user_id AND s.status IN ('approved','pending')))::int AS remaining
         FROM group_members gm WHERE gm.group_id=$2 AND gm.role='player' AND gm.status='active'`,
      [c.id, c.group_id]
    );
    await notifyEach({ id: c.group_id, name: c.name, settings: c.settings }, "ending",
      players.filter((p) => p.remaining > 0).map((p) => ({ userId: p.id, message: `⏰ ${c.hrs} hours left in ${c.name}! You still have ${p.remaining} item${p.remaining === 1 ? "" : "s"} to complete.` })),
      `/g/${c.group_id}/hunt`);
  }

  const done = await q(
    `UPDATE challenges c SET finalized_at = now() FROM groups g
      WHERE g.id = c.group_id AND c.status='published' AND c.end_at <= now() AND c.finalized_at IS NULL
      RETURNING c.*, g.name AS group_name, g.settings AS group_settings`
  );
  for (const c of done) {
    await refreshResults(c);
    const players = await activePlayers(c.group_id);
    await notify({ id: c.group_id, name: c.group_name, settings: c.group_settings }, "results", players.map((p) => p.id),
      `🏆 ${c.group_name} Week ${c.week_number ?? ""} is complete! See who won ₦${Number(c.prize_amount).toLocaleString("en-NG")}.`, `/g/${c.group_id}/week/${c.id}`);
  }
  await runDuelLifecycle();
}

/** Finish 1v1s whose time is up and tell both players how it went. */
export async function runDuelLifecycle() {
  for (const d of await finishDuels()) {
    const msg = (uid) => (d.winner_id == null ? "🤝 Your 1v1 ended in a tie." : d.winner_id === uid ? "🏆 You won your 1v1!" : "Your 1v1 is over. You lost this one. Rematch?");
    await notifyEach(DUEL_GROUP, "duel", [d.creator_id, d.opponent_id].map((userId) => ({ userId, message: msg(userId) })), `/duel/${d.id}`);
  }
}
