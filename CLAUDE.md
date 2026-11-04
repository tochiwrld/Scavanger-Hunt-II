# PrimaHunt — project notes for Claude

Mobile-first weekly scavenger hunt for private friend groups (Lagos, Nigeria). One account can run several groups and play in others. Each group has its own players, weekly challenge, leaderboard, submissions and ₦3,000 weekly prize. Groups must never see each other's data.

Live site: https://weekly-hunt.vercel.app (brand: **PrimaHunt**, wordmark PRIMA<em>HUNT</em>; formerly Hunt Week) — owner's real group is "Ghetto Search" (group id 1). The site's official public hunt is **PRIMAHUNT OFFICIAL** (group id 11, owner user id 1): `groups.auto_join = true`, so `POST /auth/register` adds every new account as a player; all accounts that existed on 2026-11-04 were added once. Members who leave or are removed are not re-added. It is also `groups.is_official = true`: no cash prize (`prize_amount` forced to 0; prize UI hides when 0 and no prize row is created), listed first in My hunts and Global Search, its Challenges tab runs Week 1 → 5 top-down; weekly challenges (from 4 Nov 2026: Weeks 1–5, 2 Nov → 6 Dec 2026, 20 items each from the 100-item list, a mix of difficulties per week), admins can **add** items to the published challenge (never edit/delete; first reference image allowed; players get an in-app alert), photos are deleted right after an admin approves or rejects (`purgeSubmissionPhotos()` in `lib/retention.js`, with `runRetention()` as backstop), keeping the row (`photos_purged_at` set, keys blanked, `PHOTO_COUNT` = 0); the feed shows the find as text only ("tochi found “X”"); comments go 7 days after review. It never emails: `settings.email_enabled` is forced false and reminder emails ignore it. Treat production data as real.

## Stack
- Next.js 15 App Router + React 19, **plain JavaScript (no TypeScript), no UI library**.
- One API route: `app/api/[[...path]]/route.js` → `lib/router.js` `handle(req)`. **All business rules and authorization live in `lib/router.js`.** Routes are declared with `route(method, path, auth, fn)` where auth is `public` | `user` | `member` | `owner`.
- Postgres on Supabase via `pg` (`lib/db.js`); tables live in the **`hunt` schema** (`search_path` set per connection). SQL in `supabase/migrations/`.
- Photos: private Supabase Storage bucket `hunt-photos` via REST (`lib/storage.js`), served only through `/api/photo/:id/:n` after permission checks.
- Email: Gmail SMTP via nodemailer (`SMTP_USER`/`SMTP_PASS`), or Resend if `RESEND_API_KEY` + `EMAIL_FROM` are set (`lib/notify.js`).
- Custom auth (`lib/util.js`): scrypt passwords, HMAC-signed HttpOnly `sid` cookie, origin check on writes, DB-backed rate limits.

## Layout
- `app/(public)/` login, register, forgot, reset/[token], join/[token]
- `app/(app)/` signed-in pages, wrapped by `components/AppShell.js`; group pages under `app/(app)/g/[gid]/…`
- `components/ui.js` shared pieces (ItemCard, LbRows, ChallengeHead, Plate, StatusPill, Difficulty, Countdown, useApi, useForm). `useApi(path, { poll: ms })` re-checks quietly while the page is visible (the leaderboard polls every 60 s; no Realtime, no refresh button).
- `components/icons.js` inline Lucide-style icons (`<Icon n="trophy" />`); `components/Brand.js` logo + theme toggle
- `lib/duel.js` 1v1 phases, scoring and finishing; 1v1 routes are at the end of `lib/router.js`; pages `app/(app)/duels`, `app/(app)/duel/[id]`, `app/(public)/vs/[token]`
- `components/GlobalSearch.js` public groups + global leaderboard on the home page (`GET /global`, `POST /global/:gid/join`; admins toggle `groups.is_public` in Settings)
- Group feed: `app/(app)/g/[gid]/feed/page.js`; routes `GET /groups/:gid/feed`, `POST /groups/:gid/feed/:sid/comments`, `DELETE /groups/:gid/comments/:cid`, `POST /groups/:gid/feed/:sid/remove` (table `feed_comments`). Comment alerts are in-app only (no email).
- Active-hunts bar: `components/ActiveHunts.js` reads public `GET /stats` (live challenges in active groups + live 1v1s; a single number, no names).
- `lib/game.js` scoring, leaderboard, tie-break, weekly results; `lib/notify.js` notifications + `runLifecycle()`; `lib/client.js` browser helpers

## Naming
- In the UI a group is called a **hunt** ("My hunts", "Create a hunt", "Join a hunt", bottom-nav "Hunts"). Code, routes and the database still say `group`. The weekly challenge inside a hunt is "the week"/"challenge" (the in-hunt "Hunt" tab lists its items).
- Sign-in hero: "Hunt it. Snap it. Win the week."; the hero copy doesn't mention the cash prize.

## Rules that must hold
- Every `/groups/:gid/...` route goes through `membership()`; look up challenge/item/submission/member IDs **inside that group**.
- Admins: `group_members.role` is `owner` (founder, = `groups.owner_user_id`), `admin` (co-admin, max `MAX_CO_ADMINS` = 1, also a partial unique index) or `player`. `membership()` maps `admin` → `role: "owner"` so co-admins get every admin route, and sets `group.founder` / `group.member_role`. Route auth `founder` is founder-only: `DELETE /groups/:gid`, `POST /groups/:gid/members/:uid/make-admin`, `.../remove-admin`. Member removal only touches `role='player'`, so a co-admin can't remove the founder. Co-admins see pending photos and get submission alerts; a co-admin who leaves drops back to player. Summaries send `founder` and `co_admin`; `RoleBadge` shows "Co-admin".
- Submission photos: pending/rejected ones are visible only to the submitter and that group's owner. Approved ones with `in_feed = true` are also visible to that group's active members (group feed). Submissions from before the feed launched have `in_feed = false` and stay private. The poster or the admin can take a post off the feed (`in_feed = false`). Emails are never shown to other users.
- Points come from the item row at approval time, never from the client. Unique indexes guarantee one approval payment per player per item.
- Tie-break: equal points → whoever reached that score first (time of the approved submission that got them there).
- 1 to 4 photos per submission (`photo_1_key` required, `photo_2_key` optional, photos 3-4 in `extra_photo_keys`; form fields `photo1`..`photo4`; served as `/api/photo/:id/1..4`); immutable once sent; refused after the deadline. **Camera only**: `components/CameraCapture.js` opens a live in-app camera (getUserMedia) for every photo, with no gallery or file picker, and burns a stamp (PRIMAHUNT · nickname · item · Lagos time) into the bottom. Pinch or 1×/2×/3×/5× zoom (track `zoom` constraint when supported, else centre crop on capture). Front/back flip button (stops the old stream before opening the other camera; selfies are saved mirrored as previewed). Browsers without getUserMedia fall back to `capture="environment"`/`"user"` buttons (phone camera). This is client-side; the stamp plus admin review is the real check. Rejection needs a reason.
- Deleting a hunt: `DELETE /groups/:gid` (owner only, body `confirm` must equal the hunt name; Settings → "Delete this hunt"). DB rows cascade from `groups`; photos (submissions, item references, hunt image) are removed from storage; other members get an in-app note with `group_id` NULL.
- Published challenges are locked. Times are entered and shown in Africa/Lagos (UTC+1, no DST). Default week: Monday 00:00 → Sunday 23:59:59.

## Privacy, retention and accounts
- Policy page: `app/(public)/privacy/page.js` (`/privacy`). Shared constants in `lib/shared.js`: `PRIVACY_VERSION`, `PRIVACY_CONTACT`, `RETAIN_DAYS` (7), `CONSENT_ITEMS`, `DIFFICULTY_POINTS`. **Bump `PRIVACY_VERSION` when the policy changes materially**: every user must re-accept.
- Consent: registration requires every `CONSENT_ITEMS` key `=== true` in `body.consent` (18+, policy, photo visibility, 7-day deletion, transfers abroad). Stored on `users.privacy_version/privacy_accepted_at` and as history in `hunt.consents`. `handle()` returns **428** for any signed-in route (except `CONSENT_FREE`) until the current version is accepted; `AppShell` shows `components/Consent.js` (`POST /me/consent`).
- Rights: `GET /me/export` (JSON download), `DELETE /me` (password + "DELETE"; deletes photos first, then the user row, which cascades, including hunts they own and their 1v1s).
- Retention: `lib/retention.js` `runRetention()` runs in the cron after `runLifecycle()`. 7 days after a challenge's `end_at` (or a 1v1's finish) it deletes submissions + photos + comments + reference images, and 1v1 submissions + items; keeps score cards (`point_transactions`, `weekly_results`, `prizes`, `duels.creator_items/opponent_items/*_reached_at`). Storage first, rows second. Also prunes notifications > 30 days, old resets and rate limits. `duelScores()` uses the saved score once a duel is finished.
- Uploads: `lib/imagesafe.js` `sanitizeImage()` strips EXIF/XMP/comments (GPS) and rejects > 8000 px / 40 MP, without re-encoding. Photos served with `private, max-age=3600` (browser-only cache; photos are immutable), `nosniff`, `CSP: sandbox`, `CORP: same-origin`.
- Photo size: `CameraCapture` saves 1280px WebP (JPEG where the browser can't encode WebP), ~150-300 KB. `SubmitSheet` also sends a 400px `thumbN` per photo (`lib/client.js` `makeThumb`); the server stores them in `thumb_keys text[]` (aligned with the photos, `''` where none) on `submissions` and `duel_submissions`. `/api/photo/:id/:n?s=thumb` (and `/api/duel-photo`) serves the thumbnail, falling back to the full photo. `Photos` in `components/ui.js` shows thumbs and opens the full photo on tap; `ReviewCard` passes `thumb={false}` so admins judge full photos. Any query feeding `photoKeys()` must select `thumb_keys` so deletions remove thumbnails too.
- Reminder emails: `lib/reminders.js` `runReminders()` (cron, 10:00–19:59 Lagos). `users.last_seen_at` (updated by `currentUser()` at most every 30 min; also resets `nudge_count`), `last_nudge_at`, `nudge_count`, `email_reminders`. In a live hunt and away `NUDGE_ACTIVE_DAYS` (3) → "NO FORGET YOUR HUNT O!" with their live hunts and the total live count; away `NUDGE_DORMANT_DAYS` (14) → same, max `NUDGE_DORMANT_MAX` (3) in a row. Opt-out: Profile toggle (`PUT /me/reminders`) or signed `GET /api/unsubscribe?u=&s=` (own HMAC context, not a login token).
- Item points come from `DIFFICULTY_POINTS` (easy 5, medium 10, hard 15, extreme 20); the client only sends a difficulty.
- Docs: `docs/BREACH_RESPONSE.md`, `docs/HOSTING_AND_TRANSFERS.md`, `docs/NDPC_ASSESSMENT.md`, `docs/PHOTO_DELETION_POLICY.md`. Update them with any new provider or data use.

## 1v1 and Global Search rules
- A 1v1 link (`/vs/<token>`) seats only the first person to accept (atomic UPDATE); afterwards it returns 410 to anyone else. Every `/duels/:id` route goes through `duelFor()`, which 404s for non-players.
- Each player's list stays hidden from the other until both tap Done; the timer starts when the second player is ready. Only the item's writer judges its photos; 1v1 photos are served only to the two players (`/api/duel-photo`).
- The 1v1 room has two tabs once the timer starts: "Your hunt" (judging, your hunt, your list) and "Finds" (`finds` in `GET /duels/:id`): approved photos from both players, Facebook-style ("Tochi found “item”") (`components/FindPost.js`, shared with the group feed). Players only.
- A 1v1 finishes when time is up and nothing is pending, or as soon as both players have every item approved. Winner: most approved items, ties to whoever finished first. Only the winner sees the "YOU WIN" animation (`public/img/you-win.mp4|webm|jpg`), full-screen once and then in the result card.
- Pending 1v1 photos are auto-approved 60 minutes after the timer ends (`REVIEW_GRACE_MINUTES`); `runDuelLifecycle()` (part of the cron) finishes duels and alerts both players. 1v1 notifications have `group_id` NULL.
- Players can join a hunt at any time, including mid-week: they can submit right away and appear on that week's leaderboard. The invite page and join responses include `live` so the UI says so.
- Global ranking = all-time points from groups with `is_public = true`. Public groups can be joined without an invite; removed members still can't rejoin.

## Design system
Matches the reference https://scavenger-hunt-website.netlify.app/ ("HUNTWEEK"). Dark by default, `html.light` for light mode (saved in `localStorage.theme`). Tokens and all styles are in `app/globals.css` (oklch colours, `--primary` yellow). Fonts: Bricolage Grotesque (headings, uppercase), Space Grotesk (body), JetBrains Mono (numbers). Floating pill nav at the bottom; inside a hunt it skips Overview/Home, Review and Leaderboard (already in the hunt's tab row) and shows Hunt (players), Feed, Hunts, 1v1, Profile. Hero photo: `https://iwljafkilkizabmgczjn.supabase.co/storage/v1/object/public/site/hero.jpg` (public `site` bucket).

## Infrastructure
- GitHub: `tochiwrld/Scavanger-Hunt-II` (public). **Pushing to `main` auto-deploys to Vercel production.**
- Vercel: project `weekly-hunt`, team slug `wsh8`, region `cdg1`. Env vars are set in the Vercel dashboard (never commit them).
- Supabase: project "Scav hunt", ref `iwljafkilkizabmgczjn`, region eu-west-3. All `hunt` tables have RLS on with no policies (only the server, via `DATABASE_URL`, can read them).
- Scheduler: Supabase `pg_cron` job `hunt-lifecycle` calls `GET /api/cron/lifecycle` every 15 min with `Authorization: Bearer $CRON_SECRET`; `vercel.json` also runs it daily as a backstop.

### Environment variables (names only)
`DATABASE_URL` (Supabase **Session pooler**, host `aws-1-eu-west-3.pooler.supabase.com`, port **5432** — not the transaction pooler, the app needs session mode), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` (hunt-photos), `DB_SCHEMA` (hunt), `SESSION_SECRET`, `CRON_SECRET`, `APP_URL`, `SMTP_USER`, `SMTP_PASS`, optional `SMTP_HOST`/`SMTP_PORT`, `RESEND_API_KEY`, `EMAIL_FROM`.

## Working on it
- Local: `npm install`, put the env vars above in `.env.local`, `npm run dev`.
- 428 handling: never reload inside the app (AppShell renders the consent gate; nothing else fetches until `me.privacy_ok`). Only `/join/*` and `/vs/*` hop to `/?next=`. A reload there once caused an endless loop.
- `lib/db.js` `q()` checks out a client and awaits `SET search_path` once per connection before querying.
- Connections: the session pooler caps ALL instances at 15 connections. `lib/db.js` keeps `max: 2`, `idleTimeoutMillis: 5000` and calls `attachDatabasePool()` (`@vercel/functions`) so sleeping instances release them. On 2026-11-04 idle connections from sleeping instances filled the pooler (`EMAXCONNSESSION`) and blocked logins; quick relief is `pg_terminate_backend` on idle `Supavisor` backends.
- Quick compile/import check without a full build: bundle every page with esbuild (`--loader:.js=jsx --jsx=automatic`, externals for next/react/pg/nodemailer). A missing named import fails the bundle.
- Smoke-test against production by running fetch() calls from the site's own origin (cookies + origin check work). Prefix any test accounts/groups with `zz` and delete them afterwards — never touch other groups.
- Health check: `GET /api/invite/anything` returns 404 JSON when the database is reachable, 500 when it isn't. Runtime errors: Vercel runtime logs.

## Known gaps / open items
- NDPC registration becomes required above 200 users in six months (see docs/NDPC_ASSESSMENT.md).
- Photo uploads capped at 2 MB each, thumbnails at 300 KB (Vercel's ~4.5 MB request limit); the phone shrinks photos before upload. The `hunt-photos` bucket itself also enforces 2 MB and JPEG/PNG/WebP.
- Old single-group tables still sit in the `public` schema, locked and unused. Safe to drop on request.
- Secrets were once pasted into a chat; the owner may rotate the Supabase secret key and Gmail app password (update the Vercel env vars and redeploy).
