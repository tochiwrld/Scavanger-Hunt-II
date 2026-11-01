# Hunt Week — project notes for Claude

Mobile-first weekly scavenger hunt for private friend groups (Lagos, Nigeria). One account can run several groups and play in others. Each group has its own players, weekly challenge, leaderboard, submissions and ₦3,000 weekly prize. Groups must never see each other's data.

Live site: https://weekly-hunt.vercel.app — owner's real group is "Ghetto Search" (group id 1). Treat production data as real.

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
- `components/ui.js` shared pieces (ItemCard, LbRows, ChallengeHead, Plate, StatusPill, Difficulty, Countdown, useApi, useForm)
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
- Submission photos: pending/rejected ones are visible only to the submitter and that group's owner. Approved ones with `in_feed = true` are also visible to that group's active members (group feed). Submissions from before the feed launched have `in_feed = false` and stay private. The poster or the admin can take a post off the feed (`in_feed = false`). Emails are never shown to other users.
- Points come from the item row at approval time, never from the client. Unique indexes guarantee one approval payment per player per item.
- Tie-break: equal points → whoever reached that score first (time of the approved submission that got them there).
- 1 to 4 photos per submission (`photo_1_key` required, `photo_2_key` optional, photos 3-4 in `extra_photo_keys`; form fields `photo1`..`photo4`; served as `/api/photo/:id/1..4`); immutable once sent; refused after the deadline. Rejection needs a reason.
- Published challenges are locked. Times are entered and shown in Africa/Lagos (UTC+1, no DST). Default week: Monday 00:00 → Sunday 23:59:59.

## 1v1 and Global Search rules
- A 1v1 link (`/vs/<token>`) seats only the first person to accept (atomic UPDATE); afterwards it returns 410 to anyone else. Every `/duels/:id` route goes through `duelFor()`, which 404s for non-players.
- Each player's list stays hidden from the other until both tap Done; the timer starts when the second player is ready. Only the item's writer judges its photos; 1v1 photos are served only to the two players (`/api/duel-photo`).
- The 1v1 room has two tabs once the timer starts: "Your hunt" (judging, your hunt, your list) and "Finds" (`finds` in `GET /duels/:id`): approved photo pairs from both players, Facebook-style (`components/FindPost.js`, shared with the group feed). Players only.
- A 1v1 finishes when time is up and nothing is pending, or as soon as both players have every item approved. Winner: most approved items, ties to whoever finished first. Only the winner sees the "YOU WIN" animation (`public/img/you-win.mp4|webm|jpg`), full-screen once and then in the result card.
- Pending 1v1 photos are auto-approved 60 minutes after the timer ends (`REVIEW_GRACE_MINUTES`); `runDuelLifecycle()` (part of the cron) finishes duels and alerts both players. 1v1 notifications have `group_id` NULL.
- Global ranking = all-time points from groups with `is_public = true`. Public groups can be joined without an invite; removed members still can't rejoin.

## Design system
Matches the reference https://scavenger-hunt-website.netlify.app/ ("HUNTWEEK"). Dark by default, `html.light` for light mode (saved in `localStorage.theme`). Tokens and all styles are in `app/globals.css` (oklch colours, `--primary` yellow). Fonts: Bricolage Grotesque (headings, uppercase), Space Grotesk (body), JetBrains Mono (numbers). Floating pill nav at the bottom. Hero photo: `https://iwljafkilkizabmgczjn.supabase.co/storage/v1/object/public/site/hero.jpg` (public `site` bucket).

## Infrastructure
- GitHub: `tochiwrld/Scavanger-Hunt-II` (public). **Pushing to `main` auto-deploys to Vercel production.**
- Vercel: project `weekly-hunt`, team slug `wsh8`, region `cdg1`. Env vars are set in the Vercel dashboard (never commit them).
- Supabase: project "Scav hunt", ref `iwljafkilkizabmgczjn`, region eu-west-3. All `hunt` tables have RLS on with no policies (only the server, via `DATABASE_URL`, can read them).
- Scheduler: Supabase `pg_cron` job `hunt-lifecycle` calls `GET /api/cron/lifecycle` every 15 min with `Authorization: Bearer $CRON_SECRET`; `vercel.json` also runs it daily as a backstop.

### Environment variables (names only)
`DATABASE_URL` (Supabase **Session pooler**, host `aws-1-eu-west-3.pooler.supabase.com`, port **5432** — not the transaction pooler, the app needs session mode), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET` (hunt-photos), `DB_SCHEMA` (hunt), `SESSION_SECRET`, `CRON_SECRET`, `APP_URL`, `SMTP_USER`, `SMTP_PASS`, optional `SMTP_HOST`/`SMTP_PORT`, `RESEND_API_KEY`, `EMAIL_FROM`.

## Working on it
- Local: `npm install`, put the env vars above in `.env.local`, `npm run dev`.
- Quick compile/import check without a full build: bundle every page with esbuild (`--loader:.js=jsx --jsx=automatic`, externals for next/react/pg/nodemailer). A missing named import fails the bundle.
- Smoke-test against production by running fetch() calls from the site's own origin (cookies + origin check work). Prefix any test accounts/groups with `zz` and delete them afterwards — never touch other groups.
- Health check: `GET /api/invite/anything` returns 404 JSON when the database is reachable, 500 when it isn't. Runtime errors: Vercel runtime logs.

## Known gaps / open items
- Nothing deletes submission photos; they accumulate (~2 per item per player per week).
- Photo uploads capped at 2 MB each (Vercel's ~4.5 MB request limit); the phone shrinks photos before upload.
- Old single-group tables still sit in the `public` schema, locked and unused. Safe to drop on request.
- `pg` logs a harmless deprecation warning because `SET search_path` runs on connect alongside the first query.
- Secrets were once pasted into a chat; the owner may rotate the Supabase secret key and Gmail app password (update the Vercel env vars and redeploy).
