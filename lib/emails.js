// Pip's emails. Every email is short, has one button and sounds like Pip wrote it.
// Rules: sender "Pip from PrimaHunt", subject <= 45 chars, preview 40-90 chars, under 90 words, one call to action,
// footer with the tagline, email settings and (for game emails) a one-tap unsubscribe.
// Account emails (welcome, password reset, invites) always send. Game emails (weekly drop, midweek, last call, results,
// win-backs) respect users.email_reminders and the hunt's "Send emails too" setting, and only go out 10:00-19:59 Lagos.
import { q } from "./db.js";
import { sendEmails, emailConfigured } from "./notify.js";
import { leaderboard } from "./game.js";
import { unsubSig } from "./reminders.js";
import { RETAIN_DAYS } from "./shared.js";

export const SENDER_NAME = "Pip from PrimaHunt";
const TAGLINE = "Hunt it. Snap it. Win the week.";
const appUrl = () => (process.env.APP_URL || process.env.URL || "https://primahunt.com").replace(/\/$/, "");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const list = (xs) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

const TZ = "Africa/Lagos";
export const lagosDate = (d, opts) => new Date(d).toLocaleString("en-NG", { timeZone: TZ, ...opts });
const deadlineText = (d) => lagosDate(d, { weekday: "long", hour: "numeric", minute: "2-digit" }).replace(/\s?(am|pm)$/i, (m) => " " + m.trim().toUpperCase());
const dayText = (d) => lagosDate(d, { weekday: "long", day: "numeric", month: "short" });

/** Keep subjects at 45 characters or fewer by trimming the variable part (a hunt title, a name), never the copy. */
export function fitSubject(make, value, max = 45) {
  let v = String(value ?? "");
  let s = make(v);
  while (s.length > max && v.length > 3) { v = v.slice(0, -2).trimEnd(); s = make(v + "…"); }
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** The one Pip layout: preview text, short paragraphs, one yellow button, sign-off, footer. */
export function pipEmail({ preview, heading, paras = [], button, after = "", ps, signoff = true, uid = null }) {
  const base = appUrl();
  const href = button.href.startsWith("http") ? button.href : base + button.href;
  const p = (t) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#f4f2fb">${t}</p>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"></head>
<body style="margin:0;padding:0;background:#0e0d14">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preview)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<div style="padding:20px 12px">
<div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#16141f;color:#f4f2fb;padding:28px 24px;border-radius:18px;max-width:520px;margin:0 auto">
  <div style="font-size:20px;letter-spacing:-.6px;font-weight:800;color:#f4f2fb;margin-bottom:18px">Prima<span style="color:#FFD21F">Hunt</span></div>
  ${heading ? `<h1 style="font-size:26px;line-height:1.15;margin:0 0 16px;color:#FFD21F;letter-spacing:-.5px">${heading}</h1>` : ""}
  ${paras.map(p).join("\n  ")}
  <p style="margin:22px 0"><a href="${esc(href)}" style="background:#FFD21F;color:#16141f;padding:13px 22px;border-radius:12px;text-decoration:none;font-weight:bold;display:inline-block;font-size:16px">${esc(button.label)}</a></p>
  ${after}
  ${signoff ? p(typeof signoff === "string" ? signoff : "Happy hunting,<br>Pip and the PrimaHunt team") : ""}
  ${ps ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#c9c5d8">P.S. ${ps}</p>` : ""}
  <div style="border-top:1px solid #2c2939;margin-top:22px;padding-top:16px;font-size:12px;line-height:1.6;color:#9a96ab">
    <div style="color:#FFD21F;font-weight:bold;margin-bottom:6px">${TAGLINE}</div>
    <a href="${base}/profile" style="color:#9a96ab">Email settings</a>${uid ? ` · <a href="${base}/api/unsubscribe?u=${uid}&s=${unsubSig(uid)}" style="color:#9a96ab">Unsubscribe from game emails</a>` : ""} · <a href="${base}/privacy" style="color:#9a96ab">Privacy</a>
  </div>
</div></div></body></html>`;
}

/* ---------------- account emails (always sent) ---------------- */

export function welcomeEmail(nickname) {
  return {
    subject: "You're in. Time to hunt.",
    html: pipEmail({
      preview: "Your crew can't win without you. Here's how PrimaHunt works.",
      paras: [
        `Hey ${esc(nickname)},`,
        "Welcome to PrimaHunt, the weekly scavenger hunt for you.",
        "Here's how it works. A new hunt drops every Monday. You race against others to find each item and snap the proof. The best haul wins the week, bragging rights included.",
        "Your first move: start a Hunt Group or join one. A hunt with friends beats a hunt alone.",
      ],
      button: { label: "Start your Hunt Group", href: "/start" },
      ps: "Your phone camera is the only equipment you need.",
    }),
  };
}

export function resetEmail(nickname, link, hours = 1) {
  return {
    subject: "Reset your PrimaHunt password",
    html: pipEmail({
      preview: "No jokes this time, just a link to choose a new password.",
      paras: [
        `Hi ${esc(nickname)},`,
        `We got a request to reset your password. Tap below to choose a new one. The link expires in ${plural(hours, "hour")}.`,
        "Didn't ask for this? You can safely ignore this email. Your password won't change.",
      ],
      button: { label: "Reset password", href: link },
      signoff: false,
    }),
  };
}

export function inviteEmail({ inviter, hunt, count, link, live }) {
  return {
    subject: fitSubject((v) => `${v} wants you on their Hunt Group`, inviter),
    html: pipEmail({
      preview: live ? `The hunt is live right now. Don't be last to join ${hunt}.` : "Next hunt drops soon. Don't be last to join.",
      paras: [
        `<b>${esc(inviter)}</b> wants you in <b>${esc(hunt)}</b> on PrimaHunt.`,
        `Every week, your Hunt Group gets a list of things to find. You snap them, the pips add up, and the best haul wins the week. ${esc(hunt)} already has ${plural(count, "hunter")}. Your spot is waiting.`,
      ],
      button: { label: fitSubject((v) => `Join ${v}`, hunt, 32), href: link },
    }),
  };
}

/* ---------------- game emails (cron) ---------------- */

const inWindow = () => { const h = (new Date().getUTCHours() + 1) % 24; return h >= 10 && h < 20; };

/** Players who get game emails for one hunt: active players, active accounts, game emails switched on. */
const recipients = (gid) => q(
  `SELECT u.id, u.nickname, u.email FROM group_members gm JOIN users u ON u.id=gm.user_id
    WHERE gm.group_id=$1 AND gm.role='player' AND gm.status='active' AND u.status='active' AND u.email_reminders`, [gid]);

/** Each player's progress in one challenge. */
async function progress(cid, uid) {
  return (await q(
    `SELECT count(*) FILTER (WHERE s.status='approved')::int AS found, count(*) FILTER (WHERE s.status IN ('approved','pending'))::int AS sent
       FROM submissions s JOIN challenge_items i ON i.id=s.item_id WHERE i.challenge_id=$1 AND s.user_id=$2`, [cid, uid]))[0];
}
const openItems = (cid, uid) => q(
  `SELECT i.title, i.points FROM challenge_items i WHERE i.challenge_id=$1 AND NOT EXISTS (
     SELECT 1 FROM submissions s WHERE s.item_id=i.id AND s.user_id=$2 AND s.status IN ('approved','pending'))
   ORDER BY i.points, i.display_order, i.id`, [cid, uid]);

/** Weeks in a row this player scored in this hunt, counting finished weeks before `cid`. */
async function weekStreak(gid, cid, uid) {
  const rows = await q(
    `SELECT c.id, EXISTS (SELECT 1 FROM point_transactions pt WHERE pt.challenge_id=c.id AND pt.user_id=$3 AND pt.points > 0) AS scored
       FROM challenges c WHERE c.group_id=$1 AND c.status='published' AND c.id <> $2 AND c.end_at < now() ORDER BY c.end_at DESC LIMIT 52`, [gid, cid, uid]);
  let n = 0;
  for (const r of rows) { if (!r.scored) break; n++; }
  return n;
}

const nextDrop = async (gid) => {
  const n = (await q(`SELECT start_at FROM challenges WHERE group_id=$1 AND status='published' AND start_at > now() ORDER BY start_at LIMIT 1`, [gid]))[0];
  return n ? lagosDate(n.start_at, { weekday: "long" }) : "Monday";
};

/**
 * Challenges whose email step is due. A step stays open for 3 days after its first run, so anyone Gmail turned away
 * is retried on the next run; `email_log` makes sure nobody gets the same email twice.
 */
async function claim(col, where) {
  const rows = await q(
    `SELECT c.*, g.name AS group_name, g.is_official FROM challenges c JOIN groups g ON g.id=c.group_id
      WHERE g.status='active' AND g.admin_left_at IS NULL AND c.status='published'
        AND (c.${col} IS NULL OR c.${col} > now() - interval '3 days')
        AND COALESCE((g.settings->>'email_enabled')::boolean, true) AND ${where}
      ORDER BY c.id`);
  if (rows.length) await q(`UPDATE challenges SET ${col}=now() WHERE id = ANY($1::int[]) AND ${col} IS NULL`, [rows.map((r) => r.id)]);
  return rows;
}

/** Each cron run sends for at most ~40 seconds (the function limit is 60); the rest go on the next run, 15 minutes later. */
let deadline = 0;
const TIME_BUDGET_MS = 40_000;
const timeLeft = () => Date.now() < deadline;

/**
 * Send each email at most once per person. A row is reserved (sent_at NULL) just before sending, stamped on success and
 * removed on failure. If a run is cut off mid-send, the stale reservation is cleared by a later run and retried.
 */
async function deliver(kind, ref, messages) {
  let sent = 0;
  for (const m of messages) {
    if (!timeLeft()) break;
    const got = await q(`INSERT INTO email_log (user_id, kind, ref) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING user_id`, [m.uid, kind, ref]);
    if (!got.length) continue;
    const [ok] = await sendEmails([{ to: m.to, subject: m.subject, html: m.html }]);
    if (ok) { await q(`UPDATE email_log SET sent_at=now() WHERE user_id=$1 AND kind=$2 AND ref=$3`, [m.uid, kind, ref]); sent++; }
    else await q(`DELETE FROM email_log WHERE user_id=$1 AND kind=$2 AND ref=$3`, [m.uid, kind, ref]);
  }
  return sent;
}

/** Only people who haven't had (or aren't being sent) this email yet. */
async function notYet(kind, ref, users) {
  if (!users.length) return users;
  const done = new Set((await q(`SELECT user_id FROM email_log WHERE kind=$1 AND ref=$2 AND user_id = ANY($3::int[])`, [kind, ref, users.map((u) => u.id)])).map((r) => r.user_id));
  return users.filter((u) => !done.has(u.id));
}

/** 5. The weekly drop: when a challenge goes live. */
async function weeklyDrop() {
  let sent = 0;
  for (const c of await claim("drop_emailed_at", "c.start_at <= now() AND c.end_at > now() AND c.start_at > now() - interval '3 days'")) {
    const items = await q(`SELECT title FROM challenge_items WHERE challenge_id=$1 ORDER BY display_order, id`, [c.id]);
    if (!items.length) continue;
    const n = items.length, peek = items.slice(0, 3).map((i) => `<b>${esc(i.title)}</b>`), rest = n - peek.length;
    const users = await notYet("drop", c.id, await recipients(c.group_id));
    sent += await deliver("drop", c.id, users.map((u) => ({
      uid: u.id, to: u.email,
      subject: fitSubject((v) => `New hunt: ${v}`, c.title),
      html: pipEmail({
        uid: u.id,
        preview: `${plural(n, "find")}. 7 days. ${c.group_name} is live and the board is empty.`,
        heading: `The hunt is live, ${esc(u.nickname)}.`,
        paras: [
          `<b>${esc(c.title)}</b>: ${plural(n, "find")}, closes ${deadlineText(c.end_at)}.`,
          `A sneak peek: ${list(peek)}.${rest > 0 ? ` And ${rest} more waiting for you.` : ""}`,
          "Hunt for glory and rank up. The board is watching.",
        ],
        button: { label: "See the full hunt", href: `/g/${c.group_id}/hunt` },
      }),
    })));
  }
  return sent;
}

/** 6 + 11. Midweek nudge (or the streak email for regulars who haven't snapped yet this week). */
async function midweek() {
  let sent = 0;
  for (const c of await claim("mid_emailed_at", "c.drop_emailed_at IS NOT NULL AND now() >= c.start_at + (c.end_at - c.start_at) * 0.45 AND now() < c.end_at - interval '30 hours'")) {
    const n = (await q(`SELECT count(*)::int AS n FROM challenge_items WHERE challenge_id=$1`, [c.id]))[0].n;
    if (!n) continue;
    const board = await leaderboard(c.group_id, c);
    const leader = board[0] && board[0].points > 0 ? board[0] : null;
    const msgs = [];
    for (const u of await notYet("mid", c.id, await recipients(c.group_id))) {
      const pr = await progress(c.id, u.id);
      const me = board.find((r) => r.id === u.id);
      const streak = pr.sent === 0 ? await weekStreak(c.group_id, c.id, u.id) : 0;
      if (streak >= 2) {
        msgs.push({ uid: u.id, to: u.email, subject: `${streak} weeks in a row`, html: pipEmail({
          uid: u.id, preview: "Your streak is on fire. Don't let it cool.",
          heading: `${streak} weeks straight.`,
          paras: [`You're officially a regular in ${esc(c.group_name)}, ${esc(u.nickname)}.`, "Keep it alive with one snap before Sunday night. That's all it takes."],
          button: { label: "Keep my streak", href: `/g/${c.group_id}/hunt` } }) });
        continue;
      }
      let paras;
      if (pr.found === 0) {
        const easy = (await openItems(c.id, u.id))[0];
        paras = [`Halfway through the week, ${esc(u.nickname)}.`, `Zero finds so far. That's not a problem, that's a plot twist.${easy ? ` Start with the easiest one: <b>${esc(easy.title)}</b>.` : ""}`];
      } else if (leader && leader.id === u.id) {
        paras = [`Halfway through the week, ${esc(u.nickname)}. You've snapped ${pr.found} of ${n} finds.`, `You lead the board with ${me.points} pips. Everyone's coming for you. Keep the gap.`];
      } else {
        paras = [`Halfway through the week, ${esc(u.nickname)}. You've snapped ${pr.found} of ${n} finds.`,
          leader ? `${esc(leader.nickname)} leads the board with ${leader.points} pips. You're ${leader.points - (me?.points || 0)} pips behind. Very catchable.` : "Nobody has scored yet. First to the board sets the pace."];
      }
      msgs.push({ uid: u.id, to: u.email, subject: "Hump day? Hunt day.", html: pipEmail({
        uid: u.id,
        preview: pr.found ? `You've found ${pr.found} of ${n}. Your fellow hunters are catching up.` : `You've found 0 of ${n}. Plenty of time for a comeback.`,
        paras, button: { label: "Snap your next find", href: `/g/${c.group_id}/hunt` } }) });
    }
    sent += await deliver("mid", c.id, msgs);
    if (msgs.length) await q(`UPDATE users SET last_nudge_at=now() WHERE id = ANY($1::int[])`, [msgs.map((m) => m.uid)]);
  }
  return sent;
}

/** 7. Last call: the final day, only for players with finds still open. */
async function lastCall() {
  let sent = 0;
  for (const c of await claim("last_emailed_at", "now() >= c.end_at - interval '14 hours' AND now() < c.end_at - interval '1 hour'")) {
    const n = (await q(`SELECT count(*)::int AS n FROM challenge_items WHERE challenge_id=$1`, [c.id]))[0].n;
    if (!n) continue;
    const board = await leaderboard(c.group_id, c);
    const top = board[0]?.points || 0;
    const hours = Math.max(1, Math.round((new Date(c.end_at) - Date.now()) / 36e5));
    const msgs = [];
    for (const u of await notYet("last", c.id, await recipients(c.group_id))) {
      const open = await openItems(c.id, u.id);
      if (!open.length) continue;
      const pr = await progress(c.id, u.id);
      const me = board.find((r) => r.id === u.id);
      const gap = top - (me?.points || 0);
      const names = open.slice(0, 3).map((i) => `<b>${esc(i.title)}</b>`);
      msgs.push({ uid: u.id, to: u.email, subject: `Last call: ${plural(hours, "hour")} left`, html: pipEmail({
        uid: u.id, preview: "Snap now. Brag later. The hunt closes tonight.",
        heading: `The hunt closes tonight at ${lagosDate(c.end_at, { hour: "numeric", minute: "2-digit" }).toUpperCase()}.`,
        paras: [
          `You've got ${pr.found} of ${n} in ${esc(c.group_name)}. Still open: ${list(names)}${open.length > 3 ? ` and ${open.length - 3} more` : ""}.`,
          gap > 0 ? `You are ${gap} pips from the top, and every snap counts.` : top > 0 ? "You're on top right now. One more snap makes it safer." : "Nobody has scored yet. One snap puts you on top.",
          "Future you will be grateful. Present you has been told.",
        ],
        button: { label: "Finish the hunt", href: `/g/${c.group_id}/hunt` } }) });
    }
    sent += await deliver("last", c.id, msgs);
    if (msgs.length) await q(`UPDATE users SET last_nudge_at=now() WHERE id = ANY($1::int[])`, [msgs.map((m) => m.uid)]);
  }
  return sent;
}

/** 8-10, 12. Results once the board is truly final (nothing waiting for review, or the review window is over). */
async function results() {
  let sent = 0;
  const due = await claim("results_emailed_at",
    `c.finalized_at IS NOT NULL AND (NOT EXISTS (SELECT 1 FROM submissions s JOIN challenge_items i ON i.id=s.item_id WHERE i.challenge_id=c.id AND s.status='pending')
       OR c.end_at < now() - make_interval(days => ${Number(RETAIN_DAYS)})) AND c.end_at > now() - interval '30 days'`);
  for (const c of due) {
    const board = await leaderboard(c.group_id, c);
    const win = board[0] && board[0].points > 0 ? board[0] : null;
    if (!win) continue; // nobody scored: no results emails
    const fotw = (await q(
      `SELECT i.title, u.nickname FROM submissions s JOIN challenge_items i ON i.id=s.item_id JOIN users u ON u.id=s.user_id
        WHERE i.challenge_id=$1 AND s.status='approved' AND u.status <> 'deleted' ORDER BY i.points DESC, s.reviewed_at ASC LIMIT 1`, [c.id]))[0];
    const next = await nextDrop(c.group_id);
    const results = `/g/${c.group_id}/week/${c.id}`;
    const msgs = [];
    for (const u of await notYet("results", c.id, await recipients(c.group_id))) {
      const me = board.find((r) => r.id === u.id);
      const pr = await progress(c.id, u.id);
      if (me && me.id === win.id) {
        msgs.push({ uid: u.id, to: u.email, subject: "You won the week", html: pipEmail({
          uid: u.id, preview: `Gold looks good on you. Top Hunter of ${c.group_name}.`,
          heading: `Top Hunter. That's you, ${esc(u.nickname)}.`,
          paras: [`${win.points} pips, ${plural(win.items, "find")} and one very nervous crew. You've earned the right to gloat. Gloat responsibly.`,
            `Rematch drops ${next}, and they're coming for you.`],
          button: { label: "Share my win card", href: results } }) });
      } else if (me && me.points > 0 && me.rank <= 3) {
        const best = (await q(`SELECT i.title, i.points FROM submissions s JOIN challenge_items i ON i.id=s.item_id WHERE i.challenge_id=$1 AND s.user_id=$2 AND s.status='approved' ORDER BY i.points DESC, s.reviewed_at LIMIT 1`, [c.id, u.id]))[0];
        msgs.push({ uid: u.id, to: u.email, subject: `So close. Rematch ${next}.`.slice(0, 45), html: pipEmail({
          uid: u.id, preview: "Next week is a clean slate. The top spot is very gettable.",
          paras: [`You finished #${me.rank} in ${esc(c.group_name)} this week, ${win.points - me.points} pips off the top.${best ? ` Your best snap was <b>${esc(best.title)}</b>, which scored ${best.points} pips. That one deserved a medal.` : ""}`,
            "New hunt, new board, no grudges. (Some grudges.)"],
          button: { label: "Join the rematch", href: `/g/${c.group_id}` } }) });
      } else if (pr.sent === 0 && (!me || me.points === 0)) {
        msgs.push({ uid: u.id, to: u.email, subject: "Your Hunt Group played without you", html: pipEmail({
          uid: u.id, preview: `${win.nickname} found ${plural(win.items, "thing")} this week in ${c.group_name}.`.slice(0, 90),
          heading: "No judgment. Okay, a little.",
          paras: [`${esc(c.group_name)} hunted this week and ${esc(win.nickname)} took it with ${plural(win.items, "find")}.`, `A new one drops on ${next}. Set a reminder so you're first in line.`],
          button: { label: `Remind me ${next}`, href: `/g/${c.group_id}` } }) });
      } else {
        msgs.push({ uid: u.id, to: u.email, subject: fitSubject((v) => `The Reveal: who won ${v}?`, c.title), html: pipEmail({
          uid: u.id, preview: "The board is final. Brace yourself.",
          heading: "The hunt is closed and the board is final.",
          paras: [`Top Hunter: <b>${esc(win.nickname)}</b> with ${win.points} pips.`,
            me ? `Your result: #${me.rank} in ${esc(c.group_name)} with ${me.points} pips.` : `Your result: no pips this week in ${esc(c.group_name)}.`,
            fotw ? `Find of the week: <b>${esc(fotw.title)}</b>, snapped by ${esc(fotw.nickname)}.` : "",
            `Next hunt drops ${next}. Rest up.`].filter(Boolean),
          button: { label: "See the full board", href: results } }) });
      }
    }
    sent += await deliver("results", c.id, msgs);
  }
  return sent;
}

/** 13-14. Win-backs for accounts away 30 and 60 days. Coming back resets the stage. */
async function winBacks() {
  const due = await q(
    `UPDATE users u SET winback_stage = u.winback_stage + 1, last_nudge_at=now()
      WHERE u.id IN (SELECT id FROM users WHERE status='active' AND email_reminders AND (
              (winback_stage = 0 AND last_seen_at < now() - interval '30 days') OR
              (winback_stage = 1 AND last_seen_at < now() - interval '60 days' AND last_nudge_at < now() - interval '14 days'))
            ORDER BY last_seen_at LIMIT 5 FOR UPDATE SKIP LOCKED)
      RETURNING u.id, u.nickname, u.email, u.winback_stage, u.last_seen_at`);
  const msgs = [];
  for (const u of due) {
    const days = Math.floor((Date.now() - new Date(u.last_seen_at)) / 864e5);
    if (u.winback_stage === 2) {
      msgs.push({ to: u.email, subject: "Last call from Pip", html: pipEmail({
        uid: u.id, preview: "One more nudge, then we'll leave you alone. Promise.",
        heading: "Pip here. We'll stop pestering you after this one.",
        paras: ["If you want back in, your crew and your pips are still here. If not, you can unsubscribe below. No hard feelings. Pip will be fine. Pip will be totally fine."],
        button: { label: "Take me back", href: "/" } }) });
      continue;
    }
    const g = (await q(
      `SELECT g.id, g.name,
              (SELECT count(*) FROM challenges c WHERE c.group_id=g.id AND c.status='published' AND c.start_at > $2)::int AS hunts,
              (SELECT count(*) FROM submissions s WHERE s.group_id=g.id AND s.status='approved' AND s.reviewed_at > $2)::int AS finds
         FROM group_members gm JOIN groups g ON g.id=gm.group_id AND g.status='active'
        WHERE gm.user_id=$1 AND gm.status='active' ORDER BY g.is_official, gm.joined_at DESC LIMIT 1`, [u.id, u.last_seen_at]))[0];
    msgs.push({ to: u.email, subject: "Your Hunt Group misses you", html: pipEmail({
      uid: u.id, preview: "Someone took your spot on the board. Come take it back.",
      paras: [g
        ? `It's been ${days} days since your last snap, ${esc(u.nickname)}. Since then, ${plural(g.hunts, "hunt")} ${g.hunts === 1 ? "has" : "have"} dropped, ${esc(g.name)} has found ${plural(g.finds, "thing")}, and someone has taken your spot on the board.`
        : `It's been ${days} days since your last snap, ${esc(u.nickname)}. Hunts have dropped, finds have been snapped, and someone has taken your spot on the board.`,
        "The new hunt is live. Come and take it back."],
      button: { label: "Back to the hunt", href: g ? `/g/${g.id}` : "/" } }) });
  }
  let sent = 0;
  for (const m of msgs) { if ((await sendEmails([m]))[0]) sent++; }
  return sent;
}


/* ---------------- "Add PrimaHunt to your home screen" campaign ---------------- */
// One email to every active player with game emails on who hasn't opened PrimaHunt from a home screen yet,
// then a Thursday reminder to those who still haven't. Same email_log guard: nobody gets either one twice.
const HS_REF = 1; // campaign number in email_log.ref
const HS_START = Date.parse("2026-11-13T09:00:00Z");
const HS_UNTIL = HS_START + 21 * 864e5;

const stepCard = (title, img, alt, steps) => `
  <div style="background:#201e2b;border:1px solid #2c2939;border-radius:16px;padding:18px;margin:0 0 14px">
    <div style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#FFD21F;margin:0 0 12px">${title}</div>
    <img src="${appUrl()}${img}" width="200" alt="${esc(alt)}" style="display:block;width:200px;max-width:100%;height:auto;border:0;border-radius:14px;margin:0 auto 14px">
    ${steps.map((t, i) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border-collapse:collapse"><tr>
      <td style="vertical-align:top;padding:0 10px 0 0"><div style="width:24px;height:24px;line-height:24px;border-radius:12px;background:#FFD21F;color:#16141f;font-weight:800;font-size:13px;text-align:center">${i + 1}</div></td>
      <td style="vertical-align:top;font-size:15px;line-height:1.45;color:#f4f2fb">${t}</td></tr></table>`).join("")}
  </div>`;

export function homescreenEmail(u) {
  const name = esc(u.nickname);
  const cards = `
  <h2 style="font-size:20px;line-height:1.2;margin:8px 0 14px;color:#f4f2fb">Add it in 30 seconds</h2>
  ${stepCard("On iPhone (Safari)", "/img/email/add-iphone.png", "Safari's Share menu with Add to Home Screen highlighted", [
    "Open PrimaHunt in <b>Safari</b>.",
    "Tap the <b>Share</b> button at the bottom of the screen.",
    "Scroll down and tap <b>Add to Home Screen</b>.",
    "Tap <b>Add</b>. You'll see the PrimaHunt icon with your other apps.",
  ])}
  ${stepCard("On Android (Chrome)", "/img/email/add-android.png", "Chrome's menu with Add to Home screen highlighted", [
    "Open PrimaHunt in <b>Chrome</b>.",
    "Tap the <b>three dots</b> at the top right.",
    "Tap <b>Add to Home screen</b> (or <b>Install app</b>).",
    "Tap <b>Add</b>. Done.",
  ])}
  <p style="margin:6px 0 14px;font-size:16px;line-height:1.5;color:#f4f2fb">Open it from your home screen, and you're in hunt mode.</p>`;
  return {
    subject: "First to open wins. Get PrimaHunt on your home screen",
    html: pipEmail({
      uid: u.id,
      preview: "No download. No app store. Just one tap on your home screen.",
      paras: [
        `Hey ${name},`,
        "The hunt drops every Monday. Your crew is already racing. Don't lose time digging for the link.",
        "Add PrimaHunt to your home screen and it opens like an app. No app store, no download, no storage drama. It takes about 30 seconds.",
        "<b>Why bother?</b>",
        "• <b>One tap to play.</b> The hunt is right there with your other apps.<br>• <b>Snap faster.</b> Open, snap, done, while the find is still in front of you.<br>• <b>Never miss a drop.</b> Get a nudge when a new hunt lands or the clock is running out.",
      ],
      button: { label: "Open PrimaHunt", href: "/?from=email-homescreen" },
      after: cards,
      ps: "Hunting with friends? Forward this to your crew. The first one to add it gets a head start.",
    }),
  };
}

export function homescreenReminderEmail(u) {
  return {
    subject: "Still searching for the link?",
    html: pipEmail({
      uid: u.id,
      preview: "One tap and it's on your home screen.",
      paras: [
        `Hey ${esc(u.nickname)},`,
        "Quick one. If you haven't added PrimaHunt to your home screen yet, it takes 30 seconds and saves you hunting for the link every Monday.",
        "Open PrimaHunt, then use <b>Share</b>, then <b>Add to Home Screen</b> on iPhone, or the <b>three dots</b>, then <b>Add to Home screen</b> on Android.",
      ],
      button: { label: "Show me how", href: "/profile?install=1" },
      signoff: "Happy hunting,<br>Pip",
    }),
  };
}

const hsRecipients = (extra = "") => q(
  `SELECT u.id, u.nickname, u.email FROM users u
    WHERE u.status='active' AND u.email_reminders AND u.installed_at IS NULL ${extra}
    ORDER BY u.id LIMIT 200`);

async function homescreenCampaign() {
  if (Date.now() < HS_START || Date.now() > HS_UNTIL) return 0;
  const users = await notYet("homescreen", HS_REF, await hsRecipients());
  return deliver("homescreen", HS_REF, users.map((u) => ({ uid: u.id, to: u.email, ...homescreenEmail(u) })));
}

/** Thursday (Lagos) reminder for people who got the first email 2+ days ago and still haven't added PrimaHunt. */
async function homescreenReminder() {
  if (Date.now() < HS_START || Date.now() > HS_UNTIL) return 0;
  if (new Date(Date.now() + 3600e3).getUTCDay() !== 4) return 0;
  const users = await notYet("homescreen_reminder", HS_REF, await hsRecipients(
    `AND EXISTS (SELECT 1 FROM email_log l WHERE l.user_id=u.id AND l.kind='homescreen' AND l.ref=${HS_REF} AND l.sent_at < now() - interval '2 days')`));
  return deliver("homescreen_reminder", HS_REF, users.map((u) => ({ uid: u.id, to: u.email, ...homescreenReminderEmail(u) })));
}

/** Called by the cron after the lifecycle. Each step is claimed in the database, so it's safe to run every 15 minutes. */
export async function runEmails() {
  if (!emailConfigured()) return { skipped: "email not configured" };
  if (!inWindow()) return { skipped: "outside 10:00-20:00 Lagos" };
  const out = {};
  deadline = Date.now() + TIME_BUDGET_MS;
  // Reservations left by a run that was cut off mid-send never went out: clear them so they're retried.
  await q(`DELETE FROM email_log WHERE sent_at IS NULL AND reserved_at < now() - interval '10 minutes'`);
  for (const [k, fn] of [["drop", weeklyDrop], ["midweek", midweek], ["last_call", lastCall], ["results", results], ["winback", winBacks], ["homescreen", homescreenCampaign], ["homescreen_reminder", homescreenReminder]]) {
    out[k] = await fn().catch((e) => { console.error("email " + k, e); return "error"; });
  }
  return out;
}

