import { putObject, getObject, deleteObject, deleteObjects } from "./storage.js";
import { sanitizeImage, BadImage } from "./imagesafe.js";
import { runRetention, groupPhotoKeys, userDuelPhotoKeys, photoKeys, purgeSubmissionPhotos } from "./retention.js";
import { runReminders, unsubOk } from "./reminders.js";
import { runPushNudges } from "./pushNudges.js";
import { runEmails, welcomeEmail, resetEmail, inviteEmail } from "./emails.js";
import { recapLines, currentHunter } from "./recap.js";
import { vapidKeys, pushTo, pushGame } from "./push.js";
import { PRIVACY_VERSION, CONSENT_ITEMS, DIFFICULTY_POINTS, RETAIN_DAYS, DAILY_ITEMS, lagosDay, dailyIndex } from "./shared.js";
import crypto from "node:crypto";
import { q } from "./db.js";
import {
  HttpError, fail, json, hashPassword, verifyPassword, signSession, readSession, getCookie,
  sessionCookie, clearCookie, rateLimit, audit, sniffImage, newToken, sha256,
} from "./util.js";
import {
  DIFFICULTIES, TIE_RULE, defaultWindow, phaseOf, getActive, getUpcoming, getLastClosed, getChallenge,
  leaderboard, standings, userItems, refreshResults,
} from "./game.js";
import { notify, runLifecycle, runDuelLifecycle, withDefaults, DEFAULT_SETTINGS, DUEL_GROUP, TEAM_GROUP, sendEmails, emailHtml, emailConfigured } from "./notify.js";
import { TEAM_SIZES, TEAM_MAX_ITEMS, matchPhase, teamScores, other } from "./teams.js";
import { DUEL_DURATIONS, DUEL_MAX_ITEMS, REVIEW_GRACE_MINUTES, duelPhase, duelScores, isPlayer, opponentOf } from "./duel.js";


const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // Vercel request bodies are capped near 4.5 MB

/* ---------------- router ----------------
 auth: public | user | member (any active member of :gid) | owner (the group's admins: the founder or the co-admin)
       | founder (only the person who created the hunt: deleting it and choosing the co-admin) */
const routes = [];
const CONSENT_FREE = new Set(["POST /me/consent", "GET /me/export", "DELETE /me", "PUT /me"]);
const route = (method, path, auth, fn) =>
  routes.push({ method, path, auth, fn, re: new RegExp("^" + path.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$") });

export async function handle(req) {
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api/, "") || "/";
    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== url.host) fail(403, "Bad origin");
    }
    const r = routes.find((x) => x.method === req.method && x.re.test(path));
    if (!r) fail(404, "Not found");
    const params = path.match(r.re).groups || {};
    const ctx = { req, url, params, user: null, group: null, ip: req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown" };
    if (r.auth !== "public") {
      ctx.user = await currentUser(req);
      if (!ctx.user) fail(401, "Please log in");
      // Nobody uses the app until they have accepted the current privacy notice; these routes stay open so they can accept, export or leave.
      if (ctx.user.privacy_version !== PRIVACY_VERSION && !CONSENT_FREE.has(`${r.method} ${r.path}`)) fail(428, "Please review and accept the privacy notice to continue");
      if (r.auth === "member" || r.auth === "owner" || r.auth === "founder") {
        ctx.group = await membership(ctx.user, int(params.gid, "group"), r.auth !== "member");
        if (r.auth === "founder" && !ctx.group.founder) fail(403, "Only the hunt's original admin can do that");
      }
    }
    return await r.fn(ctx);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}

async function currentUser(req) {
  const s = readSession(getCookie(req, "sid"));
  if (!s) return null;
  const r = await q(`SELECT id, nickname, email, can_create_groups, status, privacy_version, email_reminders, push_stars, push_games, installed_at, (last_seen_at < now() - interval '30 minutes') AS stale FROM users WHERE id=$1`, [s.uid]);
  if (!r[0] || r[0].status !== "active") return null;
  // "Last seen" drives the reminder emails; opening the app also resets the come-back counter.
  if (r[0].stale) q(`UPDATE users SET last_seen_at=now(), nudge_count=0, winback_stage=0, push_nudge_stage=0 WHERE id=$1`, [r[0].id]).catch(() => {});
  return r[0];
}

/** THE group access check. Every /groups/:gid/... route goes through this. */
async function membership(user, gid, ownerOnly) {
  const g = (
    await q(
      `SELECT g.id, g.name, g.description, g.owner_user_id, g.settings, g.invite_token, g.invite_active, g.invite_expires_at,
              g.status AS gstatus, g.is_public, g.is_official, g.admin_left_at, (g.image_key IS NOT NULL) AS has_image, gm.role, gm.status
         FROM groups g JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $2
        WHERE g.id = $1`,
      [gid, user.id]
    )
  )[0];
  if (!g || g.status !== "active" || g.gstatus !== "active") fail(403, "You don't have access to this hunt");
  // A co-admin (role 'admin') gets every admin power except deleting the hunt and choosing/removing the co-admin,
  // so everywhere else they are treated as role "owner". `founder` is the person who created the hunt.
  g.member_role = g.role;
  g.founder = g.role === "owner" && g.owner_user_id === user.id;
  g.role = adminRole(g.role);
  if (ownerOnly && g.role !== "owner") fail(403, "Only this hunt's admin can do that");
  return g;
}
/** The founder and co-admin of a hunt (for admin alerts). */
const hunAdmins = async (gid) => (await q(`SELECT user_id FROM group_members WHERE group_id=$1 AND role IN ('owner','admin') AND status='active'`, [gid])).map((r) => r.user_id);
/** 'admin' (co-admin) acts as 'owner' everywhere except founder-only routes. */
const adminRole = (r) => (r === "admin" ? "owner" : r);
const MAX_CO_ADMINS = 1;

const int = (v, name = "id") => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) fail(400, `Invalid ${name}`);
  return n;
};
const text = (v, max, name, required = false) => {
  const s = String(v ?? "").trim();
  if (required && !s) fail(400, `${name} is required`);
  if (s.length > max) fail(400, `${name} is too long (max ${max} characters)`);
  return s;
};
const body = async (req) => {
  try {
    return await req.json();
  } catch {
    return fail(400, "Invalid request");
  }
};
const gref = (g) => ({ id: g.id, name: g.name, settings: g.settings, is_official: g.is_official });
const publicChallenge = (c) =>
  c && { id: c.id, title: c.title, description: c.description, rules: c.rules, start_at: c.start_at, end_at: c.end_at, prize_amount: c.prize_amount, week_number: c.week_number, tie_rule: TIE_RULE };

async function readImage(form, field, max = MAX_PHOTO_BYTES) {
  const f = form.get(field);
  if (!f || typeof f === "string") fail(400, "Choose an image");
  if (f.size > max) fail(413, max < MAX_PHOTO_BYTES ? "That preview image is too large" : "Images must be under 2 MB");
  const buf = await f.arrayBuffer();
  const kind = sniffImage(buf);
  if (!kind) fail(400, "Images must be JPEG, PNG or WebP");
  try {
    return { buf: sanitizeImage(buf, kind), kind }; // strips EXIF/GPS and other metadata, rejects oversized images
  } catch (e) {
    if (e instanceof BadImage) fail(400, e.message);
    throw e;
  }
}
/** Submissions: at least one photo ("photo1"), up to MAX_PHOTOS ("photo1".."photo4"). */
const MAX_PHOTOS = 4;
// 0 once the photos were deleted early (PRIMAHUNT OFFICIAL deletes them 7 days after review; the row keeps the score).
const PHOTO_COUNT = (a) => `(CASE WHEN ${a}photos_purged_at IS NOT NULL THEN 0 ELSE 1 + (${a}photo_2_key IS NOT NULL)::int + cardinality(${a}extra_photo_keys) END)`;
const MAX_THUMB_BYTES = 300 * 1024;
/** Each photo may come with a small "thumbN" copy (made on the phone) that the feed and 1v1 finds show instead of the full photo. */
async function readPhotos(form) {
  const imgs = [];
  for (let k = 1; k <= MAX_PHOTOS; k++) {
    const f = form.get("photo" + k);
    if (!f || typeof f === "string" || f.size <= 0) continue;
    const img = await readImage(form, "photo" + k);
    const t = form.get("thumb" + k);
    if (t && typeof t !== "string" && t.size > 0) img.thumb = await readImage(form, "thumb" + k, MAX_THUMB_BYTES);
    imgs.push(img);
  }
  if (!imgs.length) fail(400, "Add at least one photo");
  if (form.get("photo" + (MAX_PHOTOS + 1))) fail(400, `You can send up to ${MAX_PHOTOS} photos`);
  return imgs;
}
/** Key for photo n (1-based). thumb=true returns its small copy when one was uploaded, else the full photo. */
const photoAt = (s, n, thumb = false) => {
  const keys = [s.photo_1_key, s.photo_2_key, ...(s.extra_photo_keys || [])].filter(Boolean);
  const i = Number(n) - 1;
  if (!Number.isInteger(i) || i < 0 || i >= keys.length) fail(404, "Not found");
  return (thumb && s.thumb_keys?.[i]) || keys[i];
};
const wantsThumb = (url) => url.searchParams.get("s") === "thumb";
/** Saves every photo and its thumbnail. Returns { keys, thumbs } with thumbs aligned to keys ("" where none was sent). */
async function savePhotos(prefix, imgs) {
  const keys = [], thumbs = [];
  try {
    for (const img of imgs) {
      keys.push(await saveImage(prefix, img));
      thumbs.push(img.thumb ? await saveImage(prefix, img.thumb) : "");
    }
  } catch (e) {
    await Promise.allSettled([...keys, ...thumbs].filter(Boolean).map((k) => deleteObject(k)));
    throw e;
  }
  return { keys, thumbs };
}
async function saveImage(prefix, { buf, kind }) {
  const key = `${prefix}/${crypto.randomUUID()}.${kind.ext}`;
  await putObject(key, buf, kind.type);
  return key;
}
async function serveImage(key) {
  if (!key) fail(404, "Not found");
  const res = await getObject(key);
  if (!res) fail(404, "Not found");
  return new Response(res.data, {
    headers: {
      "Content-Type": /^image\/(jpeg|png|webp)$/.test(res.type) ? res.type : "application/octet-stream",
      // Photos never change once sent, so the viewer's own browser may keep them for an hour (never a shared/CDN cache).
      // Repeat visits to the feed then cost nothing; access is still checked on every fresh load.
      "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Disposition": "inline",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
const readForm = async (req, limit = 4) => {
  if (Number(req.headers.get("content-length") || 0) > limit * 1024 * 1024) fail(413, "Upload is too large");
  try {
    return await req.formData();
  } catch {
    return fail(400, "Invalid upload");
  }
};


/* ================= scheduler (called by Supabase pg_cron every 15 min, and daily by Vercel Cron) ================= */
const cronRun = async ({ req }) => {
  const secret = process.env.CRON_SECRET || "";
  const given = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  const a = Buffer.from(given), b = Buffer.from(secret);
  if (secret.length < 16 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) fail(401, "Unauthorized");
  await runLifecycle();
  const retention = await runRetention().catch((e) => { console.error("retention", e); return { error: true }; });
  const pushes = await runPushNudges().catch((e) => { console.error("push nudges", e); return { error: true }; });
  const reminders = await runReminders().catch((e) => { console.error("reminders", e); return { error: true }; });
  const emails = await runEmails().catch((e) => { console.error("emails", e); return { error: true }; });
  return json({ ok: true, retention, pushes, reminders, emails });
};
route("GET", "/cron/lifecycle", "public", cronRun);
route("POST", "/cron/lifecycle", "public", cronRun);

/* ================= account ================= */
/** Every consent statement must be explicitly ticked (true); the exact wording accepted is stored with the version. */
function readConsent(b) {
  const c = b.consent && typeof b.consent === "object" ? b.consent : {};
  const missing = CONSENT_ITEMS.filter(([k]) => c[k] !== true);
  if (missing.length) fail(400, missing[0][0] === "age" ? "You must be 18 or older to use PrimaHunt" : "Tick every box to accept the privacy notice");
  return Object.fromEntries(CONSENT_ITEMS.map(([k, label]) => [k, label]));
}
route("POST", "/auth/register", "public", async ({ req, ip }) => {
  await rateLimit(`reg:${ip}`, 10, 3600);
  const b = await body(req);
  const nickname = text(b.nickname, 20, "Nickname", true);
  if (!/^[A-Za-z0-9_.\- ]{2,20}$/.test(nickname)) fail(400, "Nickname must be 2-20 letters, numbers, spaces, _ . or -");
  if (/^deleted\s*player$/i.test(nickname)) fail(400, "Pick another nickname");
  const email = text(b.email, 200, "Email", true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter a valid email address");
  const password = String(b.password || "");
  if (password.length < 8) fail(400, "Password must be at least 8 characters");
  if (password.length > 200) fail(400, "Password is too long");
  if (password !== b.confirm) fail(400, "Passwords do not match");
  const consent = readConsent(b);
  let row;
  try {
    row = (await q(`INSERT INTO users (nickname, email, password_hash, privacy_version, privacy_accepted_at) VALUES ($1,$2,$3,$4,now()) RETURNING id`, [nickname, email, await hashPassword(password), PRIVACY_VERSION]))[0];
  } catch (e) {
    if (e.code === "23505") fail(409, String(e.constraint || e.message).includes("nickname") ? "That nickname is taken" : "That email is already registered. Log in instead.");
    throw e;
  }
  await q(`INSERT INTO consents (user_id, version, items) VALUES ($1,$2,$3)`, [row.id, PRIVACY_VERSION, JSON.stringify(consent)]);
  // Every new account joins the hunts marked auto_join (PRIMAHUNT OFFICIAL) as a player.
  await q(`INSERT INTO group_members (group_id, user_id, role) SELECT id, $1, 'player' FROM groups WHERE auto_join AND status='active' ON CONFLICT (group_id, user_id) DO NOTHING`, [row.id])
    .catch((e) => console.error("auto-join failed", e));
  await sendEmails([{ to: email, ...welcomeEmail(nickname) }]).catch((e) => console.error("welcome email", e));
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(signSession(row.id)) });
});

route("POST", "/auth/login", "public", async ({ req, ip }) => {
  const b = await body(req);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  await rateLimit(`login:${ip}:${email}`, 8, 600);
  await rateLimit(`login-ip:${ip}`, 40, 600);
  const u = (await q(`SELECT id, password_hash, status FROM users WHERE lower(email)=$1`, [email]))[0];
  const ok = await verifyPassword(String(b.password || ""), u?.password_hash);
  if (!u || !ok) fail(401, "Wrong email or password");
  if (u.status !== "active") fail(403, "This account has been disabled");
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(signSession(u.id)) });
});
route("POST", "/auth/logout", "public", async () => json({ ok: true }, 200, { "Set-Cookie": clearCookie() }));

route("POST", "/auth/forgot", "public", async ({ req, ip }) => {
  await rateLimit(`forgot:${ip}`, 5, 3600);
  const email = String((await body(req)).email || "").trim().toLowerCase().slice(0, 200);
  const u = (await q(`SELECT id, nickname FROM users WHERE lower(email)=$1 AND status='active'`, [email]))[0];
  if (u) {
    const token = newToken(24);
    await q(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')`, [u.id, sha256(token)]);
    await sendEmails([{ to: email, ...resetEmail(u.nickname, `/reset/${token}`, 1) }]);
  }
  return json({ ok: true }); // same answer whether or not the email exists
});
route("POST", "/auth/reset", "public", async ({ req, ip }) => {
  await rateLimit(`reset:${ip}`, 10, 3600);
  const b = await body(req);
  const password = String(b.password || "");
  if (password.length < 8 || password.length > 200) fail(400, "Password must be at least 8 characters");
  if (password !== b.confirm) fail(400, "Passwords do not match");
  const r = (await q(`UPDATE password_resets SET used=true WHERE token_hash=$1 AND NOT used AND expires_at > now() RETURNING user_id`, [sha256(String(b.token || ""))]))[0];
  if (!r) fail(400, "This reset link is invalid or has expired. Request a new one.");
  await q(`UPDATE users SET password_hash=$2 WHERE id=$1`, [r.user_id, await hashPassword(password)]);
  return json({ ok: true });
});

route("GET", "/me", "public", async ({ req }) => {
  const user = await currentUser(req);
  if (!user) return json({ user: null, now: Date.now() });
  const rows = await q(`SELECT group_id, count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL GROUP BY group_id`, [user.id]);
  const by = {};
  let total = 0;
  for (const r of rows) { by[r.group_id] = r.n; total += r.n; }
  const wins = (await q(`SELECT a.week_number FROM hunter_awards a JOIN challenges c ON c.id=a.challenge_id WHERE a.user_id=$1 ORDER BY c.end_at DESC`, [user.id])).map((r) => r.week_number);
  const hunter = wins.length ? { weeks: wins, current: (await currentHunter())?.id === user.id } : null;
  const streak = await streakOf(user.id);
  const dailyReview = (await isDailyReviewer(user.id)) ? (await q(`SELECT count(*)::int AS n FROM daily_finds WHERE status='pending'`))[0].n : null;
  return json({ user: { id: user.id, nickname: user.nickname, can_create_groups: user.can_create_groups, privacy_ok: user.privacy_version === PRIVACY_VERSION, email_reminders: user.email_reminders, hunter, streak, daily_review: dailyReview, stars: await starTotals(user.id), push: Boolean((await q(`SELECT 1 FROM push_subscriptions WHERE user_id=$1 LIMIT 1`, [user.id]))[0]), push_prefs: { stars: user.push_stars !== false, games: user.push_games !== false }, installed: Boolean(user.installed_at), install_bonus: (await q(`SELECT pips FROM pip_bonuses WHERE user_id=$1 AND kind='install'`, [user.id]))[0]?.pips ?? null }, privacy_version: PRIVACY_VERSION, unread: total, unread_by_group: by, now: Date.now() });
});
route("PUT", "/me", "user", async ({ req, user }) => {
  const nickname = text((await body(req)).nickname, 20, "Nickname", true);
  if (!/^[A-Za-z0-9_.\- ]{2,20}$/.test(nickname)) fail(400, "Nickname must be 2-20 letters, numbers, spaces, _ . or -");
  if (/^deleted\s*player$/i.test(nickname)) fail(400, "Pick another nickname");
  try {
    await q(`UPDATE users SET nickname=$2 WHERE id=$1`, [user.id, nickname]);
  } catch (e) {
    if (e.code === "23505") fail(409, "That nickname is taken");
    throw e;
  }
  return json({ ok: true });
});
route("POST", "/me/password", "user", async ({ req, user }) => {
  await rateLimit(`pw:${user.id}`, 10, 3600);
  const b = await body(req);
  const cur = (await q(`SELECT password_hash FROM users WHERE id=$1`, [user.id]))[0];
  if (!(await verifyPassword(String(b.current || ""), cur.password_hash))) fail(400, "Your current password is wrong");
  const pw = String(b.password || "");
  if (pw.length < 8 || pw.length > 200) fail(400, "New password must be at least 8 characters");
  if (pw !== b.confirm) fail(400, "Passwords do not match");
  await q(`UPDATE users SET password_hash=$2 WHERE id=$1`, [user.id, await hashPassword(pw)]);
  return json({ ok: true });
});
route("POST", "/me/consent", "user", async ({ req, user }) => {
  const consent = readConsent(await body(req));
  await q(`UPDATE users SET privacy_version=$2, privacy_accepted_at=now() WHERE id=$1`, [user.id, PRIVACY_VERSION]);
  await q(`INSERT INTO consents (user_id, version, items) VALUES ($1,$2,$3)`, [user.id, PRIVACY_VERSION, JSON.stringify(consent)]);
  return json({ ok: true });
});
/** Right of access / portability: everything we hold about you, as JSON. Photos are listed by submission (download them in the app while they exist). */
route("GET", "/me/export", "user", async ({ user }) => {
  await rateLimit(`export:${user.id}`, 10, 3600);
  const one = async (sql) => q(sql, [user.id]);
  const data = {
    exported_at: new Date().toISOString(), privacy_version_accepted: user.privacy_version,
    account: (await one(`SELECT id, nickname, email, can_create_groups, created_at, privacy_version, privacy_accepted_at, last_seen_at, email_reminders, last_nudge_at FROM users WHERE id=$1`))[0],
    consents: await one(`SELECT version, items, accepted_at FROM consents WHERE user_id=$1 ORDER BY accepted_at`),
    hunts: await one(`SELECT g.id, g.name, gm.role, gm.status, gm.joined_at FROM group_members gm JOIN groups g ON g.id=gm.group_id WHERE gm.user_id=$1`),
    submissions: await one(`SELECT s.id, g.name AS hunt, i.title AS item, s.status, s.submitted_at, s.reviewed_at, s.rejection_reason, s.in_feed, ${PHOTO_COUNT("s.")} AS photos FROM submissions s JOIN groups g ON g.id=s.group_id JOIN challenge_items i ON i.id=s.item_id WHERE s.user_id=$1 ORDER BY s.submitted_at`),
    comments: await one(`SELECT c.body, c.created_at, g.name AS hunt FROM feed_comments c JOIN groups g ON g.id=c.group_id WHERE c.user_id=$1 ORDER BY c.created_at`),
    points: await one(`SELECT g.name AS hunt, pt.points, pt.transaction_type, pt.reason, pt.earned_at FROM point_transactions pt JOIN groups g ON g.id=pt.group_id WHERE pt.user_id=$1 ORDER BY pt.earned_at`),
    weekly_results: await one(`SELECT g.name AS hunt, c.title AS week, r.final_points, r.final_rank FROM weekly_results r JOIN groups g ON g.id=r.group_id JOIN challenges c ON c.id=r.challenge_id WHERE r.user_id=$1`),
    prizes_won: await one(`SELECT g.name AS hunt, p.amount, p.status, p.paid_at FROM prizes p JOIN groups g ON g.id=p.group_id WHERE p.winner_user_id=$1`),
    duels: await one(`SELECT id, status, duration_minutes, item_count, start_at, end_at, (winner_id=$1) AS won, created_at FROM duels WHERE creator_id=$1 OR opponent_id=$1`),
    team_matches: await one(`SELECT m.id, m.team_size, m.status, m.start_at, m.end_at, tm.side, tm.is_captain, (m.winner_side=tm.side) AS won FROM team_members tm JOIN team_matches m ON m.id=tm.match_id WHERE tm.user_id=$1`),
    daily_hunt: await one(`SELECT day, item_index, created_at FROM daily_finds WHERE user_id=$1 ORDER BY day`),
    star_catches: await one(`SELECT s.name AS star, c.pips, c.distance_m, c.caught_at FROM star_catches c JOIN stars s ON s.id=c.star_id WHERE c.user_id=$1 ORDER BY c.caught_at`),
    bonus_pips: await one(`SELECT kind, pips, created_at FROM pip_bonuses WHERE user_id=$1 ORDER BY created_at`),
    push_alerts: await one(`SELECT created_at, last_ok_at FROM push_subscriptions WHERE user_id=$1 ORDER BY id`),
    notifications: await one(`SELECT type, title, message, created_at, read_at FROM notifications WHERE user_id=$1 ORDER BY created_at`),
  };
  return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="hunt-week-my-data.json"`, "Cache-Control": "private, no-store" } });
});
/** Right to erasure: deletes the account and everything tied to it, including hunts the user runs and 1v1s they played. */
/**
 * Right to erasure, without hurting anyone else: the account is anonymised ("Deleted player"), never removed,
 * so other players' leaderboards, weekly results, prizes and 1v1 wins stay intact.
 * Erased: email, password, consents, notifications, comments, submissions and every photo they took.
 * Hunts they founded pass to the co-admin; with no co-admin the hunt stays readable but closes to new finds and joins.
 * A 1v1 in progress is forfeited to the opponent; 1v1s that hadn't started are cancelled.
 */
route("DELETE", "/me", "user", async ({ req, user }) => {
  await rateLimit(`delme:${user.id}`, 5, 3600);
  const b = await body(req);
  const uid = user.id;
  const cur = (await q(`SELECT password_hash FROM users WHERE id=$1`, [uid]))[0];
  if (!(await verifyPassword(String(b.password || ""), cur.password_hash))) fail(400, "Your password is wrong");
  if (String(b.confirm || "").trim().toUpperCase() !== "DELETE") fail(400, "Type DELETE to confirm");

  // Photos first: if storage refuses, nothing has changed and the user can try again.
  const subs = await q(`SELECT photo_1_key, photo_2_key, extra_photo_keys, thumb_keys FROM submissions WHERE user_id=$1`, [uid]);
  const dsubs = await q(`SELECT photo_1_key, photo_2_key, extra_photo_keys, thumb_keys FROM duel_submissions WHERE user_id=$1`, [uid]);
  const tsubs = await q(`SELECT photo_1_key, photo_2_key, extra_photo_keys, thumb_keys FROM team_submissions WHERE user_id=$1`, [uid]);
  const daily = await q(`SELECT photo_1_key, photo_2_key, extra_photo_keys, thumb_keys FROM daily_finds WHERE user_id=$1`, [uid]);
  await deleteObjects([...photoKeys(subs), ...photoKeys(dsubs), ...photoKeys(tsubs), ...photoKeys(daily)]);

  // 1v1s
  for (const d of await q(`SELECT * FROM duels WHERE status='live' AND (creator_id=$1 OR opponent_id=$1)`, [uid])) {
    const sc = await duelScores({ ...d, status: "live" });
    const other = d.creator_id === uid ? d.opponent_id : d.creator_id;
    await q(`UPDATE duels SET status='finished', finished_at=now(), end_at=LEAST(end_at, now()), winner_id=$2,
               creator_items=$3, opponent_items=$4, creator_reached_at=$5, opponent_reached_at=$6 WHERE id=$1`,
      [d.id, other, sc[d.creator_id]?.items ?? 0, sc[d.opponent_id]?.items ?? 0, sc[d.creator_id]?.reached_at ?? null, sc[d.opponent_id]?.reached_at ?? null]);
    await q(`INSERT INTO notifications (user_id, group_id, type, title, message, link) VALUES ($1,NULL,'duel','1v1 won',$2,$3)`,
      [other, "Your 1v1 opponent left PrimaHunt, so this one goes to you. 🏆", `/duel/${d.id}`]).catch(() => {});
  }
  await q(`UPDATE duels SET status='cancelled' WHERE status IN ('waiting','setup') AND (creator_id=$1 OR opponent_id=$1)`, [uid]);
  await q(`DELETE FROM duel_submissions WHERE user_id=$1`, [uid]); // finished scores are saved on the duel row
  // Team matches: one they captain that hasn't started is called off; otherwise their team plays on without them.
  const capt = await q(`UPDATE team_matches m SET status='cancelled' FROM team_members tm
                         WHERE tm.match_id=m.id AND tm.user_id=$1 AND tm.is_captain AND m.status IN ('waiting','setup') RETURNING m.id`, [uid]);
  await q(`DELETE FROM team_members tm USING team_matches m WHERE tm.match_id=m.id AND tm.user_id=$1 AND m.status IN ('waiting','setup') AND NOT tm.is_captain`, [uid]);
  await q(`DELETE FROM team_submissions WHERE user_id=$1 AND status <> 'approved'`, [uid]);
  await q(`UPDATE team_submissions SET photos_purged_at=now(), photo_1_key='', photo_2_key=NULL, extra_photo_keys='{}', thumb_keys='{}' WHERE user_id=$1`, [uid]); // approved finds still count for their team
  await q(`DELETE FROM daily_finds WHERE user_id=$1`, [uid]);
  await q(`DELETE FROM star_catches WHERE user_id=$1`, [uid]);
  await q(`DELETE FROM pip_bonuses WHERE user_id=$1`, [uid]);
  await q(`DELETE FROM push_subscriptions WHERE user_id=$1`, [uid]);
  void capt;

  // Hunts they founded
  for (const g of await q(`SELECT id, name FROM groups WHERE owner_user_id=$1 AND status='active'`, [uid])) {
    const co = (await q(`SELECT user_id FROM group_members WHERE group_id=$1 AND role='admin' AND status='active' LIMIT 1`, [g.id]))[0];
    const members = (await q(`SELECT user_id FROM group_members WHERE group_id=$1 AND status='active' AND user_id<>$2`, [g.id, uid])).map((r) => r.user_id);
    if (co) {
      await q(`UPDATE groups SET owner_user_id=$2 WHERE id=$1`, [g.id, co.user_id]);
      await q(`UPDATE group_members SET role='owner' WHERE group_id=$1 AND user_id=$2`, [g.id, co.user_id]);
      await q(`INSERT INTO notifications (user_id, group_id, type, title, message, link) VALUES ($1,$2,'admin','You run this hunt now',$3,$4)`,
        [co.user_id, g.id, `The founder of "${g.name}" left PrimaHunt, so you're now its admin.`, `/g/${g.id}`]).catch(() => {});
    } else {
      await q(`UPDATE groups SET admin_left_at=now(), invite_active=false, is_public=false, auto_join=false WHERE id=$1`, [g.id]);
      for (const m of members) {
        await q(`INSERT INTO notifications (user_id, group_id, type, title, message, link) VALUES ($1,$2,'admin','Hunt closed',$3,$4)`,
          [m, g.id, `The admin of "${g.name}" left PrimaHunt. Your scores and results are kept, but the hunt is closed to new finds.`, `/g/${g.id}`]).catch(() => {});
      }
    }
  }

  // Their own data
  await q(`UPDATE group_members SET status='left', role='player' WHERE user_id=$1`, [uid]);
  await q(`DELETE FROM submissions WHERE user_id=$1`, [uid]); // feed posts and comments on them go too; pips stay in point_transactions
  await q(`DELETE FROM feed_comments WHERE user_id=$1`, [uid]);
  await q(`DELETE FROM notifications WHERE user_id=$1`, [uid]);
  await q(`DELETE FROM password_resets WHERE user_id=$1`, [uid]);
  await q(`DELETE FROM consents WHERE user_id=$1`, [uid]);
  await q(`UPDATE users SET status='deleted', nickname='Deleted player', email=$2, password_hash='!', can_create_groups=false,
             privacy_version=NULL, privacy_accepted_at=NULL, email_reminders=false, last_nudge_at=NULL WHERE id=$1`,
    [uid, `deleted-${uid}@deleted.invalid`]);
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
});
route("PUT", "/me/reminders", "user", async ({ req, user }) => {
  const on = Boolean((await body(req)).on);
  await q(`UPDATE users SET email_reminders=$2 WHERE id=$1`, [user.id, on]);
  return json({ ok: true, on });
});
/** One-click "stop these reminders" link from the email. Signed per user; works without logging in. */
route("GET", "/unsubscribe", "public", async ({ url }) => {
  const uid = Number(url.searchParams.get("u"));
  const ok = Number.isInteger(uid) && uid > 0 && unsubOk(uid, url.searchParams.get("s"));
  if (ok) await q(`UPDATE users SET email_reminders=false WHERE id=$1`, [uid]);
  const msg = ok ? "Done. Pip won't send you any more game emails (hunt drops, reminders, results). Password resets still arrive. You can turn game emails back on in your profile." : "This link isn't valid. You can turn game emails off in your profile.";
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PrimaHunt</title><body style="font-family:Arial,sans-serif;background:#16141f;color:#f4f2fb;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px"><div style="max-width:420px;text-align:center"><div style="color:#FFD21F;font-weight:bold;letter-spacing:2px">PRIMAHUNT</div><p style="font-size:18px">${msg}</p><a href="/" style="color:#FFD21F">Open PrimaHunt</a></div></body>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
});
route("POST", "/me/become-admin", "user", async ({ req, user }) => {
  if ((await body(req)).confirm !== true) fail(400, "Please confirm you want admin tools");
  await q(`UPDATE users SET can_create_groups=true WHERE id=$1`, [user.id]);
  return json({ ok: true });
});
/** Switch admin tools off again. Only possible once you no longer run a hunt (delete it or let your co-admin take over first). */
route("POST", "/me/stop-admin", "user", async ({ user }) => {
  const runs = await q(`SELECT name FROM groups WHERE owner_user_id=$1 AND status='active' AND admin_left_at IS NULL`, [user.id]);
  if (runs.length) fail(409, `You still run ${runs.length === 1 ? `"${runs[0].name}"` : `${runs.length} hunts`}. Delete ${runs.length === 1 ? "it" : "them"} in Settings first, then switch admin tools off.`);
  await q(`UPDATE users SET can_create_groups=false WHERE id=$1`, [user.id]);
  return json({ ok: true });
});

/* ================= groups ================= */
async function summary(g, userId) {
  const players = (await q(`SELECT count(*)::int AS n FROM group_members WHERE group_id=$1 AND role='player' AND status='active'`, [g.id]))[0].n;
  const active = await getActive(g.id);
  const upcoming = active ? null : await getUpcoming(g.id);
  const closed = active || upcoming ? null : await getLastClosed(g.id);
  const ch = active || upcoming || closed;
  const out = {
    id: g.id, name: g.name, description: g.description, role: adminRole(g.role), founder: g.founder ?? (g.role === "owner" && g.owner_user_id === userId), co_admin: g.member_role === "admin" || g.role === "admin",
    has_image: g.has_image, members: players, official: Boolean(g.is_official), admin_left: Boolean(g.admin_left_at),
    challenge: ch && { id: ch.id, title: ch.title, week_number: ch.week_number, phase: phaseOf(ch), start_at: ch.start_at, end_at: ch.end_at },
  };
  if (adminRole(g.role) === "player" && (active || closed)) {
    const st = await standings(g.id, active || closed, userId);
    out.my_points = st.me?.points ?? 0;
    out.my_rank = st.me?.rank ?? null;
  }
  if (adminRole(g.role) === "owner") {
    out.pending = (await q(`SELECT count(*)::int AS n FROM submissions WHERE group_id=$1 AND status='pending'`, [g.id]))[0].n;
    if (active || closed) {
      const lb = await leaderboard(g.id, active || closed);
      out.leader = lb[0] && lb[0].points > 0 ? lb[0].nickname : null;
    }
    const pr = (await q(`SELECT p.status, p.amount, u.nickname AS winner FROM prizes p LEFT JOIN users u ON u.id=p.winner_user_id WHERE p.group_id=$1 ORDER BY p.id DESC LIMIT 1`, [g.id]))[0];
    out.prize = pr || null;
    out.invite_active = g.invite_active;
  }
  return out;
}

route("GET", "/groups", "user", async ({ user }) => {
  const rows = await q(
    `SELECT g.id, g.name, g.description, g.owner_user_id, g.settings, g.invite_active, g.is_official, g.admin_left_at, (g.image_key IS NOT NULL) AS has_image, gm.role
       FROM groups g JOIN group_members gm ON gm.group_id=g.id
      WHERE gm.user_id=$1 AND gm.status='active' AND g.status='active' ORDER BY g.is_official DESC, g.created_at`, // PRIMAHUNT OFFICIAL first
    [user.id]
  );
  return json({ groups: await Promise.all(rows.map((g) => summary(g, user.id))), now: Date.now() });
});

route("POST", "/groups", "user", async ({ req, user }) => {
  if (!user.can_create_groups) fail(403, "Create an admin account first");
  await rateLimit(`mkgroup:${user.id}`, 10, 3600);
  const b = await body(req);
  const name = text(b.name, 60, "Hunt name", true);
  const description = text(b.description, 300, "Description");
  const g = (await q(`INSERT INTO groups (name, description, owner_user_id, invite_token) VALUES ($1,$2,$3,$4) RETURNING id`, [name, description, user.id, newToken(12)]))[0];
  await q(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,'owner')`, [g.id, user.id]);
  await audit(user.id, g.id, "create_group", "group", g.id, { name });
  return json({ id: g.id });
});

route("GET", "/groups/:gid", "member", async ({ group, user }) => json({ group: await summary(group, user.id) }));

route("PUT", "/groups/:gid", "owner", async ({ req, group, user }) => {
  const b = await body(req);
  const name = text(b.name, 60, "Hunt name", true);
  await q(`UPDATE groups SET name=$2, description=$3 WHERE id=$1`, [group.id, name, text(b.description, 300, "Description")]);
  await audit(user.id, group.id, "edit_group", "group", group.id, { name });
  return json({ ok: true });
});
route("POST", "/groups/:gid/image", "owner", async ({ req, group, user }) => {
  const img = await readImage(await readForm(req), "image");
  const old = (await q(`SELECT image_key FROM groups WHERE id=$1`, [group.id]))[0]?.image_key;
  await q(`UPDATE groups SET image_key=$2 WHERE id=$1`, [group.id, await saveImage(`group/${group.id}`, img)]);
  if (old) deleteObject(old).catch(() => {});
  await audit(user.id, group.id, "change_group_image", "group", group.id);
  return json({ ok: true });
});
route("GET", "/groups/:gid/image", "member", async ({ group }) => serveImage((await q(`SELECT image_key FROM groups WHERE id=$1`, [group.id]))[0]?.image_key));

route("POST", "/groups/:gid/leave", "member", async ({ group, user }) => {
  if (group.founder) fail(400, "You run this hunt, so you can't leave it");
  // A co-admin who leaves gives up the admin seat; if they come back they join as a player.
  await q(`UPDATE group_members SET status='left', role=CASE WHEN role='admin' THEN 'player' ELSE role END WHERE group_id=$1 AND user_id=$2`, [group.id, user.id]);
  return json({ ok: true });
});

/* ---- members ---- */
route("GET", "/groups/:gid/members", "member", async ({ group }) => {
  const active = await getActive(group.id);
  const owner = group.role === "owner";
  const rows = await q(
    `SELECT u.id, u.nickname, gm.role, gm.joined_at,
            (SELECT count(*) FROM submissions s WHERE s.group_id=$1 AND s.user_id=u.id)::int AS submissions,
            (SELECT count(*) FROM submissions s WHERE s.group_id=$1 AND s.user_id=u.id AND s.status='approved')::int AS approved,
            COALESCE((SELECT sum(points) FROM point_transactions p WHERE p.group_id=$1 AND p.user_id=u.id AND p.challenge_id=$2),0)::int AS score
       FROM group_members gm JOIN users u ON u.id=gm.user_id
      WHERE gm.group_id=$1 AND gm.status='active' ORDER BY (gm.role='owner') DESC, (gm.role='admin') DESC, lower(u.nickname)`,
    [group.id, active ? active.id : null]
  );
  return json({
    members: rows.map((r) => (owner ? r : { nickname: r.nickname, role: r.role, joined_at: r.joined_at })),
    active_challenge: owner && active ? { id: active.id, title: active.title } : null,
    founder: group.founder, max_co_admins: MAX_CO_ADMINS,
  });
});

/** The founder picks one active player as co-admin. The co-admin can't remove the founder (removal only touches players) and can't change admins. */
route("POST", "/groups/:gid/members/:uid/make-admin", "founder", async ({ group, params, user }) => {
  const uid = int(params.uid, "member");
  const n = (await q(`SELECT count(*)::int AS n FROM group_members WHERE group_id=$1 AND role='admin' AND status='active'`, [group.id]))[0].n;
  if (n >= MAX_CO_ADMINS) fail(409, "This hunt already has a co-admin. Remove them first.");
  const r = await q(`UPDATE group_members SET role='admin' WHERE group_id=$1 AND user_id=$2 AND role='player' AND status='active' RETURNING user_id`, [group.id, uid]);
  if (!r[0]) fail(404, "Player not found");
  await audit(user.id, group.id, "make_co_admin", "user", uid);
  await notify(gref(group), "admin", [uid], `🛡️ ${user.nickname} made you a co-admin of ${group.name}. You can now review submissions and run challenges.`, `/g/${group.id}`).catch((e) => console.error(e));
  return json({ ok: true });
});
route("POST", "/groups/:gid/members/:uid/remove-admin", "founder", async ({ group, params, user }) => {
  const uid = int(params.uid, "member");
  const r = await q(`UPDATE group_members SET role='player' WHERE group_id=$1 AND user_id=$2 AND role='admin' RETURNING user_id`, [group.id, uid]);
  if (!r[0]) fail(404, "Co-admin not found");
  await audit(user.id, group.id, "remove_co_admin", "user", uid);
  await notify(gref(group), "admin", [uid], `You're no longer a co-admin of ${group.name}. You're back in as a player.`, `/g/${group.id}`).catch((e) => console.error(e));
  return json({ ok: true });
});
route("POST", "/groups/:gid/members/:uid/remove", "owner", async ({ group, params, user }) => {
  const uid = int(params.uid, "member");
  if (uid === user.id) fail(400, "You can't remove yourself");
  const r = await q(`UPDATE group_members SET status='removed' WHERE group_id=$1 AND user_id=$2 AND role='player' AND status='active' RETURNING user_id`, [group.id, uid]);
  if (!r[0]) fail(404, "Member not found");
  await audit(user.id, group.id, "remove_member", "user", uid);
  return json({ ok: true });
});
route("POST", "/groups/:gid/members/:uid/adjust", "owner", async ({ req, group, params, user }) => {
  const uid = int(params.uid, "member");
  const b = await body(req);
  const newScore = Number(b.new_score);
  if (!Number.isInteger(newScore) || newScore < 0 || newScore > 1000000) fail(400, "Enter a whole number for the new score");
  const reason = text(b.reason, 300, "Reason", true);
  const ch = b.challenge_id ? await getChallenge(group.id, int(b.challenge_id)) : await getActive(group.id);
  if (!ch || ch.status !== "published") fail(400, "There is no active challenge to adjust");
  const m = (await q(`SELECT u.nickname FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 AND gm.user_id=$2 AND gm.role='player'`, [group.id, uid]))[0];
  if (!m) fail(404, "Member not found");
  const prev = (await q(`SELECT COALESCE(sum(points),0)::int AS s FROM point_transactions WHERE group_id=$1 AND user_id=$2 AND challenge_id=$3`, [group.id, uid, ch.id]))[0].s;
  const diff = newScore - prev;
  if (diff === 0) fail(400, "The score is already that value");
  await q(`INSERT INTO point_transactions (user_id, group_id, challenge_id, points, transaction_type, reason) VALUES ($1,$2,$3,$4,'adjustment',$5)`, [uid, group.id, ch.id, diff, reason]);
  await audit(user.id, group.id, "adjust_score", "user", uid, { participant: m.nickname, challenge: ch.title, previous: prev, new: newScore, difference: diff, reason });
  if (phaseOf(ch) === "closed") await refreshResults(ch);
  await leadCheck(group, ch).catch((e) => console.error("lead alert", e));
  return json({ ok: true });
});

/* ---- invitations ---- */
const inviteValid = (g) => g.invite_active && (!g.invite_expires_at || new Date(g.invite_expires_at) > Date.now());

route("GET", "/invite/:token", "public", async ({ params, ip }) => {
  await rateLimit(`invite:${ip}`, 60, 600);
  const g = (await q(`SELECT g.id, g.name, g.description, g.invite_active, g.invite_expires_at, u.nickname AS host FROM groups g JOIN users u ON u.id=g.owner_user_id WHERE g.invite_token=$1 AND g.status='active'`, [params.token]))[0];
  if (!g || !inviteValid(g)) fail(404, "This invitation link isn't valid any more. Ask the hunt admin for a new one.");
  const live = await getActive(g.id);
  return json({ group: { name: g.name, description: g.description }, host: g.host, live: live ? { week_number: live.week_number, end_at: live.end_at } : null });
});
/** Add a player to a group (invite link or Global Search). Removed players stay out. Anyone can join mid-week and start hunting straight away. */
async function addPlayer(gid, userId) {
  const cur = (await q(`SELECT status FROM group_members WHERE group_id=$1 AND user_id=$2`, [gid, userId]))[0];
  if (cur?.status === "removed") fail(403, "You can't rejoin this hunt");
  if (!cur) await q(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,'player') ON CONFLICT (group_id, user_id) DO NOTHING`, [gid, userId]);
  else if (cur.status === "left") await q(`UPDATE group_members SET status='active' WHERE group_id=$1 AND user_id=$2`, [gid, userId]);
  return json({ ok: true, group_id: gid, already: cur?.status === "active", live: Boolean(await getActive(gid)) });
}
route("POST", "/invite/:token/join", "user", async ({ params, user, ip }) => {
  await rateLimit(`join:${ip}`, 30, 600);
  const g = (await q(`SELECT id, name, settings, owner_user_id, invite_active, invite_expires_at FROM groups WHERE invite_token=$1 AND status='active'`, [params.token]))[0];
  if (!g || !inviteValid(g)) fail(404, "This invitation link isn't valid any more. Ask the hunt admin for a new one.");
  return addPlayer(g.id, user.id);
});
route("GET", "/groups/:gid/invite", "owner", async ({ group }) =>
  json({ token: group.invite_token, active: group.invite_active, expires_at: group.invite_expires_at, valid: inviteValid(group) }));
/** Email the invite link to one address. The address is used for this one email and never stored. */
route("POST", "/groups/:gid/invite/email", "owner", async ({ req, group, user }) => {
  await rateLimit(`invmail:${user.id}`, 20, 86400);
  const to = text((await body(req)).email, 200, "Email", true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) fail(400, "Enter a valid email address");
  if (!inviteValid(group)) fail(409, "Your invite link is switched off or expired. Make a new one first.");
  if (!emailConfigured()) fail(503, "Email isn't set up yet");
  const member = (await q(`SELECT 1 FROM group_members gm JOIN users u ON u.id=gm.user_id WHERE gm.group_id=$1 AND gm.status='active' AND lower(u.email)=$2`, [group.id, to]))[0];
  if (member) fail(409, "That person is already in this hunt");
  const count = (await q(`SELECT count(*)::int AS n FROM group_members WHERE group_id=$1 AND status='active' AND role='player'`, [group.id]))[0].n;
  const live = Boolean((await q(`SELECT 1 FROM challenges WHERE group_id=$1 AND status='published' AND start_at <= now() AND end_at > now()`, [group.id]))[0]);
  await sendEmails([{ to, ...inviteEmail({ inviter: user.nickname, hunt: group.name, count, link: `/join/${group.invite_token}`, live }) }]);
  return json({ ok: true });
});
route("POST", "/groups/:gid/invite/regenerate", "owner", async ({ req, group, user }) => {
  const days = Number((await body(req)).expires_days || 0);
  if (!Number.isInteger(days) || days < 0 || days > 365) fail(400, "Pick a valid expiry");
  const token = newToken(12);
  await q(`UPDATE groups SET invite_token=$2, invite_active=true, invite_expires_at = CASE WHEN $3::int > 0 THEN now() + make_interval(days => $3::int) ELSE NULL END WHERE id=$1`, [group.id, token, days]);
  await audit(user.id, group.id, "regenerate_invite", "group", group.id, { expires_days: days });
  return json({ ok: true });
});
route("POST", "/groups/:gid/invite/disable", "owner", async ({ group, user }) => {
  await q(`UPDATE groups SET invite_active=false WHERE id=$1`, [group.id]);
  await audit(user.id, group.id, "disable_invite", "group", group.id);
  return json({ ok: true });
});

/* ================= player views ================= */
route("GET", "/groups/:gid/dashboard", "member", async ({ group, user }) => {
  const active = await getActive(group.id);
  const upcoming = await getUpcoming(group.id);
  const ch = active || (await getLastClosed(group.id));
  const out = { now: Date.now(), phase: active ? "active" : ch ? "closed" : "none", upcoming: upcoming && { id: upcoming.id, title: upcoming.title, start_at: upcoming.start_at, week_number: upcoming.week_number } };
  if (!ch) return json(out);
  const items = await userItems(ch.id, user.id);
  const st = await standings(group.id, ch, user.id);
  const recent = await q(
    `SELECT s.id, s.status, s.submitted_at, s.reviewed_at, s.rejection_reason, i.title, i.points
       FROM submissions s JOIN challenge_items i ON i.id=s.item_id
      WHERE s.user_id=$1 AND s.group_id=$2 AND i.challenge_id=$3
        AND NOT (s.status='rejected' AND EXISTS (SELECT 1 FROM submissions x WHERE x.user_id=s.user_id AND x.item_id=s.item_id AND x.status IN ('pending','approved')))
      ORDER BY COALESCE(s.reviewed_at, s.submitted_at) DESC LIMIT 30`,
    [user.id, group.id, ch.id]
  );
  return json({
    ...out, challenge: publicChallenge(ch), score: st.me?.points ?? 0, rank: st.me?.rank ?? null, total: st.total,
    gap: st.me?.gap ?? 0, above: st.me?.above ?? null, group_points: st.group_points,
    items_done: items.filter((i) => i.status === "approved").length, items_total: items.length,
    pending: items.filter((i) => i.status === "pending").length, rejected: items.filter((i) => i.status === "rejected").length,
    not_submitted: items.filter((i) => i.status === "not_submitted").length, points_possible: items.reduce((a, i) => a + i.points, 0),
    recent, leaderboard: st.rows.slice(0, 10),
  });
});

/** Players only ever see items once the challenge is live. Drafts and scheduled challenges reveal nothing. */
route("GET", "/groups/:gid/challenge", "member", async ({ group, user }) => {
  const active = await getActive(group.id);
  if (!active) {
    const up = await getUpcoming(group.id);
    return json({ phase: up ? "upcoming" : "none", upcoming: up && { title: up.title, start_at: up.start_at, week_number: up.week_number, prize_amount: up.prize_amount }, now: Date.now() });
  }
  return json({ phase: "active", challenge: publicChallenge(active), items: await userItems(active.id, user.id), now: Date.now() });
});

route("POST", "/groups/:gid/items/:id/submit", "member", async ({ req, params, group, user }) => {
  if (group.admin_left_at) fail(409, "This hunt's admin has left PrimaHunt, so it's closed to new finds");
  if (group.role !== "player") fail(403, "Hunt admins don't submit photos");
  await rateLimit(`submit:${user.id}`, 30, 600);
  const itemId = int(params.id);
  const item = (await q(`SELECT i.id, i.challenge_id FROM challenge_items i JOIN challenges c ON c.id=i.challenge_id WHERE i.id=$1 AND c.group_id=$2`, [itemId, group.id]))[0];
  if (!item) fail(404, "Item not found");
  const ch = await getChallenge(group.id, item.challenge_id);
  if (phaseOf(ch) !== "active") fail(409, "This challenge is not open for submissions");
  const existing = await q(`SELECT status FROM submissions WHERE user_id=$1 AND item_id=$2 AND status IN ('pending','approved')`, [user.id, itemId]);
  if (existing[0]) fail(409, existing[0].status === "approved" ? "This item is already approved" : "You already have a submission waiting for review");
  const form = await readForm(req);
  const imgs = await readPhotos(form);
  const { keys, thumbs } = await savePhotos(`sub/${group.id}/${user.id}`, imgs);
  let sub;
  try {
    sub = (await q(`INSERT INTO submissions (group_id, user_id, item_id, photo_1_key, photo_2_key, extra_photo_keys, thumb_keys) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [group.id, user.id, itemId, keys[0], keys[1] || null, keys.slice(2), thumbs]))[0];
  } catch (e) {
    await Promise.allSettled([...keys, ...thumbs].filter(Boolean).map((k) => deleteObject(k)));
    if (e.code === "23505") fail(409, "You already have a submission for this item");
    throw e;
  }
  const it = (await q(`SELECT title FROM challenge_items WHERE id=$1`, [itemId]))[0];
  await notify(gref(group), "submission", await hunAdmins(group.id), `📸 ${user.nickname} submitted '${it.title}' in ${group.name}. Tap to review.`, `/g/${group.id}/review`).catch((e) => console.error(e));
  return json({ ok: true, id: sub.id });
});

/** Submission photos: only the player who took them, or the admin of the group they were submitted to. */
route("GET", "/photo/:id/:n", "user", async ({ params, user, url }) => {
  const s = (await q(
    `SELECT s.user_id, s.photo_1_key, s.photo_2_key, s.extra_photo_keys, s.thumb_keys, g.owner_user_id,
            (s.status='approved' AND s.in_feed AND g.status='active' AND EXISTS (
              SELECT 1 FROM group_members m WHERE m.group_id=s.group_id AND m.user_id=$2 AND m.status='active')) AS shared,
            EXISTS (SELECT 1 FROM group_members a WHERE a.group_id=s.group_id AND a.user_id=$2 AND a.role='admin' AND a.status='active') AS co_admin
       FROM submissions s JOIN groups g ON g.id=s.group_id WHERE s.id=$1`,
    [int(params.id), user.id]
  ))[0];
  // The submitter and the group's admin always; other active members only once it's approved and in the group feed.
  if (!s || (s.user_id !== user.id && s.owner_user_id !== user.id && !s.co_admin && !s.shared)) fail(404, "Not found");
  return serveImage(photoAt(s, params.n, wantsThumb(url)));
});

route("GET", "/groups/:gid/my-submissions", "member", async ({ group, user }) => {
  const rows = await q(
    `SELECT s.id, s.status, s.submitted_at, s.reviewed_at, s.rejection_reason, ${PHOTO_COUNT("s.")} AS photos, i.title, i.points, c.title AS challenge_title, c.week_number
       FROM submissions s JOIN challenge_items i ON i.id=s.item_id JOIN challenges c ON c.id=i.challenge_id
      WHERE s.user_id=$1 AND s.group_id=$2 ORDER BY s.submitted_at DESC LIMIT 80`,
    [user.id, group.id]
  );
  return json({ submissions: rows });
});

async function challengeFor(group, cidParam, { onlyShown = true } = {}) {
  if (cidParam) {
    const c = await getChallenge(group.id, int(cidParam, "challenge"));
    if (!c || c.status !== "published" || new Date(c.start_at) > Date.now()) fail(404, "Not found");
    return c;
  }
  return (await getActive(group.id)) || (await getLastClosed(group.id));
}
route("GET", "/groups/:gid/leaderboard", "member", async ({ url, group, user }) => {
  const ch = await challengeFor(group, url.searchParams.get("challenge"));
  if (!ch) return json({ phase: "none" });
  const st = await standings(group.id, ch, user.id);
  return json({ phase: phaseOf(ch), challenge: publicChallenge(ch), ...st, now: Date.now() });
});

route("GET", "/groups/:gid/results", "member", async ({ group, user }) => {
  await runLifecycle().catch((e) => console.error(e));
  const rows = await q(
    `SELECT c.id, c.title, c.week_number, c.start_at, c.end_at, c.prize_amount, p.status AS prize_status, w.nickname AS winner,
            (SELECT final_rank FROM weekly_results r WHERE r.challenge_id=c.id AND r.user_id=$2) AS my_rank,
            (SELECT final_points FROM weekly_results r WHERE r.challenge_id=c.id AND r.user_id=$2) AS my_points
       FROM challenges c LEFT JOIN prizes p ON p.challenge_id=c.id LEFT JOIN users w ON w.id=p.winner_user_id
      WHERE c.group_id=$1 AND c.status='published' AND c.end_at <= now() ORDER BY c.end_at DESC LIMIT 100`,
    [group.id, user.id]
  );
  return json({ results: rows });
});
/** Stored recap for a finished week; weeks that closed before recaps existed get theirs built on first view (while their data is still there). */
async function weekRecap(c) {
  let rec = (await q(`SELECT data FROM week_recaps WHERE challenge_id=$1`, [c.id]))[0];
  if (!rec && c.finalized_at && !c.purged_at) {
    await refreshResults(c).catch((e) => console.error("recap backfill", e));
    rec = (await q(`SELECT data FROM week_recaps WHERE challenge_id=$1`, [c.id]))[0];
  }
  return recapLines(rec?.data).catch(() => []);
}
route("GET", "/groups/:gid/results/:cid", "member", async ({ params, group, user }) => {
  await runLifecycle().catch((e) => console.error(e));
  const c = await getChallenge(group.id, int(params.cid, "challenge"));
  if (!c || c.status !== "published" || phaseOf(c) !== "closed") fail(404, "Results aren't available");
  const st = await standings(group.id, c, user.id);
  const items = await userItems(c.id, user.id);
  const pending = (await q(`SELECT count(*)::int AS n FROM submissions s JOIN challenge_items i ON i.id=s.item_id WHERE i.challenge_id=$1 AND s.status='pending'`, [c.id]))[0].n;
  const prize = (await q(`SELECT p.amount, p.status, p.paid_at, p.payout_note, w.nickname AS winner FROM prizes p LEFT JOIN users w ON w.id=p.winner_user_id WHERE p.challenge_id=$1`, [c.id]))[0] || null;
  if (prize && group.role !== "owner") delete prize.payout_note;
  const approved = await q(
    `SELECT i.title, i.points, s.submitted_at, s.reviewed_at FROM submissions s JOIN challenge_items i ON i.id=s.item_id
      WHERE s.user_id=$1 AND s.group_id=$2 AND i.challenge_id=$3 AND s.status='approved' ORDER BY s.submitted_at`,
    [user.id, group.id, c.id]
  );
  return json({
    group: { name: group.name }, challenge: publicChallenge(c), finalized: pending === 0 && !!c.finalized_at, rows: st.rows, me: st.me, group_points: st.group_points,
    prize: prize ? { ...prize, amount: prize.amount } : { amount: c.prize_amount, status: "none", winner: null },
    completed: items.filter((i) => i.status === "approved").map((i) => ({ title: i.title, points: i.points })),
    missed: items.filter((i) => i.status !== "approved").map((i) => ({ title: i.title, points: i.points })),
    approved,
    recap: await weekRecap(c),
  });
});

/** Reference images: members once the challenge has started, the admin any time. */
route("GET", "/groups/:gid/items/:id/reference", "member", async ({ params, group }) => {
  const it = (await q(`SELECT i.reference_image_key, c.start_at, c.status FROM challenge_items i JOIN challenges c ON c.id=i.challenge_id WHERE i.id=$1 AND c.group_id=$2`, [int(params.id), group.id]))[0];
  if (!it) fail(404, "Not found");
  if (group.role !== "owner" && !(it.status === "published" && new Date(it.start_at) <= Date.now())) fail(404, "Not found");
  return serveImage(it.reference_image_key);
});

/* ================= notifications ================= */
route("GET", "/notifications", "user", async ({ url, user }) => {
  const g = url.searchParams.get("group");
  const rows = await q(
    `SELECT n.id, n.type, n.title, n.message, n.link, n.read_at, n.created_at, n.group_id
       FROM notifications n
      WHERE n.user_id=$1 AND ($2::int IS NULL OR n.group_id=$2)
        AND (n.group_id IS NULL OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id=n.group_id AND gm.user_id=n.user_id AND gm.status='active'))
      ORDER BY n.created_at DESC LIMIT 60`,
    [user.id, g ? int(g, "group") : null]
  );
  return json({ notifications: rows });
});
route("POST", "/notifications/read", "user", async ({ req, user }) => {
  const g = (await body(req).catch(() => ({}))).group;
  await q(`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL AND ($2::int IS NULL OR group_id=$2)`, [user.id, g ? int(g, "group") : null]);
  return json({ ok: true });
});

/* ================= group admin ================= */
route("GET", "/groups/:gid/overview", "owner", async ({ group }) => {
  const active = await getActive(group.id);
  const upcoming = await getUpcoming(group.id);
  const ch = active || (await getLastClosed(group.id));
  const players = (await q(`SELECT count(*)::int AS n FROM group_members WHERE group_id=$1 AND role='player' AND status='active'`, [group.id]))[0].n;
  const pendingAll = (await q(`SELECT count(*)::int AS n FROM submissions WHERE group_id=$1 AND status='pending'`, [group.id]))[0].n;
  let counts = { total: 0, pending: 0, approved: 0, rejected: 0 }, rows = [], group_points = 0;
  if (ch) {
    counts = (await q(
      `SELECT count(*)::int AS total, (count(*) FILTER (WHERE s.status='pending'))::int AS pending,
              (count(*) FILTER (WHERE s.status='approved'))::int AS approved, (count(*) FILTER (WHERE s.status='rejected'))::int AS rejected
         FROM submissions s JOIN challenge_items i ON i.id=s.item_id WHERE i.challenge_id=$1 AND s.group_id=$2`, [ch.id, group.id]))[0];
    const lb = await leaderboard(group.id, ch);
    rows = lb.slice(0, 15).map((r) => ({ rank: r.rank, nickname: r.nickname, points: r.points, items: r.items, reached_at: r.reached_at }));
    group_points = lb.reduce((a, r) => a + r.points, 0);
  }
  const prize = (await q(`SELECT p.id, p.status, p.amount, w.nickname AS winner FROM prizes p LEFT JOIN users w ON w.id=p.winner_user_id WHERE p.group_id=$1 ORDER BY p.id DESC LIMIT 1`, [group.id]))[0] || null;
  const itemCount = ch ? (await q(`SELECT count(*)::int AS n FROM challenge_items WHERE challenge_id=$1`, [ch.id]))[0].n : 0;
  return json({
    phase: active ? "active" : ch ? "closed" : "none", challenge: publicChallenge(ch), item_count: itemCount, upcoming: upcoming && { title: upcoming.title, start_at: upcoming.start_at },
    players, counts, pending_all: pendingAll, leaderboard: rows, group_points, prize, now: Date.now(),
  });
});

const SUB_SELECT = `
  SELECT s.id, s.status, s.submitted_at, s.reviewed_at, s.rejection_reason, u.nickname, ${PHOTO_COUNT("s.")} AS photos,
         i.title AS item_title, i.instructions, i.points, c.title AS challenge_title,
         (SELECT coalesce(json_agg(json_build_object('reason', x.rejection_reason, 'at', x.reviewed_at) ORDER BY x.reviewed_at), '[]'::json)
            FROM submissions x WHERE x.user_id=s.user_id AND x.item_id=s.item_id AND x.status='rejected' AND x.id<>s.id) AS history
    FROM submissions s JOIN users u ON u.id=s.user_id JOIN challenge_items i ON i.id=s.item_id JOIN challenges c ON c.id=i.challenge_id`;

route("GET", "/groups/:gid/review", "owner", async ({ group }) =>
  json({ queue: await q(`${SUB_SELECT} WHERE s.group_id=$1 AND s.status='pending' ORDER BY s.submitted_at ASC LIMIT 100`, [group.id]) }));

route("GET", "/groups/:gid/submissions", "owner", async ({ url, group }) => {
  const status = url.searchParams.get("status") || null;
  const challenge = url.searchParams.get("challenge") ? int(url.searchParams.get("challenge")) : null;
  const term = (url.searchParams.get("q") || "").trim();
  const like = term ? `%${term.replace(/[%_]/g, "")}%` : null;
  if (status && !["pending", "approved", "rejected"].includes(status)) fail(400, "Bad status");
  const rows = await q(
    `${SUB_SELECT} WHERE s.group_id=$1 AND ($2::text IS NULL OR s.status=$2) AND ($3::int IS NULL OR i.challenge_id=$3)
       AND ($4::text IS NULL OR u.nickname ILIKE $4 OR i.title ILIKE $4) ORDER BY s.submitted_at DESC LIMIT 100`,
    [group.id, status, challenge, like]
  );
  return json({ submissions: rows });
});

/**
 * In-app alert when someone new goes top of a live week (after an approval or a score change).
 * The swap is claimed atomically on challenges.leader_user_id, so each change of leader is announced exactly once.
 */
async function leadCheck(group, ch) {
  if (!ch || ch.status !== "published" || phaseOf(ch) !== "active") return;
  const lb = await leaderboard(group.id, ch);
  const top = lb[0] && lb[0].points > 0 ? lb[0] : null;
  const r = (await q(
    `WITH old AS (SELECT leader_user_id FROM challenges WHERE id=$1 FOR UPDATE)
     UPDATE challenges c SET leader_user_id=$2 FROM old WHERE c.id=$1 AND old.leader_user_id IS DISTINCT FROM $2
     RETURNING old.leader_user_id AS prev`, [ch.id, top?.id ?? null]))[0];
  if (!r || !top) return;
  const link = `/g/${group.id}/ranks`;
  const add = (uids, msg) => uids.length && q(
    `INSERT INTO notifications (user_id, group_id, type, title, message, link) SELECT u, $2, 'lead', 'New leader', $3, $4 FROM unnest($1::int[]) AS u`,
    [uids, group.id, msg, link]);
  const members = (await q(`SELECT user_id FROM group_members WHERE group_id=$1 AND status='active'`, [group.id])).map((m) => m.user_id);
  const pts = `${top.points} pip${top.points === 1 ? "" : "s"}`;
  const lead = `👑 You just took the lead in ${group.name} with ${pts}. Hold on to it!`;
  await add([top.id], lead);
  await pushGame([top.id], { title: group.name, body: lead, url: link, tag: `lead-${group.id}` });
  if (r.prev && members.includes(r.prev)) {
    const lost = `😬 ${top.nickname} just took the lead from you in ${group.name}. Time to hunt!`;
    await add([r.prev], lost);
    await pushGame([r.prev], { title: group.name, body: lost, url: link, tag: `lead-${group.id}` });
  }
  await add(members.filter((u) => u !== top.id && u !== r.prev), `🔥 ${top.nickname} just took the lead in ${group.name} with ${pts}.`);
}

route("POST", "/groups/:gid/submissions/:id/approve", "owner", async ({ params, group, user }) => {
  const id = int(params.id);
  const r = await q(
    `WITH upd AS (
       UPDATE submissions SET status='approved', reviewed_at=now(), reviewed_by=$2, rejection_reason=NULL
        WHERE id=$1 AND group_id=$3 AND status='pending' RETURNING id, user_id, item_id, submitted_at
     ), ins AS (
       INSERT INTO point_transactions (user_id, group_id, challenge_id, item_id, submission_id, points, transaction_type, earned_at)
       SELECT upd.user_id, $3, i.challenge_id, i.id, upd.id, i.points, 'approval', upd.submitted_at
         FROM upd JOIN challenge_items i ON i.id = upd.item_id
       RETURNING points
     )
     SELECT upd.user_id, upd.item_id, (SELECT points FROM ins) AS points FROM upd`,
    [id, user.id, group.id]
  );
  if (!r[0]) fail(409, "This submission was already reviewed");
  const item = (await q(`SELECT i.title, c.* FROM challenge_items i JOIN challenges c ON c.id=i.challenge_id WHERE i.id=$1`, [r[0].item_id]))[0];
  await audit(user.id, group.id, "approve_submission", "submission", id, { points: r[0].points, item: item?.title });
  if (item && phaseOf(item) === "closed") await refreshResults(item);
  await notify(gref(group), "approved", [r[0].user_id], `✅ Your submission for '${item?.title}' was approved. +${r[0].points} pips!`, `/g/${group.id}`);
  await leadCheck(group, item).catch((e) => console.error("lead alert", e));
  if (group.is_official) await purgeSubmissionPhotos([id]).catch((e) => console.error("photo purge failed (cron retries)", e));
  return json({ ok: true });
});
route("POST", "/groups/:gid/submissions/:id/reject", "owner", async ({ req, params, group, user }) => {
  const id = int(params.id);
  const reason = text((await body(req)).reason, 300, "Rejection reason", true);
  if (reason.length < 3) fail(400, "Give the player a reason");
  const r = await q(
    `UPDATE submissions SET status='rejected', reviewed_at=now(), reviewed_by=$2, rejection_reason=$3
      WHERE id=$1 AND group_id=$4 AND status='pending' RETURNING user_id, item_id`,
    [id, user.id, reason, group.id]
  );
  if (!r[0]) fail(409, "This submission was already reviewed");
  const item = (await q(`SELECT title FROM challenge_items WHERE id=$1`, [r[0].item_id]))[0];
  await audit(user.id, group.id, "reject_submission", "submission", id, { reason, item: item?.title });
  await notify(gref(group), "rejected", [r[0].user_id], `❌ Your submission for '${item?.title}' was rejected. Tap to see the reason and resubmit.`, `/g/${group.id}/hunt`);
  if (group.is_official) await purgeSubmissionPhotos([id]).catch((e) => console.error("photo purge failed (cron retries)", e));
  return json({ ok: true });
});

/* ---- challenges (draft -> publish) ---- */
function parseChallenge(b) {
  const start = new Date(b.start_at), end = new Date(b.end_at);
  if (isNaN(start) || isNaN(end)) fail(400, "Set a valid start and end time");
  if (end <= start) fail(400, "End time must be after the start time");
  const prize = b.prize_amount === "" || b.prize_amount == null ? 3000 : Number(b.prize_amount);
  if (!Number.isInteger(prize) || prize < 0 || prize > 10000000) fail(400, "Prize must be a whole number of naira");
  return { title: text(b.title, 120, "Challenge title", true), description: text(b.description, 2000, "Description"), rules: text(b.rules, 4000, "Rules"), start: start.toISOString(), end: end.toISOString(), prize };
}
function parseItem(b) {
  const difficulty = String(b.difficulty || "easy").toLowerCase();
  if (!DIFFICULTIES.includes(difficulty)) fail(400, "Pick a valid difficulty");
  const points = DIFFICULTY_POINTS[difficulty]; // pips follow the difficulty; the client can't set them
  return { title: text(b.title, 160, "Item name", true), description: text(b.description, 1000, "Description"), instructions: text(b.instructions, 2000, "Instructions"), difficulty, points, hint: text(b.hint, 500, "Hint") || null };
}
const requireDraft = (c) => {
  if (!c) fail(404, "Challenge not found");
  if (c.status !== "draft") fail(409, "This challenge is published, so it's locked. Unpublish it first if it hasn't started.");
};
async function itemInGroup(group, itemId) {
  const it = (await q(`SELECT i.*, c.status AS c_status, c.id AS cid FROM challenge_items i JOIN challenges c ON c.id=i.challenge_id WHERE i.id=$1 AND c.group_id=$2`, [itemId, group.id]))[0];
  if (!it) fail(404, "Item not found");
  return it;
}

route("GET", "/groups/:gid/challenge-defaults", "owner", async () => json(defaultWindow()));
route("GET", "/groups/:gid/challenges", "owner", async ({ group }) => {
  const rows = await q(
    `SELECT c.id, c.title, c.status, c.week_number, c.start_at, c.end_at, c.prize_amount,
            (SELECT count(*) FROM challenge_items WHERE challenge_id=c.id)::int AS item_count,
            (SELECT count(*) FROM submissions s JOIN challenge_items i ON i.id=s.item_id WHERE i.challenge_id=c.id)::int AS submission_count
       FROM challenges c WHERE c.group_id=$1 AND c.status <> 'archived' ORDER BY ${group.is_official ? "c.start_at ASC" : "c.start_at DESC"}`, [group.id]); // official hunt: Week 1 at the top
  return json({ challenges: rows.map((c) => ({ ...c, phase: phaseOf(c) })) });
});
route("GET", "/groups/:gid/challenges/:cid", "owner", async ({ params, group }) => {
  const c = await getChallenge(group.id, int(params.cid, "challenge"));
  if (!c) fail(404, "Challenge not found");
  const items = await q(`SELECT id, challenge_id, title, description, instructions, difficulty, points, hint, display_order, (reference_image_key IS NOT NULL) AS has_reference FROM challenge_items WHERE challenge_id=$1 ORDER BY display_order, id`, [c.id]);
  const subs = (await q(`SELECT count(*)::int AS n FROM submissions s JOIN challenge_items i ON i.id=s.item_id WHERE i.challenge_id=$1`, [c.id]))[0].n;
  return json({ challenge: { ...c, phase: phaseOf(c), submission_count: subs, tie_rule: TIE_RULE }, items });
});
route("POST", "/groups/:gid/challenges", "owner", async ({ req, group, user }) => {
  const c = parseChallenge(await body(req));
  if (group.is_official) c.prize = 0; // the official hunt has no cash prize
  const r = (await q(`INSERT INTO challenges (group_id, title, description, rules, start_at, end_at, prize_amount) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [group.id, c.title, c.description, c.rules, c.start, c.end, c.prize]))[0];
  await audit(user.id, group.id, "create_challenge", "challenge", r.id, { title: c.title });
  return json({ id: r.id });
});
route("PUT", "/groups/:gid/challenges/:cid", "owner", async ({ req, params, group, user }) => {
  const id = int(params.cid, "challenge");
  const cur = await getChallenge(group.id, id);
  requireDraft(cur);
  const c = parseChallenge(await body(req));
  if (group.is_official) c.prize = 0;
  await q(`UPDATE challenges SET title=$2, description=$3, rules=$4, start_at=$5, end_at=$6, prize_amount=$7 WHERE id=$1 AND group_id=$8`, [id, c.title, c.description, c.rules, c.start, c.end, c.prize, group.id]);
  await audit(user.id, group.id, "edit_challenge", "challenge", id, { title: c.title });
  return json({ ok: true });
});
route("DELETE", "/groups/:gid/challenges/:cid", "owner", async ({ params, group, user }) => {
  const id = int(params.cid, "challenge");
  const c = await getChallenge(group.id, id);
  if (!c) fail(404, "Challenge not found");
  const subs = (await q(`SELECT count(*)::int AS n FROM submissions s JOIN challenge_items i ON i.id=s.item_id WHERE i.challenge_id=$1`, [id]))[0].n;
  if (subs > 0 || c.status === "published" && phaseOf(c) !== "upcoming") {
    await q(`UPDATE challenges SET status='archived' WHERE id=$1 AND group_id=$2`, [id, group.id]);
    await audit(user.id, group.id, "archive_challenge", "challenge", id);
    return json({ ok: true, result: "archived" });
  }
  await q(`DELETE FROM challenges WHERE id=$1 AND group_id=$2`, [id, group.id]);
  await audit(user.id, group.id, "delete_challenge", "challenge", id);
  return json({ ok: true, result: "deleted" });
});
route("POST", "/groups/:gid/challenges/:cid/publish", "owner", async ({ params, group, user }) => {
  const id = int(params.cid, "challenge");
  const c = await getChallenge(group.id, id);
  requireDraft(c);
  const n = (await q(`SELECT count(*)::int AS n FROM challenge_items WHERE challenge_id=$1`, [id]))[0].n;
  if (n === 0) fail(400, "Add at least one item before publishing");
  if (new Date(c.end_at) <= Date.now()) fail(400, "The end time is already in the past. Edit the dates first.");
  const clash = await q(`SELECT title FROM challenges WHERE group_id=$1 AND status='published' AND id<>$2 AND start_at < $4 AND end_at > $3 LIMIT 1`, [group.id, id, c.start_at, c.end_at]);
  if (clash[0]) fail(409, `These dates overlap "${clash[0].title}". Only one challenge can run at a time in a hunt.`);
  await q(
    `UPDATE challenges SET status='published', published_at=now(),
            week_number = COALESCE((SELECT max(week_number) FROM challenges WHERE group_id=$2),0) + 1
      WHERE id=$1 AND group_id=$2 AND status='draft'`, [id, group.id]);
  await audit(user.id, group.id, "publish_challenge", "challenge", id, { title: c.title });
  await runLifecycle().catch((e) => console.error(e));
  return json({ ok: true });
});
route("POST", "/groups/:gid/challenges/:cid/unpublish", "owner", async ({ params, group, user }) => {
  const id = int(params.cid, "challenge");
  const c = await getChallenge(group.id, id);
  if (!c || phaseOf(c) !== "upcoming") fail(409, "Only a scheduled challenge that hasn't started can be unpublished");
  await q(`UPDATE challenges SET status='draft', week_number=NULL, published_at=NULL WHERE id=$1 AND group_id=$2`, [id, group.id]);
  await audit(user.id, group.id, "unpublish_challenge", "challenge", id);
  return json({ ok: true });
});
route("POST", "/groups/:gid/challenges/:cid/items", "owner", async ({ req, params, group, user }) => {
  const id = int(params.cid, "challenge");
  const ch = await getChallenge(group.id, id);
  // The official hunt runs for a year, so its admins may keep adding items after publishing (never editing or removing them).
  const growing = group.is_official && ch?.status === "published" && phaseOf(ch) !== "closed";
  if (!growing) requireDraft(ch);
  const it = parseItem(await body(req));
  const r = (await q(
    `INSERT INTO challenge_items (challenge_id, title, description, instructions, difficulty, points, hint, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE((SELECT max(display_order)+1 FROM challenge_items WHERE challenge_id=$1),1)) RETURNING id`,
    [id, it.title, it.description, it.instructions, it.difficulty, it.points, it.hint]))[0];
  await audit(user.id, group.id, "add_item", "item", r.id, { title: it.title, points: it.points });
  if (growing && phaseOf(ch) === "active") {
    // In-app only (no email), so a burst of new items doesn't flood inboxes.
    await q(`INSERT INTO notifications (user_id, group_id, type, title, message, link)
             SELECT user_id, $1, 'new_item', $2, $3, $4 FROM group_members WHERE group_id=$1 AND role='player' AND status='active'`,
      [group.id, group.name, `🆕 New item in ${group.name}: '${it.title}' (${it.points} pips).`, `/g/${group.id}/hunt`]);
    const players = (await q(`SELECT user_id FROM group_members WHERE group_id=$1 AND role='player' AND status='active'`, [group.id])).map((m) => m.user_id);
    await pushGame(players, { title: group.name, body: `🆕 New item: '${it.title}' (${it.points} pips).`, url: `/g/${group.id}/hunt`, tag: `new_item-${group.id}` });
  }
  return json({ id: r.id });
});
route("POST", "/groups/:gid/challenges/:cid/reorder", "owner", async ({ req, params, group, user }) => {
  const id = int(params.cid, "challenge");
  requireDraft(await getChallenge(group.id, id));
  const order = (await body(req)).order;
  if (!Array.isArray(order) || !order.every(Number.isInteger)) fail(400, "Invalid order");
  await q(`UPDATE challenge_items i SET display_order = t.pos FROM unnest($1::int[]) WITH ORDINALITY AS t(id, pos) WHERE i.id = t.id AND i.challenge_id = $2`, [order, id]);
  return json({ ok: true });
});
route("PUT", "/groups/:gid/items/:id", "owner", async ({ req, params, group, user }) => {
  const cur = await itemInGroup(group, int(params.id));
  if (cur.c_status !== "draft") fail(409, "This challenge is published, so its items are locked");
  const it = parseItem(await body(req));
  await q(`UPDATE challenge_items SET title=$2, description=$3, instructions=$4, difficulty=$5, points=$6, hint=$7 WHERE id=$1`, [cur.id, it.title, it.description, it.instructions, it.difficulty, it.points, it.hint]);
  await audit(user.id, group.id, "edit_item", "item", cur.id, { title: it.title, points: it.points });
  return json({ ok: true });
});
route("DELETE", "/groups/:gid/items/:id", "owner", async ({ params, group, user }) => {
  const cur = await itemInGroup(group, int(params.id));
  if (cur.c_status !== "draft") fail(409, "This challenge is published, so its items are locked");
  await q(`DELETE FROM challenge_items WHERE id=$1`, [cur.id]);
  if (cur.reference_image_key) deleteObject(cur.reference_image_key).catch(() => {});
  await audit(user.id, group.id, "delete_item", "item", cur.id);
  return json({ ok: true });
});
route("POST", "/groups/:gid/items/:id/reference", "owner", async ({ req, params, group }) => {
  const cur = await itemInGroup(group, int(params.id));
  // Official hunt: an item added after publishing may get its first reference picture, but never a replacement.
  if (cur.c_status !== "draft" && !(group.is_official && cur.c_status === "published" && !cur.reference_image_key)) fail(409, "This challenge is published, so its items are locked");
  const key = await saveImage(`ref/${group.id}`, await readImage(await readForm(req), "image"));
  await q(`UPDATE challenge_items SET reference_image_key=$2 WHERE id=$1`, [cur.id, key]);
  if (cur.reference_image_key) deleteObject(cur.reference_image_key).catch(() => {});
  return json({ ok: true });
});
route("DELETE", "/groups/:gid/items/:id/reference", "owner", async ({ params, group }) => {
  const cur = await itemInGroup(group, int(params.id));
  if (cur.c_status !== "draft") fail(409, "This challenge is published, so its items are locked");
  await q(`UPDATE challenge_items SET reference_image_key=NULL WHERE id=$1`, [cur.id]);
  if (cur.reference_image_key) deleteObject(cur.reference_image_key).catch(() => {});
  return json({ ok: true });
});

/* ---- prizes ---- */
route("GET", "/groups/:gid/prizes", "owner", async ({ group }) => {
  await runLifecycle().catch((e) => console.error(e));
  const rows = await q(
    `SELECT p.id, p.amount, p.status, p.paid_at, p.payout_note, c.title, c.week_number, c.end_at, w.nickname AS winner
       FROM prizes p JOIN challenges c ON c.id=p.challenge_id LEFT JOIN users w ON w.id=p.winner_user_id
      WHERE p.group_id=$1 ORDER BY c.end_at DESC LIMIT 100`, [group.id]);
  return json({ prizes: rows });
});
route("POST", "/groups/:gid/prizes/:pid/paid", "owner", async ({ req, params, group, user }) => {
  const note = text((await body(req).catch(() => ({}))).note, 300, "Payment note");
  const r = await q(`UPDATE prizes SET status='paid', paid_at=now(), payout_note=$3 WHERE id=$1 AND group_id=$2 AND status='pending' AND winner_user_id IS NOT NULL RETURNING id`, [int(params.pid), group.id, note || null]);
  if (!r[0]) fail(409, "This prize can't be marked as paid");
  await audit(user.id, group.id, "mark_prize_paid", "prize", params.pid, { note });
  return json({ ok: true });
});

/* ---- audit & settings ---- */
route("GET", "/groups/:gid/audit", "owner", async ({ group }) => {
  const rows = await q(`SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at, u.nickname AS admin FROM audit_logs a LEFT JOIN users u ON u.id=a.admin_user_id WHERE a.group_id=$1 ORDER BY a.created_at DESC LIMIT 150`, [group.id]);
  return json({ logs: rows });
});
/** Permanently delete a hunt: the admin must type its exact name. Everything in the hunt cascades away in the database; its photos are removed from storage afterwards. Members get an in-app note (group_id NULL, so it survives). */
route("DELETE", "/groups/:gid", "founder", async ({ req, group, user }) => {
  const b = await body(req);
  const norm = (v) => String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase(); // capitals don't matter
  if (norm(b.confirm) !== norm(group.name)) fail(400, "Type the hunt's name to delete it");
  const keys = await groupPhotoKeys(group.id);
  const members = await q(`SELECT user_id FROM group_members WHERE group_id=$1 AND status='active' AND user_id<>$2`, [group.id, user.id]);
  await deleteObjects(keys); // photos first, so a storage failure never leaves orphaned photos
  await q(`DELETE FROM groups WHERE id=$1 AND owner_user_id=$2`, [group.id, user.id]);
  if (members.length) {
    await q(`INSERT INTO notifications (user_id, group_id, type, title, message, link)
             SELECT u, NULL, 'hunt_deleted', 'Hunt deleted', $2, '/' FROM unnest($1::int[]) AS u`,
      [members.map((m) => m.user_id), `${user.nickname} deleted the hunt "${group.name}".`]);
  }
  return json({ ok: true, photos_removed: keys.length });
});
route("GET", "/groups/:gid/settings", "owner", async ({ group }) =>
  json({ settings: withDefaults(group.settings), is_public: group.is_public, email_configured: emailConfigured() }));
route("PUT", "/groups/:gid/public", "owner", async ({ req, group, user }) => {
  const on = Boolean((await body(req)).is_public);
  await q(`UPDATE groups SET is_public=$2 WHERE id=$1`, [group.id, on]);
  await audit(user.id, group.id, on ? "list_in_global_search" : "unlist_from_global_search", "group", group.id);
  return json({ ok: true });
});
route("PUT", "/groups/:gid/settings", "owner", async ({ req, group, user }) => {
  const b = await body(req);
  const patch = {};
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (!(k in b)) continue;
    if (k === "reminder_hours") {
      const h = Number(b[k]);
      if (!Number.isInteger(h) || h < 1 || h > 72) fail(400, "Reminder must be between 1 and 72 hours");
      patch[k] = h;
    } else patch[k] = Boolean(b[k]);
  }
  await q(`UPDATE groups SET settings = settings || $2::jsonb WHERE id=$1`, [group.id, JSON.stringify(patch)]);
  await audit(user.id, group.id, "update_settings", "group", group.id, patch);
  return json({ ok: true });
});

/* ================= global search =================
 Groups an admin has listed publicly. Anyone can find and join them; pips earned in them count toward the global ranking. */
route("GET", "/global", "user", async ({ url, user }) => {
  const term = (url.searchParams.get("q") || "").trim().slice(0, 60);
  const like = term ? `%${term.replace(/[%_\\]/g, "")}%` : null;
  const groups = await q(
    `SELECT g.id, g.name, g.description, (g.image_key IS NOT NULL) AS has_image, gm.status AS my_status, CASE WHEN gm.role='admin' THEN 'owner' ELSE gm.role END AS my_role,
            (SELECT count(*) FROM group_members m WHERE m.group_id=g.id AND m.role='player' AND m.status='active')::int AS members,
            (SELECT c.title FROM challenges c WHERE c.group_id=g.id AND c.status='published' AND c.start_at <= now() AND c.end_at > now() LIMIT 1) AS live_title
       FROM groups g LEFT JOIN group_members gm ON gm.group_id=g.id AND gm.user_id=$1
      WHERE g.is_public AND g.status='active' AND ($2::text IS NULL OR g.name ILIKE $2 OR g.description ILIKE $2)
      ORDER BY g.is_official DESC, members DESC, g.created_at DESC LIMIT 30`,
    [user.id, like]
  );
  const ranks = await q(
    `WITH t AS (
       -- Pips from public hunts plus pips from star catches.
       SELECT x.user_id, sum(x.points)::int AS points, max(x.at) AS reached_at FROM (
         SELECT pt.user_id, pt.points, pt.earned_at AS at
           FROM point_transactions pt JOIN groups g ON g.id=pt.group_id AND g.is_public AND g.status='active'
         UNION ALL
         SELECT sc.user_id, sc.pips, sc.caught_at FROM star_catches sc
         UNION ALL
         SELECT b.user_id, b.pips, b.created_at FROM pip_bonuses b
       ) x JOIN users u ON u.id=x.user_id AND u.status='active'
        GROUP BY x.user_id HAVING sum(x.points) > 0
     ), r AS (
       SELECT t.*, rank() OVER (ORDER BY t.points DESC, t.reached_at ASC) AS rank, count(*) OVER () AS total FROM t
     )
     SELECT r.user_id, r.points, r.rank::int AS rank, r.total::int AS total, u.nickname
       FROM r JOIN users u ON u.id=r.user_id WHERE r.rank <= 10 OR r.user_id=$1 ORDER BY r.rank, lower(u.nickname)`,
    [user.id]
  );
  const mine = ranks.find((r) => r.user_id === user.id);
  return json({
    groups: groups.map((g) => ({ id: g.id, name: g.name, description: g.description, has_image: g.has_image, members: g.members, live_title: g.live_title, joined: g.my_status === "active", role: g.my_role })),
    top: ranks.filter((r) => r.rank <= 10).map((r) => ({ rank: r.rank, nickname: r.nickname, points: r.points, me: r.user_id === user.id })),
    me: { rank: mine?.rank ?? null, points: mine?.points ?? 0, total: ranks[0]?.total ?? 0 },
  });
});
route("POST", "/global/:gid/join", "user", async ({ params, user, ip }) => {
  await rateLimit(`join:${ip}`, 30, 600);
  const g = (await q(`SELECT id FROM groups WHERE id=$1 AND is_public AND status='active'`, [int(params.gid, "group")]))[0];
  if (!g) fail(404, "This hunt isn't open to everyone any more");
  return addPlayer(g.id, user.id);
});

/* ================= 1v1 duels =================
 The creator shares /vs/<token>; the first person to accept is locked in as the opponent and nobody else can use the link.
 Each player writes item_count items for the other to find and taps Done. The timer starts only when both lists are done.
 You hunt your opponent's list, and you judge the photos sent for the items you wrote. Most approved items wins. */
async function duelFor(user, idParam) {
  const d = (await q(`SELECT * FROM duels WHERE id=$1`, [int(idParam, "1v1")]))[0];
  if (!d || !isPlayer(d, user.id)) fail(404, "1v1 not found");
  return d;
}
const duelAlert = (userIds, message, d) => notify(DUEL_GROUP, "duel", userIds, message, `/duel/${d.id}`).catch((e) => console.error(e));
const LINK_USED = "This 1v1 link has already been used. Each link works for one person only.";

route("POST", "/duels", "user", async ({ req, user }) => {
  await rateLimit(`mkduel:${user.id}`, 20, 3600);
  const b = await body(req);
  const minutes = Number(b.minutes), items = Number(b.items);
  if (!DUEL_DURATIONS.includes(minutes)) fail(400, "Pick a time limit");
  if (!Number.isInteger(items) || items < 1 || items > DUEL_MAX_ITEMS) fail(400, `Pick 1 to ${DUEL_MAX_ITEMS} items each`);
  const d = (await q(`INSERT INTO duels (token, creator_id, duration_minutes, item_count) VALUES ($1,$2,$3,$4) RETURNING id`, [newToken(16), user.id, minutes, items]))[0];
  return json({ id: d.id });
});

route("GET", "/duels", "user", async ({ user }) => {
  await runDuelLifecycle().catch((e) => console.error(e));
  const rows = await q(
    `SELECT d.id, d.status, d.end_at, d.duration_minutes, d.item_count, d.winner_id, d.created_at, d.creator_id, u.nickname AS opponent
       FROM duels d LEFT JOIN users u ON u.id = CASE WHEN d.creator_id=$1 THEN d.opponent_id ELSE d.creator_id END
      WHERE (d.creator_id=$1 OR d.opponent_id=$1) AND d.status <> 'cancelled' ORDER BY d.created_at DESC LIMIT 50`,
    [user.id]
  );
  const record = (await q(
    `SELECT (count(*) FILTER (WHERE winner_id=$1))::int AS wins, (count(*) FILTER (WHERE winner_id IS NOT NULL AND winner_id<>$1))::int AS losses,
            (count(*) FILTER (WHERE winner_id IS NULL))::int AS ties
       FROM duels WHERE status='finished' AND (creator_id=$1 OR opponent_id=$1)`,
    [user.id]
  ))[0];
  return json({
    record,
    duels: rows.map((r) => ({
      id: r.id, phase: duelPhase(r), opponent: r.opponent, minutes: r.duration_minutes, item_count: r.item_count, end_at: r.end_at, created_at: r.created_at,
      result: r.status !== "finished" ? null : r.winner_id == null ? "tie" : r.winner_id === user.id ? "won" : "lost",
    })),
    now: Date.now(),
  });
});

route("GET", "/vs/:token", "public", async ({ req, params, ip }) => {
  await rateLimit(`invite:${ip}`, 60, 600);
  const d = (await q(`SELECT d.id, d.creator_id, d.opponent_id, d.status, d.duration_minutes, d.item_count, u.nickname AS host FROM duels d JOIN users u ON u.id=d.creator_id WHERE d.token=$1`, [params.token]))[0];
  if (!d || d.status === "cancelled") fail(404, "This 1v1 link isn't valid. Ask your friend for a new one.");
  const user = await currentUser(req);
  const player = Boolean(user && isPlayer(d, user.id));
  if (d.opponent_id && !player) fail(410, LINK_USED);
  return json({ host: d.host, minutes: d.duration_minutes, items: d.item_count, id: player ? d.id : null, own: user?.id === d.creator_id });
});
route("POST", "/vs/:token/accept", "user", async ({ params, user, ip }) => {
  await rateLimit(`join:${ip}`, 30, 600);
  // Atomic: only the first person to accept gets the seat.
  const d = (await q(
    `UPDATE duels SET opponent_id=$2, status='setup' WHERE token=$1 AND status='waiting' AND opponent_id IS NULL AND creator_id<>$2 RETURNING *`,
    [params.token, user.id]
  ))[0];
  if (d) {
    await duelAlert([d.creator_id], `⚔️ ${user.nickname} accepted your 1v1! Write your ${d.item_count}-item list to get the timer going.`, d);
    return json({ id: d.id });
  }
  const cur = (await q(`SELECT id, creator_id, opponent_id, status FROM duels WHERE token=$1`, [params.token]))[0];
  if (!cur || cur.status === "cancelled") fail(404, "This 1v1 link isn't valid. Ask your friend for a new one.");
  if (cur.creator_id === user.id && !cur.opponent_id) fail(400, "This is your own link. Send it to the person you want to play.");
  if (isPlayer(cur, user.id)) return json({ id: cur.id });
  fail(410, LINK_USED);
});

/** Latest submission of a player for an item: approved, then pending, then newest. */
const latestSub = (subs, itemId, uid) =>
  subs.filter((s) => s.item_id === itemId && s.user_id === uid)
    .sort((a, b) => (b.status === "approved") - (a.status === "approved") || (b.status === "pending") - (a.status === "pending") || new Date(b.submitted_at) - new Date(a.submitted_at))[0];

route("GET", "/duels/:id", "user", async ({ user, params }) => {
  await runDuelLifecycle().catch((e) => console.error(e));
  const d = await duelFor(user, params.id);
  const phase = duelPhase(d);
  const mine = d.creator_id === user.id;
  const them = opponentOf(d, user.id);
  const started = ["live", "judging", "finished"].includes(phase);
  const items = await q(`SELECT id, setter_id, title, instructions FROM duel_items WHERE duel_id=$1 ORDER BY display_order, id`, [d.id]);
  const subs = await q(`SELECT id, item_id, user_id, status, submitted_at, reviewed_at, rejection_reason, ${PHOTO_COUNT("")} AS photos FROM duel_submissions WHERE duel_id=$1`, [d.id]);
  const withStatus = (it, n, hunter) => {
    const s = started ? latestSub(subs, it.id, hunter) : null;
    return { id: it.id, number: n + 1, title: it.title, instructions: it.instructions, status: s?.status || "not_submitted", submission_id: s?.id || null, rejection_reason: s?.status === "rejected" ? s.rejection_reason : null };
  };
  const sc = started ? await duelScores(d) : null;
  const themName = them ? (await q(`SELECT nickname FROM users WHERE id=$1`, [them]))[0]?.nickname : null;
  return json({
    now: Date.now(),
    duel: {
      id: d.id, phase, minutes: d.duration_minutes, item_count: d.item_count, start_at: d.start_at, end_at: d.end_at, mine, grace_minutes: REVIEW_GRACE_MINUTES,
      token: mine && phase === "waiting" ? d.token : null,
      result: phase !== "finished" ? null : d.winner_id == null ? "tie" : d.winner_id === user.id ? "won" : "lost",
      purged: Boolean(d.purged_at), retain_days: RETAIN_DAYS,
    },
    me: { nickname: user.nickname, ready: mine ? d.creator_ready : d.opponent_ready, written: items.filter((i) => i.setter_id === user.id).length, score: sc?.[user.id].items ?? 0 },
    them: them ? { nickname: themName, ready: mine ? d.opponent_ready : d.creator_ready, written: items.filter((i) => i.setter_id === them).length, score: sc?.[them].items ?? 0 } : null,
    // Your own list (how your opponent is doing on it once the timer starts), and the list you hunt (hidden until the timer starts).
    my_list: items.filter((i) => i.setter_id === user.id).map((it, n) => withStatus(it, n, them)),
    hunt: started ? items.filter((i) => i.setter_id === them).map((it, n) => withStatus(it, n, user.id)) : [],
    // Finds: every approved photo pair from both players, newest approval first. Only the two players can load these photos.
    finds: started ? subs.filter((s) => s.status === "approved")
      .sort((a, b) => new Date(b.reviewed_at || b.submitted_at) - new Date(a.reviewed_at || a.submitted_at))
      .map((s) => ({ id: s.id, photos: s.photos, mine: s.user_id === user.id, nickname: s.user_id === user.id ? user.nickname : themName, title: items.find((i) => i.id === s.item_id)?.title, found_at: s.reviewed_at || s.submitted_at })) : [],
    review: subs.filter((s) => s.user_id === them && s.status === "pending").sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))
      .map((s) => { const it = items.find((i) => i.id === s.item_id); return { id: s.id, photos: s.photos, item_title: it?.title, instructions: it?.instructions, submitted_at: s.submitted_at }; }),
  });
});

/** Lists can be edited only during setup, and only while your list isn't marked Done. */
async function duelSetup(user, idParam) {
  const d = await duelFor(user, idParam);
  if (d.status !== "setup") fail(409, d.status === "waiting" ? "Wait for your opponent to accept the link first" : "The lists are locked once the timer starts");
  if (d.creator_id === user.id ? d.creator_ready : d.opponent_ready) fail(409, "Tap Edit my list first to make changes");
  return d;
}
const duelItem = (b) => ({ title: text(b.title, 160, "Item", true), instructions: text(b.instructions, 1000, "Instructions") });
async function ownDuelItem(d, user, iid) {
  const it = (await q(`SELECT id FROM duel_items WHERE id=$1 AND duel_id=$2 AND setter_id=$3`, [int(iid), d.id, user.id]))[0];
  if (!it) fail(404, "Item not found");
  return it;
}

route("POST", "/duels/:id/items", "user", async ({ req, user, params }) => {
  const d = await duelSetup(user, params.id);
  const it = duelItem(await body(req));
  const r = (await q(
    `INSERT INTO duel_items (duel_id, setter_id, title, instructions, display_order)
     SELECT $1, $2, $3, $4, count(*) + 1 FROM duel_items WHERE duel_id=$1 AND setter_id=$2 HAVING count(*) < $5 RETURNING id`,
    [d.id, user.id, it.title, it.instructions, d.item_count]
  ))[0];
  if (!r) fail(409, `Your list already has ${d.item_count} item${d.item_count === 1 ? "" : "s"}`);
  return json({ id: r.id });
});
route("PUT", "/duels/:id/items/:iid", "user", async ({ req, user, params }) => {
  const d = await duelSetup(user, params.id);
  const cur = await ownDuelItem(d, user, params.iid);
  const it = duelItem(await body(req));
  await q(`UPDATE duel_items SET title=$2, instructions=$3 WHERE id=$1`, [cur.id, it.title, it.instructions]);
  return json({ ok: true });
});
route("DELETE", "/duels/:id/items/:iid", "user", async ({ user, params }) => {
  const d = await duelSetup(user, params.id);
  await q(`DELETE FROM duel_items WHERE id=$1`, [(await ownDuelItem(d, user, params.iid)).id]);
  return json({ ok: true });
});

route("POST", "/duels/:id/ready", "user", async ({ req, user, params }) => {
  const ready = Boolean((await body(req)).ready);
  const d = await duelFor(user, params.id);
  if (d.status !== "setup") fail(409, d.status === "waiting" ? "Wait for your opponent to accept the link first" : "The timer has already started");
  if (ready) {
    const n = (await q(`SELECT count(*)::int AS n FROM duel_items WHERE duel_id=$1 AND setter_id=$2`, [d.id, user.id]))[0].n;
    if (n !== d.item_count) fail(400, `Add all ${d.item_count} items first (you have ${n})`);
  }
  await q(`UPDATE duels SET ${d.creator_id === user.id ? "creator_ready" : "opponent_ready"}=$2 WHERE id=$1 AND status='setup'`, [d.id, ready]);
  // Runs after our own flag is saved, so whichever player taps Done second always starts the timer.
  const started = (await q(
    `UPDATE duels SET status='live', start_at=now(), end_at=now() + make_interval(mins => duration_minutes)
      WHERE id=$1 AND status='setup' AND creator_ready AND opponent_ready RETURNING id`,
    [d.id]
  ))[0];
  const them = opponentOf(d, user.id);
  if (started) await duelAlert([them, user.id], "⏱️ Both lists are done. Your 1v1 timer has started. Go hunt!", d);
  else if (ready) await duelAlert([them], `✅ ${user.nickname} finished their list. Finish yours to start the timer.`, d);
  return json({ ok: true, started: Boolean(started) });
});

route("POST", "/duels/:id/cancel", "user", async ({ user, params }) => {
  const d = await duelFor(user, params.id);
  const r = await q(`UPDATE duels SET status='cancelled' WHERE id=$1 AND status IN ('waiting','setup') RETURNING id`, [d.id]);
  if (!r[0]) fail(409, "A 1v1 can't be called off once the timer has started");
  if (d.opponent_id) await duelAlert([opponentOf(d, user.id)], `${user.nickname} called off your 1v1.`, d);
  return json({ ok: true });
});

route("POST", "/duels/:id/items/:iid/submit", "user", async ({ req, user, params }) => {
  await rateLimit(`submit:${user.id}`, 30, 600);
  const d = await duelFor(user, params.id);
  if (duelPhase(d) !== "live") fail(409, "The timer isn't running, so photos can't be sent");
  const them = opponentOf(d, user.id);
  const item = (await q(`SELECT id, title FROM duel_items WHERE id=$1 AND duel_id=$2 AND setter_id=$3`, [int(params.iid), d.id, them]))[0];
  if (!item) fail(404, "Item not found");
  const existing = (await q(`SELECT status FROM duel_submissions WHERE user_id=$1 AND item_id=$2 AND status IN ('pending','approved')`, [user.id, item.id]))[0];
  if (existing) fail(409, existing.status === "approved" ? "This item is already approved" : "Your photos for this item are waiting to be judged");
  const form = await readForm(req);
  const imgs = await readPhotos(form);
  const { keys, thumbs } = await savePhotos(`duel/${d.id}/${user.id}`, imgs);
  try {
    await q(`INSERT INTO duel_submissions (duel_id, item_id, user_id, photo_1_key, photo_2_key, extra_photo_keys, thumb_keys) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [d.id, item.id, user.id, keys[0], keys[1] || null, keys.slice(2), thumbs]);
  } catch (e) {
    await Promise.allSettled([...keys, ...thumbs].filter(Boolean).map((k) => deleteObject(k)));
    if (e.code === "23505") fail(409, "You already sent photos for this item");
    throw e;
  }
  await duelAlert([them], `📸 ${user.nickname} sent proof for '${item.title}'. Judge them now.`, d);
  return json({ ok: true });
});

/** 1v1 photos: only the two players in that 1v1. */
route("GET", "/duel-photo/:id/:n", "user", async ({ params, user, url }) => {
  const s = (await q(`SELECT s.photo_1_key, s.photo_2_key, s.extra_photo_keys, s.thumb_keys, d.creator_id, d.opponent_id FROM duel_submissions s JOIN duels d ON d.id=s.duel_id WHERE s.id=$1`, [int(params.id)]))[0];
  if (!s || !isPlayer(s, user.id)) fail(404, "Not found");
  return serveImage(photoAt(s, params.n, wantsThumb(url)));
});

/** Only the player who wrote an item judges photos for it. Judging stays open after the timer until the review window closes. */
async function judgeDuel(user, params, sql, extra = []) {
  const d = await duelFor(user, params.id);
  if (d.status !== "live") fail(409, "This 1v1 is already over");
  const r = (await q(sql, [int(params.sid), d.id, user.id, ...extra]))[0];
  if (!r) fail(409, "These photos were already judged");
  return { d, r };
}
route("POST", "/duels/:id/submissions/:sid/approve", "user", async ({ user, params }) => {
  const { d, r } = await judgeDuel(user, params,
    `UPDATE duel_submissions s SET status='approved', reviewed_at=now() FROM duel_items i
      WHERE s.id=$1 AND s.duel_id=$2 AND s.status='pending' AND i.id=s.item_id AND i.setter_id=$3 RETURNING s.user_id, i.title`);
  await duelAlert([r.user_id], `✅ ${user.nickname} approved your photos for '${r.title}'.`, d);
  await runDuelLifecycle().catch((e) => console.error(e));
  return json({ ok: true });
});
route("POST", "/duels/:id/submissions/:sid/reject", "user", async ({ req, user, params }) => {
  const reason = text((await body(req)).reason, 300, "Rejection reason", true);
  if (reason.length < 3) fail(400, "Tell your opponent why");
  const { d, r } = await judgeDuel(user, params,
    `UPDATE duel_submissions s SET status='rejected', reviewed_at=now(), rejection_reason=$4 FROM duel_items i
      WHERE s.id=$1 AND s.duel_id=$2 AND s.status='pending' AND i.id=s.item_id AND i.setter_id=$3 RETURNING s.user_id, i.title`, [reason]);
  await duelAlert([r.user_id], `❌ ${user.nickname} rejected your photos for '${r.title}'. Tap to see why.`, d);
  await runDuelLifecycle().catch((e) => console.error(e));
  return json({ ok: true });
});


/* ================= Team vs =================
 The creator captains team A and shares the rival link; the first person to accept captains team B.
 Each team then has its own teammate link. One account can only be on one team per match (primary key match_id+user_id).
 Each team writes item_count items for the other team. When both teams are full and both captains tap Done, the timer starts.
 Any teammate can send proof for any item on their hunt (it counts once for the team); any member of the team that
 wrote the item judges it. Most items found wins; ties go to whoever got there first. */
async function matchFor(user, idParam) {
  const m = (await q(`SELECT * FROM team_matches WHERE id=$1`, [int(idParam, "match")]))[0];
  const me = m && (await q(`SELECT side, is_captain FROM team_members WHERE match_id=$1 AND user_id=$2`, [m.id, user.id]))[0];
  if (!me) fail(404, "Team match not found");
  return { m, side: me.side, captain: me.is_captain };
}
const teamAlert = (userIds, message, m) => userIds.length && notify(TEAM_GROUP, "team", userIds, message, `/team/${m.id}`).catch((e) => console.error(e));
const sideIds = async (m, side) => (await q(`SELECT user_id FROM team_members WHERE match_id=$1 AND side=$2`, [m.id, side])).map((r) => r.user_id);
const TEAM_NAME = { a: "Team A", b: "Team B" };
const teamName = (m, k) => (k === "a" ? m.a_name : m.b_name) || TEAM_NAME[k];
/** Optional team name typed by a captain: 2-24 characters, single spaces. Empty means "use Team A/B". */
const cleanTeamName = (v) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (s.length < 2) fail(400, "Team name needs at least 2 characters");
  if (s.length > 24) fail(400, "Team name is too long (max 24 characters)");
  return s;
};

route("POST", "/teams", "user", async ({ req, user }) => {
  await rateLimit(`mkteam:${user.id}`, 20, 3600);
  const b = await body(req);
  const size = Number(b.size), minutes = Number(b.minutes), items = Number(b.items);
  if (!TEAM_SIZES.includes(size)) fail(400, "Pick a team size");
  if (!DUEL_DURATIONS.includes(minutes)) fail(400, "Pick a time limit");
  if (!Number.isInteger(items) || items < 1 || items > TEAM_MAX_ITEMS) fail(400, `Pick 1 to ${TEAM_MAX_ITEMS} items per team`);
  const name = cleanTeamName(b.name);
  const m = (await q(
    `INSERT INTO team_matches (rival_token, a_token, b_token, creator_id, team_size, duration_minutes, item_count, a_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [newToken(16), newToken(16), newToken(16), user.id, size, minutes, items, name]))[0];
  await q(`INSERT INTO team_members (match_id, user_id, side, is_captain) VALUES ($1,$2,'a',true)`, [m.id, user.id]);
  return json({ id: m.id });
});

route("GET", "/teams", "user", async ({ user }) => {
  await runDuelLifecycle().catch((e) => console.error(e));
  const rows = await q(
    `SELECT m.id, m.status, m.end_at, m.team_size, m.duration_minutes, m.item_count, m.winner_side, m.created_at, tm.side, m.a_name, m.b_name,
            (SELECT u.nickname FROM team_members c JOIN users u ON u.id=c.user_id WHERE c.match_id=m.id AND c.side <> tm.side AND c.is_captain) AS rival
       FROM team_members tm JOIN team_matches m ON m.id=tm.match_id
      WHERE tm.user_id=$1 AND m.status <> 'cancelled' ORDER BY m.created_at DESC LIMIT 50`, [user.id]);
  const res = (r) => (r.status !== "finished" ? null : r.winner_side == null ? "tie" : r.winner_side === r.side ? "won" : "lost");
  const record = { wins: 0, losses: 0, ties: 0 };
  for (const r of rows) { const x = res(r); if (x === "won") record.wins++; else if (x === "lost") record.losses++; else if (x === "tie") record.ties++; }
  return json({
    record,
    matches: rows.map((r) => ({ id: r.id, phase: matchPhase(r), us: teamName(r, r.side), them: r.rival ? teamName(r, other(r.side)) : null, size: r.team_size, items: r.item_count, minutes: r.duration_minutes, rival: r.rival, end_at: r.end_at, created_at: r.created_at, result: res(r) })),
    now: Date.now(),
  });
});

/** Rival or teammate link. Says what it is and whether it can still be used. */
async function teamLink(token) {
  const m = (await q(`SELECT * FROM team_matches WHERE rival_token=$1 OR a_token=$1 OR b_token=$1`, [String(token).slice(0, 64)]))[0];
  if (!m || m.status === "cancelled") fail(404, "This team link isn't valid. Ask your friend for a new one.");
  const kind = m.rival_token === token ? "rival" : "mate";
  const side = kind === "rival" ? "b" : m.a_token === token ? "a" : "b";
  return { m, kind, side };
}
route("GET", "/t/:token", "public", async ({ req, params, ip }) => {
  await rateLimit(`invite:${ip}`, 60, 600);
  const { m, kind, side } = await teamLink(params.token);
  const user = await currentUser(req);
  const mine = user && (await q(`SELECT side FROM team_members WHERE match_id=$1 AND user_id=$2`, [m.id, user.id]))[0];
  const count = (await q(`SELECT side, count(*)::int AS n FROM team_members WHERE match_id=$1 GROUP BY side`, [m.id])).reduce((o, r) => ({ ...o, [r.side]: r.n }), { a: 0, b: 0 });
  const captain = (await q(`SELECT u.nickname FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.match_id=$1 AND tm.side=$2 AND tm.is_captain`, [m.id, kind === "rival" ? "a" : side]))[0]?.nickname;
  if (!mine) {
    if (kind === "rival" && m.status !== "waiting") fail(410, "Someone already accepted this challenge. Each rival link works for one person only.");
    if (kind === "mate" && !["waiting", "setup"].includes(m.status)) fail(410, "This match has already started.");
    if (kind === "mate" && count[side] >= m.team_size) fail(410, "This team is already full.");
  }
  return json({ kind, side, host: captain, team: kind === "rival" ? teamName(m, "a") : teamName(m, side), size: m.team_size, minutes: m.duration_minutes, items: m.item_count, filled: count[side], id: mine ? m.id : null, my_side: mine?.side || null });
});
route("POST", "/t/:token/accept", "user", async ({ req, params, user, ip }) => {
  await rateLimit(`join:${ip}`, 30, 600);
  const { m, kind, side } = await teamLink(params.token);
  const wanted = kind === "rival" ? cleanTeamName((await body(req).catch(() => ({})))?.name) : null;
  if (wanted && wanted.toLowerCase() === (m.a_name || "").toLowerCase()) fail(400, "The other team already uses that name. Pick another.");
  const already = (await q(`SELECT side FROM team_members WHERE match_id=$1 AND user_id=$2`, [m.id, user.id]))[0];
  if (already) { if (already.side === side || kind === "rival") return json({ id: m.id }); fail(409, "You're already on the other team in this match. One account can only be on one team."); }
  if (kind === "rival") {
    try {
      const r = await q(`INSERT INTO team_members (match_id, user_id, side, is_captain) SELECT id, $2, 'b', true FROM team_matches WHERE id=$1 AND status='waiting' RETURNING match_id`, [m.id, user.id]);
      if (!r[0]) fail(410, "Someone already accepted this challenge.");
    } catch (e) { if (e.code === "23505") fail(410, "Someone already accepted this challenge."); throw e; }
    await q(`UPDATE team_matches SET status='setup', b_name=COALESCE($2, b_name) WHERE id=$1 AND status='waiting'`, [m.id, wanted]);
    await teamAlert([m.creator_id], `⚔️ ${user.nickname} accepted your ${m.team_size}v${m.team_size}! Fill your team and write your list.`, m);
    return json({ id: m.id });
  }
  if (!["waiting", "setup"].includes(m.status)) fail(410, "This match has already started.");
  if (side === "b" && !(await sideIds(m, "b")).length) fail(409, "The other team's captain hasn't joined yet.");
  const r = await q(
    `INSERT INTO team_members (match_id, user_id, side) SELECT $1, $2, $3
      WHERE (SELECT count(*) FROM team_members WHERE match_id=$1 AND side=$3) < $4 ON CONFLICT DO NOTHING RETURNING match_id`,
    [m.id, user.id, side, m.team_size]);
  if (!r[0]) fail(410, "This team is already full.");
  // Two people joining at the same instant could overfill by one: whoever got in last steps back out.
  const crowd = await q(`SELECT user_id FROM team_members WHERE match_id=$1 AND side=$2 ORDER BY joined_at, user_id`, [m.id, side]);
  if (crowd.length > m.team_size && crowd.slice(m.team_size).some((x) => x.user_id === user.id)) {
    await q(`DELETE FROM team_members WHERE match_id=$1 AND user_id=$2`, [m.id, user.id]);
    fail(410, "This team just filled up.");
  }
  await teamAlert((await sideIds(m, side)).filter((u) => u !== user.id), `🙌 ${user.nickname} joined your team for the ${m.team_size}v${m.team_size}.`, m);
  return json({ id: m.id });
});

route("GET", "/teams/:id", "user", async ({ user, params }) => {
  await runDuelLifecycle().catch((e) => console.error(e));
  const { m, side, captain } = await matchFor(user, params.id);
  const phase = matchPhase(m);
  const them = other(side);
  const started = ["live", "judging", "finished"].includes(phase);
  const members = await q(`SELECT tm.user_id, tm.side, tm.is_captain, u.nickname FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.match_id=$1 ORDER BY tm.is_captain DESC, tm.joined_at`, [m.id]);
  const nick = Object.fromEntries(members.map((x) => [x.user_id, x.nickname]));
  const items = await q(`SELECT id, setter_side, title, instructions FROM team_items WHERE match_id=$1 ORDER BY display_order, id`, [m.id]);
  const subs = await q(`SELECT id, item_id, user_id, side, status, submitted_at, reviewed_at, rejection_reason, ${PHOTO_COUNT("")} AS photos FROM team_submissions WHERE match_id=$1`, [m.id]);
  const sc = started ? await teamScores(m) : null;
  const latest = (itemId) => subs.filter((s) => s.item_id === itemId)
    .sort((a, b) => (b.status === "approved") - (a.status === "approved") || (b.status === "pending") - (a.status === "pending") || new Date(b.submitted_at) - new Date(a.submitted_at))[0];
  const withStatus = (it, n) => {
    const s = started ? latest(it.id) : null;
    return { id: it.id, number: n + 1, title: it.title, instructions: it.instructions, status: s?.status || "not_submitted", by: s ? nick[s.user_id] : null, rejection_reason: s?.status === "rejected" ? s.rejection_reason : null };
  };
  const team = (k) => ({
    name: teamName(m, k), custom: Boolean(k === "a" ? m.a_name : m.b_name), ready: k === "a" ? m.a_ready : m.b_ready, written: items.filter((i) => i.setter_side === k).length, score: sc?.[k].items ?? 0,
    members: members.filter((x) => x.side === k).map((x) => ({ nickname: x.nickname, captain: x.is_captain, me: x.user_id === user.id })),
  });
  const myTeamFull = members.filter((x) => x.side === side).length >= m.team_size;
  return json({
    now: Date.now(),
    match: {
      id: m.id, phase, size: m.team_size, minutes: m.duration_minutes, item_count: m.item_count, start_at: m.start_at, end_at: m.end_at,
      grace_minutes: REVIEW_GRACE_MINUTES, side, captain, purged: Boolean(m.purged_at), retain_days: RETAIN_DAYS,
      rival_token: captain && side === "a" && phase === "waiting" ? m.rival_token : null,
      mate_token: ["waiting", "setup"].includes(phase) && !myTeamFull ? (side === "a" ? m.a_token : m.b_token) : null,
      result: phase !== "finished" ? null : m.winner_side == null ? "tie" : m.winner_side === side ? "won" : "lost",
    },
    us: team(side), them: team(them),
    my_list: items.filter((i) => i.setter_side === side).map(withStatus),
    hunt: started ? items.filter((i) => i.setter_side === them).map(withStatus) : [],
    finds: started ? subs.filter((s) => s.status === "approved").sort((a, b) => new Date(b.reviewed_at || b.submitted_at) - new Date(a.reviewed_at || a.submitted_at))
      .map((s) => ({ id: s.id, photos: s.photos, ours: s.side === side, mine: s.user_id === user.id, nickname: nick[s.user_id] || "Deleted player", title: items.find((i) => i.id === s.item_id)?.title, found_at: s.reviewed_at || s.submitted_at })) : [],
    review: subs.filter((s) => s.side === them && s.status === "pending").sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))
      .map((s) => { const it = items.find((i) => i.id === s.item_id); return { id: s.id, photos: s.photos, nickname: nick[s.user_id] || "Deleted player", item_title: it?.title, instructions: it?.instructions, submitted_at: s.submitted_at }; }),
  });
});

/** A captain names (or renames) their team until the timer starts. */
route("PUT", "/teams/:id/name", "user", async ({ req, user, params }) => {
  const { m, side, captain } = await matchFor(user, params.id);
  if (!captain) fail(403, "Only your captain can name the team");
  if (!["waiting", "setup"].includes(m.status)) fail(409, "Team names are locked once the timer starts");
  const name = cleanTeamName((await body(req)).name);
  const theirs = side === "a" ? m.b_name : m.a_name;
  if (name && theirs && name.toLowerCase() === theirs.toLowerCase()) fail(400, "The other team already uses that name. Pick another.");
  await q(`UPDATE team_matches SET ${side === "a" ? "a_name" : "b_name"}=$2 WHERE id=$1`, [m.id, name]);
  const mates = (await sideIds(m, side)).filter((u) => u !== user.id);
  if (name) await teamAlert(mates, `🏷️ ${user.nickname} named your team “${name}”.`, m);
  return json({ ok: true, name: name || TEAM_NAME[side] });
});

async function teamSetup(user, idParam) {
  const x = await matchFor(user, idParam);
  if (!["waiting", "setup"].includes(x.m.status)) fail(409, "The lists are locked once the timer starts");
  if (x.side === "a" ? x.m.a_ready : x.m.b_ready) fail(409, "Your captain marked the list Done. Ask them to tap Edit list first.");
  return x;
}
const teamItem = (b) => ({ title: text(b.title, 160, "Item", true), instructions: text(b.instructions, 1000, "Instructions") });
route("POST", "/teams/:id/items", "user", async ({ req, user, params }) => {
  const { m, side } = await teamSetup(user, params.id);
  const it = teamItem(await body(req));
  const r = (await q(
    `INSERT INTO team_items (match_id, setter_side, title, instructions, display_order, created_by)
     SELECT $1, $2, $3, $4, count(*) + 1, $6 FROM team_items WHERE match_id=$1 AND setter_side=$2 HAVING count(*) < $5 RETURNING id`,
    [m.id, side, it.title, it.instructions, m.item_count, user.id]))[0];
  if (!r) fail(409, `Your team's list already has ${m.item_count} item${m.item_count === 1 ? "" : "s"}`);
  return json({ id: r.id });
});
route("PUT", "/teams/:id/items/:iid", "user", async ({ req, user, params }) => {
  const { m, side } = await teamSetup(user, params.id);
  const it = teamItem(await body(req));
  const r = await q(`UPDATE team_items SET title=$4, instructions=$5 WHERE id=$1 AND match_id=$2 AND setter_side=$3 RETURNING id`, [int(params.iid), m.id, side, it.title, it.instructions]);
  if (!r[0]) fail(404, "Item not found");
  return json({ ok: true });
});
route("DELETE", "/teams/:id/items/:iid", "user", async ({ user, params }) => {
  const { m, side } = await teamSetup(user, params.id);
  const r = await q(`DELETE FROM team_items WHERE id=$1 AND match_id=$2 AND setter_side=$3 RETURNING id`, [int(params.iid), m.id, side]);
  if (!r[0]) fail(404, "Item not found");
  return json({ ok: true });
});

route("POST", "/teams/:id/ready", "user", async ({ req, user, params }) => {
  const ready = Boolean((await body(req)).ready);
  const { m, side, captain } = await matchFor(user, params.id);
  if (!captain) fail(403, "Only your team's captain can mark the list Done");
  if (m.status !== "setup") fail(409, m.status === "waiting" ? "Wait for the rival captain to accept first" : "The timer has already started");
  if (ready) {
    const n = (await q(`SELECT count(*)::int AS n FROM team_items WHERE match_id=$1 AND setter_side=$2`, [m.id, side]))[0].n;
    if (n !== m.item_count) fail(400, `Add all ${m.item_count} items first (you have ${n})`);
    const size = (await sideIds(m, side)).length;
    if (size < m.team_size) fail(400, `Your team needs ${m.team_size - size} more player${m.team_size - size === 1 ? "" : "s"}. Share your team link.`);
  }
  await q(`UPDATE team_matches SET ${side}_ready=$2 WHERE id=$1 AND status='setup'`, [m.id, ready]);
  const started = (await q(
    `UPDATE team_matches SET status='live', start_at=now(), end_at=now() + make_interval(mins => duration_minutes)
      WHERE id=$1 AND status='setup' AND a_ready AND b_ready RETURNING id`, [m.id]))[0];
  const all = [...(await sideIds(m, "a")), ...(await sideIds(m, "b"))];
  if (started) await teamAlert(all, `⏱️ Both teams are ready. Your ${m.team_size}v${m.team_size} timer has started. Go hunt!`, m);
  else if (ready) await teamAlert(await sideIds(m, other(side)), `✅ The other team is ready. Finish your list to start the timer.`, m);
  return json({ ok: true, started: Boolean(started) });
});

route("POST", "/teams/:id/leave", "user", async ({ user, params }) => {
  const { m, side, captain } = await matchFor(user, params.id);
  if (captain) fail(400, "Captains can't leave. Call the match off instead.");
  if (!["waiting", "setup"].includes(m.status)) fail(409, "You can't leave once the timer has started");
  await q(`DELETE FROM team_members WHERE match_id=$1 AND user_id=$2`, [m.id, user.id]);
  await q(`UPDATE team_matches SET ${side}_ready=false WHERE id=$1`, [m.id]);
  return json({ ok: true });
});
route("POST", "/teams/:id/cancel", "user", async ({ user, params }) => {
  const { m, captain } = await matchFor(user, params.id);
  if (!captain) fail(403, "Only a captain can call the match off");
  const r = await q(`UPDATE team_matches SET status='cancelled' WHERE id=$1 AND status IN ('waiting','setup') RETURNING id`, [m.id]);
  if (!r[0]) fail(409, "A match can't be called off once the timer has started");
  const all = (await q(`SELECT user_id FROM team_members WHERE match_id=$1 AND user_id<>$2`, [m.id, user.id])).map((x) => x.user_id);
  await teamAlert(all, `${user.nickname} called off your ${m.team_size}v${m.team_size}.`, m);
  return json({ ok: true });
});

route("POST", "/teams/:id/items/:iid/submit", "user", async ({ req, user, params }) => {
  await rateLimit(`submit:${user.id}`, 30, 600);
  const { m, side } = await matchFor(user, params.id);
  if (matchPhase(m) !== "live") fail(409, "The timer isn't running, so photos can't be sent");
  const item = (await q(`SELECT id, title FROM team_items WHERE id=$1 AND match_id=$2 AND setter_side=$3`, [int(params.iid), m.id, other(side)]))[0];
  if (!item) fail(404, "Item not found");
  const existing = (await q(`SELECT status FROM team_submissions WHERE item_id=$1 AND status IN ('pending','approved')`, [item.id]))[0];
  if (existing) fail(409, existing.status === "approved" ? "Your team already found this one" : "A teammate's photos for this item are waiting to be judged");
  const imgs = await readPhotos(await readForm(req));
  const { keys, thumbs } = await savePhotos(`team/${m.id}/${user.id}`, imgs);
  try {
    await q(`INSERT INTO team_submissions (match_id, item_id, user_id, side, photo_1_key, photo_2_key, extra_photo_keys, thumb_keys) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [m.id, item.id, user.id, side, keys[0], keys[1] || null, keys.slice(2), thumbs]);
  } catch (e) {
    await Promise.allSettled([...keys, ...thumbs].filter(Boolean).map((k) => deleteObject(k)));
    if (e.code === "23505") fail(409, "A teammate just sent photos for this item");
    throw e;
  }
  await teamAlert(await sideIds(m, other(side)), `📸 ${user.nickname} sent proof for '${item.title}'. Judge it now.`, m);
  await teamAlert((await sideIds(m, side)).filter((u) => u !== user.id), `📸 ${user.nickname} sent proof for '${item.title}' for your team.`, m);
  return json({ ok: true });
});

/** Team match photos: only members of that match. */
route("GET", "/team-photo/:id/:n", "user", async ({ params, user, url }) => {
  const s = (await q(
    `SELECT s.photo_1_key, s.photo_2_key, s.extra_photo_keys, s.thumb_keys FROM team_submissions s
      JOIN team_members tm ON tm.match_id=s.match_id AND tm.user_id=$2 WHERE s.id=$1`, [int(params.id), user.id]))[0];
  if (!s) fail(404, "Not found");
  return serveImage(photoAt(s, params.n, wantsThumb(url)));
});

/** Any member of the team that wrote the item can judge it. */
async function judgeTeam(user, params, sql, extra = []) {
  const { m, side } = await matchFor(user, params.id);
  if (m.status !== "live") fail(409, "This match is already over");
  const r = (await q(sql, [int(params.sid), m.id, side, user.id, ...extra]))[0];
  if (!r) fail(409, "These photos were already judged");
  return { m, side, r };
}
route("POST", "/teams/:id/submissions/:sid/approve", "user", async ({ user, params }) => {
  const { m, side, r } = await judgeTeam(user, params,
    `UPDATE team_submissions s SET status='approved', reviewed_at=now(), reviewed_by=$4 FROM team_items i
      WHERE s.id=$1 AND s.match_id=$2 AND s.status='pending' AND i.id=s.item_id AND i.setter_side=$3 RETURNING s.user_id, i.title`);
  await teamAlert(await sideIds(m, other(side)), `✅ Your team's photos for '${r.title}' were approved.`, m);
  await runDuelLifecycle().catch((e) => console.error(e));
  return json({ ok: true });
});
route("POST", "/teams/:id/submissions/:sid/reject", "user", async ({ req, user, params }) => {
  const reason = text((await body(req)).reason, 300, "Rejection reason", true);
  if (reason.length < 3) fail(400, "Tell the other team why");
  const { m, side, r } = await judgeTeam(user, params,
    `UPDATE team_submissions s SET status='rejected', reviewed_at=now(), reviewed_by=$4, rejection_reason=$5 FROM team_items i
      WHERE s.id=$1 AND s.match_id=$2 AND s.status='pending' AND i.id=s.item_id AND i.setter_side=$3 RETURNING s.user_id, i.title`, [reason]);
  await teamAlert(await sideIds(m, other(side)), `❌ Photos for '${r.title}' were rejected. Tap to see why.`, m);
  return json({ ok: true });
});


/* ================= daily hunt =================
 One item a day for everyone (Lagos calendar). Only today's item is ever sent; a live camera photo counts at once.
 Photos are private to the player and deleted after RETAIN_DAYS; the row stays as the streak. */
/** Daily finds are judged by whoever runs PRIMAHUNT OFFICIAL (its founder and co-admin). */
async function dailyReviewerIds() {
  return (await q(`SELECT gm.user_id FROM group_members gm JOIN groups g ON g.id=gm.group_id
                   WHERE g.is_official AND g.status='active' AND gm.status='active' AND gm.role IN ('owner','admin')`)).map((r) => r.user_id);
}
async function isDailyReviewer(uid) {
  return Boolean((await q(`SELECT 1 FROM group_members gm JOIN groups g ON g.id=gm.group_id
                           WHERE gm.user_id=$1 AND g.is_official AND g.status='active' AND gm.status='active' AND gm.role IN ('owner','admin') LIMIT 1`, [uid]))[0]);
}
async function dailyReviewer(user) {
  if (!(await isDailyReviewer(user.id))) fail(403, "Only the PrimaHunt admin reviews daily finds");
}
route("GET", "/daily/review", "user", async ({ user }) => {
  await dailyReviewer(user);
  const rows = await q(
    `SELECT f.id, to_char(f.day, 'YYYY-MM-DD') AS day, f.item_index, f.created_at, u.nickname, ${PHOTO_COUNT("f.")} AS photos
       FROM daily_finds f JOIN users u ON u.id=f.user_id
      WHERE f.status='pending' AND u.status <> 'deleted' ORDER BY f.created_at LIMIT 100`);
  const done = (await q(`SELECT count(*)::int AS n FROM daily_finds WHERE reviewed_by=$1 AND reviewed_at > now() - interval '24 hours'`, [user.id]))[0].n;
  return json({ pending: rows.map((r) => ({ ...r, item: DAILY_ITEMS[r.item_index % DAILY_ITEMS.length] })), reviewed_today: done });
});
/** Approve or reject a daily find. Photos are deleted as soon as it's judged; the row stays as the streak record. */
/** Install bonus: +30 pips once, when PrimaHunt is first opened from the home screen. Global board only. */
const INSTALL_BONUS = 30;
async function installBonus(uid) {
  const got = await q(
    `INSERT INTO pip_bonuses (user_id, kind, pips) SELECT id, 'install', $2 FROM users WHERE id=$1 AND installed_at IS NOT NULL AND status='active'
     ON CONFLICT DO NOTHING RETURNING pips`, [uid, INSTALL_BONUS]).catch((e) => { console.error("install bonus", e); return []; });
  if (!got[0]) return;
  const msg = `🎁 +${INSTALL_BONUS} bonus pips for adding PrimaHunt to your home screen! They're on your global rank now.`;
  await q(`INSERT INTO notifications (user_id, group_id, type, title, message, link) VALUES ($1,NULL,'bonus','Bonus pips',$2,'/')`, [uid, msg]).catch(() => {});
  await pushGame([uid], { title: "Bonus pips 🎁", body: msg, url: "/" });
}

async function judgeDaily(user, id, approve, reason) {
  await dailyReviewer(user);
  const f = (await q(
    `UPDATE daily_finds SET status=$2, reviewed_by=$3, reviewed_at=now(), reject_reason=$4 WHERE id=$1 AND status='pending'
     RETURNING id, user_id, item_index, photo_1_key, photo_2_key, extra_photo_keys, thumb_keys, to_char(day, 'YYYY-MM-DD') AS day`,
    [id, approve ? "approved" : "rejected", user.id, approve ? null : reason]))[0];
  if (!f) fail(409, "Someone already reviewed this find");
  await deleteObjects(photoKeys([f]));
  await q(`UPDATE daily_finds SET photos_purged_at=now(), photo_1_key='', photo_2_key=NULL, extra_photo_keys='{}', thumb_keys='{}' WHERE id=$1`, [f.id]);
  const item = DAILY_ITEMS[f.item_index % DAILY_ITEMS.length];
  const late = f.day !== lagosDay();
  const msg = approve ? `✅ Your daily find (${item}) was approved. Streak counted 🔥`
    : `❌ Your daily find (${item}) wasn't accepted: ${reason}${/[.!?]$/.test(reason) ? "" : "."}${late ? "" : " You can try again before midnight."}`;
  await q(`INSERT INTO notifications (user_id, group_id, type, title, message, link) VALUES ($1,NULL,'review','Daily hunt',$2,'/daily')`, [f.user_id, msg]);
  await pushGame([f.user_id], { title: "Daily hunt", body: msg, url: "/daily" });
}
route("POST", "/daily/review/:id/approve", "user", async ({ user, params }) => {
  await judgeDaily(user, int(params.id), true);
  return json({ ok: true });
});
route("POST", "/daily/review/:id/reject", "user", async ({ req, user, params }) => {
  const reason = text((await body(req)).reason, 200, "Reason", true);
  if (reason.length < 3) fail(400, "Give the player a reason");
  await judgeDaily(user, int(params.id), false, reason);
  return json({ ok: true });
});

/* ================= Star hunt ================= */
const starTotals = async (uid) => (await q(`SELECT count(*)::int AS caught, COALESCE(sum(pips),0)::int AS pips FROM star_catches WHERE user_id=$1`, [uid]))[0];
const STAR_LIVE = `s.status='active' AND s.starts_at <= now() AND (s.ends_at IS NULL OR s.ends_at > now())`;
const metres = (a, b) => {
  const R = 6371000, r = (d) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const coord = (v, lim, name) => { const n = Number(v); if (!Number.isFinite(n) || Math.abs(n) > lim) fail(400, `Bad ${name}`); return n; };

/** Live stars on the Lagos map, with whether you've caught each one. Your location is never sent here. */
route("GET", "/stars", "user", async ({ user }) => {
  const stars = await q(
    `SELECT s.id, s.name, s.area, s.lat, s.lon, s.pips, s.radius_m, s.ends_at,
            EXISTS (SELECT 1 FROM star_catches c WHERE c.star_id=s.id AND c.user_id=$1) AS caught,
            (SELECT count(*)::int FROM star_catches c WHERE c.star_id=s.id) AS catches
       FROM stars s WHERE ${STAR_LIVE} ORDER BY s.id`, [user.id]);
  return json({ stars, me: await starTotals(user.id), admin: await isDailyReviewer(user.id) });
});

/**
 * Catch a star. The phone sends where it is right now; the server checks the distance and keeps only the distance,
 * never the location. Too far, too fast between two catches, or already caught: refused.
 */
route("POST", "/stars/:id/catch", "user", async ({ req, user, params }) => {
  await rateLimit(`star:${user.id}`, 40, 3600);
  const b = await body(req);
  const here = { lat: coord(b.lat, 90, "location"), lon: coord(b.lon, 180, "location") };
  const acc = Math.max(0, Math.min(Number(b.acc) || 0, 200));
  const st = (await q(`SELECT * FROM stars s WHERE s.id=$1 AND ${STAR_LIVE}`, [int(params.id)]))[0];
  if (!st) fail(404, "This star has gone");
  const d = metres(here, st);
  const allowed = st.radius_m + Math.min(acc, 30); // a little slack for GPS, never more than 30 m
  if (acc > 120) fail(400, "Your GPS is too rough right now. Step outside and try again.");
  if (d > allowed) fail(400, `You're about ${Math.round(d)} m away. Get within ${st.radius_m} m to catch it.`);
  // Speed check against your previous catch (nobody runs across Lagos at 150 km/h).
  const prev = (await q(`SELECT s.lat, s.lon, c.caught_at FROM star_catches c JOIN stars s ON s.id=c.star_id WHERE c.user_id=$1 ORDER BY c.caught_at DESC LIMIT 1`, [user.id]))[0];
  if (prev) {
    const hours = Math.max((Date.now() - new Date(prev.caught_at)) / 36e5, 1 / 3600);
    if (metres(prev, st) / 1000 / hours > 150) fail(429, "That's faster than any danfo. Try again in a few minutes.");
  }
  const got = await q(`INSERT INTO star_catches (user_id, star_id, pips, distance_m) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING pips`, [user.id, st.id, st.pips, Math.round(d)]);
  if (!got.length) fail(409, "You already caught this star");
  return json({ ok: true, pips: st.pips, name: st.name, me: await starTotals(user.id) });
});

/** PrimaHunt admin: drop a star (everyone with star alerts on gets a push) or remove one. */
route("POST", "/stars", "user", async ({ req, user }) => {
  await dailyReviewer(user);
  const b = await body(req);
  const name = text(b.name, 60, "Name", true), area = text(b.area, 40, "Area") || "";
  if (name.length < 2) fail(400, "Give the star a place name");
  const lat = coord(b.lat, 90, "latitude"), lon = coord(b.lon, 180, "longitude");
  const pips = [20, 30, 50].includes(Number(b.pips)) ? Number(b.pips) : 20;
  const days = Math.max(0, Math.min(Number(b.days) || 0, 60));
  const st = (await q(
    `INSERT INTO stars (name, area, lat, lon, pips, ends_at, created_by) VALUES ($1,$2,$3,$4,$5, CASE WHEN $6::int > 0 THEN now() + make_interval(days => $6::int) END, $7) RETURNING id`,
    [name, area, lat, lon, pips, days, user.id]))[0];
  const phones = await pushTo(null, { title: "⭐ A new star just dropped", body: `${name}${area ? ", " + area : ""} · ${pips} pips. Go catch it!`, url: `/stars?star=${st.id}`, tag: "star-" + st.id });
  await q(`UPDATE stars SET pushed_at=now() WHERE id=$1`, [st.id]);
  return json({ ok: true, id: st.id, pushed: phones });
});
route("DELETE", "/stars/:id", "user", async ({ user, params }) => {
  await dailyReviewer(user);
  const r = await q(`UPDATE stars SET status='removed' WHERE id=$1 AND status='active' RETURNING id`, [int(params.id)]);
  if (!r.length) fail(404, "Star not found");
  return json({ ok: true });
});

/* ================= Push alerts ================= */
// Only real browser push services, so nobody can make the server send requests anywhere else.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.services\.mozilla\.com$/];
route("GET", "/push/key", "public", async () => json({ key: vapidKeys().publicKey }));
route("POST", "/push/subscribe", "user", async ({ req, user }) => {
  await rateLimit(`pushsub:${user.id}`, 20, 3600);
  const b = await body(req);
  let u;
  try { u = new URL(String(b.endpoint || "")); } catch { fail(400, "Bad push address"); }
  if (u.protocol !== "https:" || !PUSH_HOSTS.some((re) => re.test(u.hostname))) fail(400, "This browser's push service isn't supported");
  const p256dh = String(b.keys?.p256dh || ""), auth = String(b.keys?.auth || "");
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) fail(400, "Bad push keys");
  await q(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
           ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`, [user.id, u.href, p256dh, auth]);
  const n = (await q(`SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id=$1`, [user.id]))[0].n;
  if (n > 10) await q(`DELETE FROM push_subscriptions WHERE id IN (SELECT id FROM push_subscriptions WHERE user_id=$1 ORDER BY id LIMIT $2)`, [user.id, n - 10]);
  return json({ ok: true }); // set up quietly, no confirmation push
});
// PrimaHunt was opened from the home screen: record it and pay the +30 install bonus (once per account).
route("POST", "/me/installed", "user", async ({ user }) => {
  await rateLimit(`installed:${user.id}`, 10, 3600);
  await q(`UPDATE users SET installed_at=now() WHERE id=$1 AND installed_at IS NULL`, [user.id]);
  await installBonus(user.id);
  return json({ ok: true });
});
// What this person wants pushed to their phones: star drops and/or game updates.
route("PUT", "/me/push-prefs", "user", async ({ req, user }) => {
  const b = await body(req);
  const stars = typeof b.stars === "boolean" ? b.stars : user.push_stars !== false;
  const games = typeof b.games === "boolean" ? b.games : user.push_games !== false;
  await q(`UPDATE users SET push_stars=$2, push_games=$3 WHERE id=$1`, [user.id, stars, games]);
  return json({ ok: true, push_prefs: { stars, games } });
});
route("POST", "/push/unsubscribe", "user", async ({ req, user }) => {
  const b = await body(req);
  if (b.endpoint) await q(`DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2`, [user.id, String(b.endpoint)]);
  else await q(`DELETE FROM push_subscriptions WHERE user_id=$1`, [user.id]);
  return json({ ok: true });
});

async function streakOf(uid) {
  const days = (await q(`SELECT to_char(day, 'YYYY-MM-DD') AS d FROM daily_finds WHERE user_id=$1 AND status='approved' ORDER BY day DESC LIMIT 1000`, [uid])).map((r) => r.d);
  const set = new Set(days);
  const prev = (d) => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
  const today = lagosDay();
  let cur = 0;
  for (let d = set.has(today) ? today : prev(today); set.has(d); d = prev(d)) cur++;
  let best = 0, run = 0, last = null;
  for (const d of [...days].reverse()) { run = last && prev(d) === last ? run + 1 : 1; best = Math.max(best, run); last = d; }
  const pendingToday = !set.has(today) && Boolean((await q(`SELECT 1 FROM daily_finds WHERE user_id=$1 AND day=$2 AND status='pending'`, [uid, today]))[0]);
  return { current: cur, best, total: days.length, done_today: set.has(today), pending_today: pendingToday };
}
route("GET", "/daily", "user", async ({ user }) => {
  const today = lagosDay();
  const idx = dailyIndex(today);
  // Today's latest attempt (a rejected one can be retried until midnight).
  const mine = (await q(`SELECT id, status, reject_reason, ${PHOTO_COUNT("")} AS photos FROM daily_finds WHERE user_id=$1 AND day=$2 ORDER BY (status <> 'rejected') DESC, id DESC LIMIT 1`, [user.id, today]))[0];
  const recent = await q(`SELECT DISTINCT ON (day) to_char(day, 'YYYY-MM-DD') AS day, item_index, id, status FROM daily_finds WHERE user_id=$1 AND day > $2::date - 7 ORDER BY day DESC, (status <> 'rejected') DESC, id DESC`, [user.id, today]);
  const tomorrow = Date.parse(today + "T00:00:00+01:00") + 864e5;
  return json({
    day: today, number: idx + 1, item: DAILY_ITEMS[idx % DAILY_ITEMS.length], done: mine?.status === "approved", status: mine?.status || null, find: mine || null,
    next_at: tomorrow, streak: await streakOf(user.id),
    recent: recent.map((r) => ({ day: r.day, item: DAILY_ITEMS[r.item_index % DAILY_ITEMS.length], id: r.id, status: r.status })),
    now: Date.now(),
  });
});
route("POST", "/daily/submit", "user", async ({ req, user }) => {
  await rateLimit(`daily:${user.id}`, 10, 3600);
  const today = lagosDay();
  const already = (await q(`SELECT status FROM daily_finds WHERE user_id=$1 AND day=$2 AND status <> 'rejected'`, [user.id, today]))[0];
  if (already) fail(409, already.status === "pending" ? "Today's find is waiting for review." : "You've already found today's item. Come back tomorrow!");
  const imgs = await readPhotos(await readForm(req));
  const { keys, thumbs } = await savePhotos(`daily/${user.id}`, imgs);
  const r = await q(
    `INSERT INTO daily_finds (user_id, day, item_index, photo_1_key, photo_2_key, extra_photo_keys, thumb_keys) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id, day) WHERE status <> 'rejected' DO NOTHING RETURNING id`, [user.id, today, dailyIndex(today), keys[0], keys[1] || null, keys.slice(2), thumbs]);
  if (!r[0]) { await deleteObjects([...keys, ...thumbs]); fail(409, "You've already sent today's find."); }
  // Tell the PrimaHunt reviewers (in-app only).
  const reviewers = await dailyReviewerIds();
  if (reviewers.length) await q(
    `INSERT INTO notifications (user_id, group_id, type, title, message, link) SELECT u, NULL, 'submission', 'Daily hunt', $2, '/daily/review' FROM unnest($1::int[]) AS u`,
    [reviewers, `📸 ${user.nickname} sent a daily find: ${DAILY_ITEMS[dailyIndex(today) % DAILY_ITEMS.length]}. Review it.`]);
  await pushGame(reviewers, { title: "Daily hunt", body: `📸 New daily find from ${user.nickname} waiting for review.`, url: "/daily/review", tag: "daily-review" });
  return json({ ok: true, pending: true, streak: await streakOf(user.id) });
});
/** Daily hunt photos: the player who took them, and the PrimaHunt reviewers while the find is pending. */
route("GET", "/daily-photo/:id/:n", "user", async ({ params, user, url }) => {
  const reviewer = await isDailyReviewer(user.id);
  const s = (await q(`SELECT photo_1_key, photo_2_key, extra_photo_keys, thumb_keys FROM daily_finds WHERE id=$1 AND photos_purged_at IS NULL AND (user_id=$2 OR ($3 AND status='pending'))`, [int(params.id), user.id, reviewer]))[0];
  if (!s) fail(404, "Not found");
  return serveImage(photoAt(s, params.n, wantsThumb(url)));
});

/* ================= active hunts counter =================
 One number for the "N active hunts" bar: weekly challenges running now in any active group, plus live 1v1s. No names or ids. */
route("GET", "/stats", "public", async () => {
  const r = (await q(
    `SELECT (SELECT count(*) FROM challenges c JOIN groups g ON g.id=c.group_id AND g.status='active' AND g.admin_left_at IS NULL
              WHERE c.status='published' AND c.start_at <= now() AND c.end_at > now())::int
          + (SELECT count(*) FROM duels WHERE status='live' AND end_at > now())::int
          + (SELECT count(*) FROM team_matches WHERE status='live' AND end_at > now())::int AS n`
  ))[0];
  const h = await currentHunter().catch(() => null);
  return json({ active_hunts: r.n, hunter: h ? { nickname: h.nickname, week_number: h.week_number } : null }, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
});

/* ================= group feed =================
 Approved submissions (in_feed) shared with that group's active members, newest approval first, with comments.
 Only members of the group can read, comment or see the photos. The poster or the group admin can take a post down. */
const FEED_PAGE = 12;
route("GET", "/groups/:gid/feed", "member", async ({ url, group, user }) => {
  const offset = Math.min(int(url.searchParams.get("offset") || 0, "offset"), 5000);
  const rows = await q(
    `SELECT s.id, s.user_id, s.reviewed_at, ${PHOTO_COUNT("s.")} AS photos, u.nickname, i.title, i.points, c.title AS challenge_title, c.week_number
       FROM submissions s JOIN users u ON u.id=s.user_id JOIN challenge_items i ON i.id=s.item_id JOIN challenges c ON c.id=i.challenge_id
      WHERE s.group_id=$1 AND c.group_id=$1 AND s.status='approved' AND s.in_feed
      ORDER BY s.reviewed_at DESC, s.id DESC LIMIT $2 OFFSET $3`,
    [group.id, FEED_PAGE + 1, offset]
  );
  const posts = rows.slice(0, FEED_PAGE);
  const ids = posts.map((p) => p.id);
  const comments = ids.length ? await q(
    `SELECT fc.id, fc.submission_id, fc.user_id, fc.body, fc.created_at, u.nickname
       FROM feed_comments fc JOIN users u ON u.id=fc.user_id
      WHERE fc.group_id=$1 AND fc.submission_id = ANY($2::int[]) ORDER BY fc.created_at, fc.id`,
    [group.id, ids]
  ) : [];
  const owner = group.role === "owner";
  return json({
    posts: posts.map((p) => ({
      id: p.id, photos: p.photos, nickname: p.nickname, title: p.title, points: p.points, challenge_title: p.challenge_title, week_number: p.week_number,
      approved_at: p.reviewed_at, mine: p.user_id === user.id, can_remove: owner || p.user_id === user.id,
      comments: comments.filter((c) => c.submission_id === p.id).map((c) => ({ id: c.id, nickname: c.nickname, body: c.body, created_at: c.created_at, mine: c.user_id === user.id, can_delete: owner || c.user_id === user.id })),
    })),
    more: rows.length > FEED_PAGE, next_offset: offset + posts.length, now: Date.now(),
  });
});
async function feedPost(group, sid) {
  const s = (await q(
    `SELECT s.id, s.user_id, i.title FROM submissions s JOIN challenge_items i ON i.id=s.item_id
      WHERE s.id=$1 AND s.group_id=$2 AND s.status='approved' AND s.in_feed`,
    [int(sid), group.id]
  ))[0];
  if (!s) fail(404, "That post isn't in this hunt's feed");
  return s;
}
route("POST", "/groups/:gid/feed/:sid/comments", "member", async ({ req, params, group, user }) => {
  await rateLimit(`comment:${user.id}`, 30, 600);
  const s = await feedPost(group, params.sid);
  const msg = text((await body(req)).body, 500, "Comment", true);
  const c = (await q(`INSERT INTO feed_comments (group_id, submission_id, user_id, body) VALUES ($1,$2,$3,$4) RETURNING id, created_at`, [group.id, s.id, user.id, msg]))[0];
  if (s.user_id !== user.id) {
    // In-app only: comments can be chatty, so they don't send email.
    const note = `💬 ${user.nickname} on your '${s.title}' find: "${msg.length > 80 ? msg.slice(0, 77) + "…" : msg}"`;
    await q(`INSERT INTO notifications (user_id, group_id, type, title, message, link) VALUES ($1,$2,'comment',$3,$4,$5)`,
      [s.user_id, group.id, group.name, note, `/g/${group.id}/feed`]).catch((e) => console.error(e));
    await pushGame([s.user_id], { title: group.name, body: note, url: `/g/${group.id}/feed`, tag: `comment-${s.id}` }); // one per post on the phone
  }
  return json({ comment: { id: c.id, nickname: user.nickname, body: msg, created_at: c.created_at, mine: true, can_delete: true } });
});
route("DELETE", "/groups/:gid/comments/:cid", "member", async ({ params, group, user }) => {
  const c = (await q(`SELECT id, user_id FROM feed_comments WHERE id=$1 AND group_id=$2`, [int(params.cid), group.id]))[0];
  if (!c) fail(404, "Comment not found");
  if (c.user_id !== user.id && group.role !== "owner") fail(403, "You can only delete your own comments");
  await q(`DELETE FROM feed_comments WHERE id=$1`, [c.id]);
  if (c.user_id !== user.id) await audit(user.id, group.id, "delete_comment", "comment", c.id);
  return json({ ok: true });
});
route("POST", "/groups/:gid/feed/:sid/remove", "member", async ({ params, group, user }) => {
  const s = await feedPost(group, params.sid);
  if (s.user_id !== user.id && group.role !== "owner") fail(403, "Only the player who posted it or the hunt admin can remove it");
  await q(`UPDATE submissions SET in_feed=false WHERE id=$1`, [s.id]);
  if (s.user_id !== user.id) await audit(user.id, group.id, "remove_from_feed", "submission", s.id);
  return json({ ok: true });
});
