import { putObject, getObject, deleteObject } from "./storage.js";
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
import { notify, runLifecycle, runDuelLifecycle, withDefaults, DEFAULT_SETTINGS, DUEL_GROUP, sendEmails, emailHtml, emailConfigured } from "./notify.js";
import { DUEL_DURATIONS, DUEL_MAX_ITEMS, REVIEW_GRACE_MINUTES, duelPhase, duelScores, isPlayer, opponentOf } from "./duel.js";


const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // Vercel request bodies are capped near 4.5 MB

/* ---------------- router ----------------
 auth: public | user | member (any active member of :gid) | owner (the group's admin) */
const routes = [];
const route = (method, path, auth, fn) =>
  routes.push({ method, auth, fn, re: new RegExp("^" + path.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$") });

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
      if (r.auth === "member" || r.auth === "owner") ctx.group = await membership(ctx.user, int(params.gid, "group"), r.auth === "owner");
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
  const r = await q(`SELECT id, nickname, email, can_create_groups, status FROM users WHERE id=$1`, [s.uid]);
  return r[0] && r[0].status === "active" ? r[0] : null;
}

/** THE group access check. Every /groups/:gid/... route goes through this. */
async function membership(user, gid, ownerOnly) {
  const g = (
    await q(
      `SELECT g.id, g.name, g.description, g.owner_user_id, g.settings, g.invite_token, g.invite_active, g.invite_expires_at,
              g.status AS gstatus, g.is_public, (g.image_key IS NOT NULL) AS has_image, gm.role, gm.status
         FROM groups g JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = $2
        WHERE g.id = $1`,
      [gid, user.id]
    )
  )[0];
  if (!g || g.status !== "active" || g.gstatus !== "active") fail(403, "You don't have access to this group");
  if (ownerOnly && !(g.role === "owner" && g.owner_user_id === user.id)) fail(403, "Only this group's admin can do that");
  return g;
}

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
const gref = (g) => ({ id: g.id, name: g.name, settings: g.settings });
const publicChallenge = (c) =>
  c && { id: c.id, title: c.title, description: c.description, rules: c.rules, start_at: c.start_at, end_at: c.end_at, prize_amount: c.prize_amount, week_number: c.week_number, tie_rule: TIE_RULE };

async function readImage(form, field) {
  const f = form.get(field);
  if (!f || typeof f === "string") fail(400, "Choose an image");
  if (f.size > MAX_PHOTO_BYTES) fail(413, "Images must be under 2 MB");
  const buf = await f.arrayBuffer();
  const kind = sniffImage(buf);
  if (!kind) fail(400, "Images must be JPEG, PNG or WebP");
  return { buf, kind };
}
/** Submissions: at least one photo ("photo1"), up to MAX_PHOTOS ("photo1".."photo4"). */
const MAX_PHOTOS = 4;
const PHOTO_COUNT = (a) => `(1 + (${a}photo_2_key IS NOT NULL)::int + cardinality(${a}extra_photo_keys))`;
async function readPhotos(form) {
  const imgs = [];
  for (let k = 1; k <= MAX_PHOTOS; k++) {
    const f = form.get("photo" + k);
    if (f && typeof f !== "string" && f.size > 0) imgs.push(await readImage(form, "photo" + k));
  }
  if (!imgs.length) fail(400, "Add at least one photo");
  if (form.get("photo" + (MAX_PHOTOS + 1))) fail(400, `You can send up to ${MAX_PHOTOS} photos`);
  return imgs;
}
const photoAt = (s, n) => {
  const keys = [s.photo_1_key, s.photo_2_key, ...(s.extra_photo_keys || [])].filter(Boolean);
  const i = Number(n) - 1;
  if (!Number.isInteger(i) || i < 0 || i >= keys.length) fail(404, "Not found");
  return keys[i];
};
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
    headers: { "Content-Type": res.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
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
  return json({ ok: true });
};
route("GET", "/cron/lifecycle", "public", cronRun);
route("POST", "/cron/lifecycle", "public", cronRun);

/* ================= account ================= */
route("POST", "/auth/register", "public", async ({ req, ip }) => {
  await rateLimit(`reg:${ip}`, 10, 3600);
  const b = await body(req);
  const nickname = text(b.nickname, 20, "Nickname", true);
  if (!/^[A-Za-z0-9_.\- ]{2,20}$/.test(nickname)) fail(400, "Nickname must be 2-20 letters, numbers, spaces, _ . or -");
  const email = text(b.email, 200, "Email", true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter a valid email address");
  const password = String(b.password || "");
  if (password.length < 8) fail(400, "Password must be at least 8 characters");
  if (password.length > 200) fail(400, "Password is too long");
  if (password !== b.confirm) fail(400, "Passwords do not match");
  let row;
  try {
    row = (await q(`INSERT INTO users (nickname, email, password_hash) VALUES ($1,$2,$3) RETURNING id`, [nickname, email, await hashPassword(password)]))[0];
  } catch (e) {
    if (e.code === "23505") fail(409, String(e.constraint || e.message).includes("nickname") ? "That nickname is taken" : "That email is already registered. Log in instead.");
    throw e;
  }
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
  const u = (await q(`SELECT id FROM users WHERE lower(email)=$1 AND status='active'`, [email]))[0];
  if (u) {
    const token = newToken(24);
    await q(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval '1 hour')`, [u.id, sha256(token)]);
    await sendEmails([{ to: email, subject: "Reset your Weekly Hunt password", html: emailHtml("Use this link to choose a new password. It works for one hour.", `/reset/${token}`, "Choose a new password") }]);
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
  return json({ user: { id: user.id, nickname: user.nickname, can_create_groups: user.can_create_groups }, unread: total, unread_by_group: by, now: Date.now() });
});
route("PUT", "/me", "user", async ({ req, user }) => {
  const nickname = text((await body(req)).nickname, 20, "Nickname", true);
  if (!/^[A-Za-z0-9_.\- ]{2,20}$/.test(nickname)) fail(400, "Nickname must be 2-20 letters, numbers, spaces, _ . or -");
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
route("POST", "/me/become-admin", "user", async ({ user }) => {
  await q(`UPDATE users SET can_create_groups=true WHERE id=$1`, [user.id]);
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
    id: g.id, name: g.name, description: g.description, role: g.role, has_image: g.has_image, members: players,
    challenge: ch && { id: ch.id, title: ch.title, week_number: ch.week_number, phase: phaseOf(ch), start_at: ch.start_at, end_at: ch.end_at },
  };
  if (g.role === "player" && (active || closed)) {
    const st = await standings(g.id, active || closed, userId);
    out.my_points = st.me?.points ?? 0;
    out.my_rank = st.me?.rank ?? null;
  }
  if (g.role === "owner") {
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
    `SELECT g.id, g.name, g.description, g.owner_user_id, g.settings, g.invite_active, (g.image_key IS NOT NULL) AS has_image, gm.role
       FROM groups g JOIN group_members gm ON gm.group_id=g.id
      WHERE gm.user_id=$1 AND gm.status='active' AND g.status='active' ORDER BY g.created_at`,
    [user.id]
  );
  return json({ groups: await Promise.all(rows.map((g) => summary(g, user.id))), now: Date.now() });
});

route("POST", "/groups", "user", async ({ req, user }) => {
  if (!user.can_create_groups) fail(403, "Create an admin account first");
  await rateLimit(`mkgroup:${user.id}`, 10, 3600);
  const b = await body(req);
  const name = text(b.name, 60, "Group name", true);
  const description = text(b.description, 300, "Description");
  const g = (await q(`INSERT INTO groups (name, description, owner_user_id, invite_token) VALUES ($1,$2,$3,$4) RETURNING id`, [name, description, user.id, newToken(12)]))[0];
  await q(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,'owner')`, [g.id, user.id]);
  await audit(user.id, g.id, "create_group", "group", g.id, { name });
  return json({ id: g.id });
});

route("GET", "/groups/:gid", "member", async ({ group, user }) => json({ group: await summary(group, user.id) }));

route("PUT", "/groups/:gid", "owner", async ({ req, group, user }) => {
  const b = await body(req);
  const name = text(b.name, 60, "Group name", true);
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
  if (group.role === "owner") fail(400, "You run this group, so you can't leave it");
  await q(`UPDATE group_members SET status='left' WHERE group_id=$1 AND user_id=$2`, [group.id, user.id]);
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
      WHERE gm.group_id=$1 AND gm.status='active' ORDER BY (gm.role='owner') DESC, lower(u.nickname)`,
    [group.id, active ? active.id : null]
  );
  return json({
    members: rows.map((r) => (owner ? r : { nickname: r.nickname, role: r.role, joined_at: r.joined_at })),
    active_challenge: owner && active ? { id: active.id, title: active.title } : null,
  });
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
  return json({ ok: true });
});

/* ---- invitations ---- */
const inviteValid = (g) => g.invite_active && (!g.invite_expires_at || new Date(g.invite_expires_at) > Date.now());

route("GET", "/invite/:token", "public", async ({ params, ip }) => {
  await rateLimit(`invite:${ip}`, 60, 600);
  const g = (await q(`SELECT g.id, g.name, g.description, g.invite_active, g.invite_expires_at, u.nickname AS host FROM groups g JOIN users u ON u.id=g.owner_user_id WHERE g.invite_token=$1 AND g.status='active'`, [params.token]))[0];
  if (!g || !inviteValid(g)) fail(404, "This invitation link isn't valid any more. Ask the group admin for a new one.");
  return json({ group: { name: g.name, description: g.description }, host: g.host });
});
/** Add a player to a group (invite link or Global Search). Removed players stay out. */
async function addPlayer(gid, userId) {
  const cur = (await q(`SELECT status FROM group_members WHERE group_id=$1 AND user_id=$2`, [gid, userId]))[0];
  if (cur?.status === "removed") fail(403, "You can't rejoin this group");
  if (!cur) await q(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1,$2,'player') ON CONFLICT (group_id, user_id) DO NOTHING`, [gid, userId]);
  else if (cur.status === "left") await q(`UPDATE group_members SET status='active' WHERE group_id=$1 AND user_id=$2`, [gid, userId]);
  return json({ ok: true, group_id: gid, already: cur?.status === "active" });
}
route("POST", "/invite/:token/join", "user", async ({ params, user, ip }) => {
  await rateLimit(`join:${ip}`, 30, 600);
  const g = (await q(`SELECT id, name, settings, owner_user_id, invite_active, invite_expires_at FROM groups WHERE invite_token=$1 AND status='active'`, [params.token]))[0];
  if (!g || !inviteValid(g)) fail(404, "This invitation link isn't valid any more. Ask the group admin for a new one.");
  return addPlayer(g.id, user.id);
});
route("GET", "/groups/:gid/invite", "owner", async ({ group }) =>
  json({ token: group.invite_token, active: group.invite_active, expires_at: group.invite_expires_at, valid: inviteValid(group) }));
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
  if (group.role !== "player") fail(403, "Group admins don't submit photos");
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
  const keys = [];
  for (const img of imgs) keys.push(await saveImage(`sub/${group.id}/${user.id}`, img));
  let sub;
  try {
    sub = (await q(`INSERT INTO submissions (group_id, user_id, item_id, photo_1_key, photo_2_key, extra_photo_keys) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [group.id, user.id, itemId, keys[0], keys[1] || null, keys.slice(2)]))[0];
  } catch (e) {
    await Promise.allSettled(keys.map((k) => deleteObject(k)));
    if (e.code === "23505") fail(409, "You already have a submission for this item");
    throw e;
  }
  const it = (await q(`SELECT title FROM challenge_items WHERE id=$1`, [itemId]))[0];
  await notify(gref(group), "submission", [group.owner_user_id], `📸 ${user.nickname} submitted '${it.title}' in ${group.name}. Tap to review.`, `/g/${group.id}/review`).catch((e) => console.error(e));
  return json({ ok: true, id: sub.id });
});

/** Submission photos: only the player who took them, or the admin of the group they were submitted to. */
route("GET", "/photo/:id/:n", "user", async ({ params, user }) => {
  const s = (await q(
    `SELECT s.user_id, s.photo_1_key, s.photo_2_key, s.extra_photo_keys, g.owner_user_id,
            (s.status='approved' AND s.in_feed AND g.status='active' AND EXISTS (
              SELECT 1 FROM group_members m WHERE m.group_id=s.group_id AND m.user_id=$2 AND m.status='active')) AS shared
       FROM submissions s JOIN groups g ON g.id=s.group_id WHERE s.id=$1`,
    [int(params.id), user.id]
  ))[0];
  // The submitter and the group's admin always; other active members only once it's approved and in the group feed.
  if (!s || (s.user_id !== user.id && s.owner_user_id !== user.id && !s.shared)) fail(404, "Not found");
  return serveImage(photoAt(s, params.n));
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
    challenge: publicChallenge(c), finalized: pending === 0 && !!c.finalized_at, rows: st.rows, me: st.me, group_points: st.group_points,
    prize: prize ? { ...prize, amount: prize.amount } : { amount: c.prize_amount, status: "none", winner: null },
    completed: items.filter((i) => i.status === "approved").map((i) => ({ title: i.title, points: i.points })),
    missed: items.filter((i) => i.status !== "approved").map((i) => ({ title: i.title, points: i.points })),
    approved,
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
  await notify(gref(group), "approved", [r[0].user_id], `✅ Your submission for '${item?.title}' was approved. +${r[0].points} points!`, `/g/${group.id}`);
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
  const points = Number(b.points);
  if (!Number.isInteger(points) || points < 0 || points > 10000) fail(400, "Points must be a whole number from 0 to 10000");
  const difficulty = String(b.difficulty || "easy").toLowerCase();
  if (!DIFFICULTIES.includes(difficulty)) fail(400, "Pick a valid difficulty");
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
       FROM challenges c WHERE c.group_id=$1 AND c.status <> 'archived' ORDER BY c.start_at DESC`, [group.id]);
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
  const r = (await q(`INSERT INTO challenges (group_id, title, description, rules, start_at, end_at, prize_amount) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [group.id, c.title, c.description, c.rules, c.start, c.end, c.prize]))[0];
  await audit(user.id, group.id, "create_challenge", "challenge", r.id, { title: c.title });
  return json({ id: r.id });
});
route("PUT", "/groups/:gid/challenges/:cid", "owner", async ({ req, params, group, user }) => {
  const id = int(params.cid, "challenge");
  const cur = await getChallenge(group.id, id);
  requireDraft(cur);
  const c = parseChallenge(await body(req));
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
  if (clash[0]) fail(409, `These dates overlap "${clash[0].title}". Only one challenge can run at a time in a group.`);
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
  requireDraft(await getChallenge(group.id, id));
  const it = parseItem(await body(req));
  const r = (await q(
    `INSERT INTO challenge_items (challenge_id, title, description, instructions, difficulty, points, hint, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE((SELECT max(display_order)+1 FROM challenge_items WHERE challenge_id=$1),1)) RETURNING id`,
    [id, it.title, it.description, it.instructions, it.difficulty, it.points, it.hint]))[0];
  await audit(user.id, group.id, "add_item", "item", r.id, { title: it.title, points: it.points });
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
  if (cur.c_status !== "draft") fail(409, "This challenge is published, so its items are locked");
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
 Groups an admin has listed publicly. Anyone can find and join them; points earned in them count toward the global ranking. */
route("GET", "/global", "user", async ({ url, user }) => {
  const term = (url.searchParams.get("q") || "").trim().slice(0, 60);
  const like = term ? `%${term.replace(/[%_\\]/g, "")}%` : null;
  const groups = await q(
    `SELECT g.id, g.name, g.description, (g.image_key IS NOT NULL) AS has_image, gm.status AS my_status, gm.role AS my_role,
            (SELECT count(*) FROM group_members m WHERE m.group_id=g.id AND m.role='player' AND m.status='active')::int AS members,
            (SELECT c.title FROM challenges c WHERE c.group_id=g.id AND c.status='published' AND c.start_at <= now() AND c.end_at > now() LIMIT 1) AS live_title
       FROM groups g LEFT JOIN group_members gm ON gm.group_id=g.id AND gm.user_id=$1
      WHERE g.is_public AND g.status='active' AND ($2::text IS NULL OR g.name ILIKE $2 OR g.description ILIKE $2)
      ORDER BY members DESC, g.created_at DESC LIMIT 30`,
    [user.id, like]
  );
  const ranks = await q(
    `WITH t AS (
       SELECT pt.user_id, sum(pt.points)::int AS points, max(pt.earned_at) AS reached_at
         FROM point_transactions pt JOIN groups g ON g.id=pt.group_id AND g.is_public AND g.status='active'
        GROUP BY pt.user_id HAVING sum(pt.points) > 0
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
  if (!g) fail(404, "This group isn't open to everyone any more");
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
  const keys = [];
  for (const img of imgs) keys.push(await saveImage(`duel/${d.id}/${user.id}`, img));
  try {
    await q(`INSERT INTO duel_submissions (duel_id, item_id, user_id, photo_1_key, photo_2_key, extra_photo_keys) VALUES ($1,$2,$3,$4,$5,$6)`, [d.id, item.id, user.id, keys[0], keys[1] || null, keys.slice(2)]);
  } catch (e) {
    await Promise.allSettled(keys.map((k) => deleteObject(k)));
    if (e.code === "23505") fail(409, "You already sent photos for this item");
    throw e;
  }
  await duelAlert([them], `📸 ${user.nickname} sent proof for '${item.title}'. Judge them now.`, d);
  return json({ ok: true });
});

/** 1v1 photos: only the two players in that 1v1. */
route("GET", "/duel-photo/:id/:n", "user", async ({ params, user }) => {
  const s = (await q(`SELECT s.photo_1_key, s.photo_2_key, s.extra_photo_keys, d.creator_id, d.opponent_id FROM duel_submissions s JOIN duels d ON d.id=s.duel_id WHERE s.id=$1`, [int(params.id)]))[0];
  if (!s || !isPlayer(s, user.id)) fail(404, "Not found");
  return serveImage(photoAt(s, params.n));
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

/* ================= active hunts counter =================
 One number for the "N active hunts" bar: weekly challenges running now in any active group, plus live 1v1s. No names or ids. */
route("GET", "/stats", "public", async () => {
  const r = (await q(
    `SELECT (SELECT count(*) FROM challenges c JOIN groups g ON g.id=c.group_id AND g.status='active'
              WHERE c.status='published' AND c.start_at <= now() AND c.end_at > now())::int
          + (SELECT count(*) FROM duels WHERE status='live' AND end_at > now())::int AS n`
  ))[0];
  return json({ active_hunts: r.n }, 200, { "Cache-Control": "public, max-age=60, s-maxage=60" });
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
  if (!s) fail(404, "That post isn't in this group's feed");
  return s;
}
route("POST", "/groups/:gid/feed/:sid/comments", "member", async ({ req, params, group, user }) => {
  await rateLimit(`comment:${user.id}`, 30, 600);
  const s = await feedPost(group, params.sid);
  const msg = text((await body(req)).body, 500, "Comment", true);
  const c = (await q(`INSERT INTO feed_comments (group_id, submission_id, user_id, body) VALUES ($1,$2,$3,$4) RETURNING id, created_at`, [group.id, s.id, user.id, msg]))[0];
  if (s.user_id !== user.id) {
    // In-app only: comments can be chatty, so they don't send email.
    await q(`INSERT INTO notifications (user_id, group_id, type, title, message, link) VALUES ($1,$2,'comment',$3,$4,$5)`,
      [s.user_id, group.id, group.name, `💬 ${user.nickname} on your '${s.title}' find: "${msg.length > 80 ? msg.slice(0, 77) + "…" : msg}"`, `/g/${group.id}/feed`]).catch((e) => console.error(e));
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
  if (s.user_id !== user.id && group.role !== "owner") fail(403, "Only the player who posted it or the group admin can remove it");
  await q(`UPDATE submissions SET in_feed=false WHERE id=$1`, [s.id]);
  if (s.user_id !== user.id) await audit(user.id, group.id, "remove_from_feed", "submission", s.id);
  return json({ ok: true });
});
