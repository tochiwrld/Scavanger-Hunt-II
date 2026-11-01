# Weekly Hunt (Next.js)

A mobile-first weekly scavenger hunt for private friend groups. One account can run several groups and play in several others. Every group has its own players, weekly challenges, leaderboard, submissions, winners and ₦3,000 weekly prize, and groups never see each other's data.

## Stack

- **Next.js 15 (App Router) + React 19**: pages in `app/`, shared components in `components/`
- **API**: one catch-all route handler, `app/api/[[...path]]/route.js`, which hands every `/api/*` request to `lib/router.js` (all authorization and business rules live there, server side)
- **Supabase Postgres** via `pg`: tables live in a `hunt` schema; SQL in `supabase/migrations/` (already applied to the "Scav hunt" project)
- **Supabase Storage** (`lib/storage.js`): private `hunt-photos` bucket; photos are served only through the app, after its own permission checks
- **Scheduler**: `GET /api/cron/lifecycle` (bearer `CRON_SECRET`) sends "week is live" alerts and ending reminders, and finalizes finished weeks. A Supabase `pg_cron` job calls it every 15 minutes; `vercel.json` also runs it daily as a backstop.
- **Hosting**: Vercel (region `cdg1`, Paris, closest of Vercel's regions to Lagos)
- Plain JavaScript (no TypeScript), no UI library

```
Browser (React pages)  --fetch /api/...-->  Next route handler  -->  lib/router.js
                                                                      |-- Supabase Postgres (DATABASE_URL)
                                                                      '-- Supabase Storage (photos)
```

## Deploy

Vercel builds this repo on every push to `main`. The database and the photo bucket already exist in the Supabase project **Scav hunt** (schema `hunt`, 13 tables, row-level security on; bucket `hunt-photos`, private, 2 MB limit).

In **Vercel > the project > Settings > Environment Variables**:

| Variable | Required | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Supabase **Session pooler** connection string (see below). |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase > Project settings > API keys > `service_role`. Used only server side, to read and write photos. |
| `SESSION_SECRET` | yes | A long random string (32+ chars). Signs login cookies. |
| `CRON_SECRET` | yes | A long random string (16+ chars). The scheduler endpoint rejects anything else. |
| `SUPABASE_URL` | yes | `https://iwljafkilkizabmgczjn.supabase.co` |
| `SUPABASE_BUCKET` | no | Defaults to `hunt-photos`. |
| `DB_SCHEMA` | no | Defaults to `hunt`. |
| `APP_URL` | optional | Your site URL, used for buttons in emails. |
| `SMTP_USER` | for email | A Gmail address the app sends from. |
| `SMTP_PASS` | for email | A Google **app password** for that address (myaccount.google.com/apppasswords; needs 2-Step Verification). Not your normal password. |
| `SMTP_HOST` / `SMTP_PORT` | no | Default `smtp.gmail.com` / `465`. Change only for a different mail provider. |
| `RESEND_API_KEY` | optional | Alternative to SMTP (resend.com). Used instead of SMTP when set together with `EMAIL_FROM`. |
| `EMAIL_FROM` | optional | e.g. `Weekly Hunt <hunt@yourdomain.com>`. Required for Resend (a domain verified there); for Gmail it defaults to `Weekly Hunt <SMTP_USER>`. |

Without email, everything still works in the app, but nobody gets emailed alerts and **password-reset links can't be delivered**. Gmail allows about 500 emails a day, plenty for friend groups.

Changing an environment variable takes effect on the next deploy, so redeploy after editing one.

### The 15-minute scheduler

Run this once in the Supabase SQL editor, with your own site URL and `CRON_SECRET`:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('hunt-lifecycle', '*/15 * * * *', $$
  select net.http_get(
    url := 'https://YOUR-SITE.vercel.app/api/cron/lifecycle',
    headers := '{"Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb
  );
$$);
```

Photos are capped at 2 MB because Vercel limits request bodies to about 4.5 MB; the phone shrinks each photo before it is sent, so this is rarely noticeable.

## Your Supabase database credentials

- In the Supabase dashboard open **Scav hunt**, click **Connect**, choose **Session pooler** (port 5432, IPv4), and copy the URI. It looks like `postgresql://postgres.iwljafkilkizabmgczjn:[YOUR-PASSWORD]@<pooler-host>:5432/postgres`.
- Replace `[YOUR-PASSWORD]` with the **database password** (Project Settings > Database; use *Reset database password* if you've lost it). Paste the result into Vercel as `DATABASE_URL`.
- Use the **Session** pooler, not the Transaction pooler (port 6543): the app selects its `hunt` schema per connection, which needs session mode.
- Treat this string and the service-role key like passwords. Don't commit them or paste them into chats. The anon/publishable keys are **not** used by this app.
- Change the schema only through new files in `supabase/migrations/`, applied with Supabase (dashboard SQL editor or CLI).
- Tables have RLS enabled with no policies, so Supabase's public API can't read them. Only your server, using `DATABASE_URL`, can.

## Local development

```
npm install
# .env.local needs DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET, CRON_SECRET
npm run dev
```

## How it works

**Accounts.** Register once (nickname, email, password). You're then asked: *Create an admin account* or *Join as a player*. Same account either way; admin only turns on group-creation tools. Password recovery by email.

**Admin.** Create a group (name, description, optional image). Invite tab: copy or share `/join/<token>`, replace it (which switches off the old one), set an optional expiry, or disable it. Challenge tab: save a draft, add items (points, difficulty, hint, reference image), reorder, preview as a player, then Publish (with confirmation). Review tab: approve or reject (reason required) with both photos. Prize tab: mark each week's ₦ prize as paid (the app never moves money).

**Player.** Open an invite link or paste a code under *Join a group*, log in or sign up, tap Join. Switch groups from the header. Leaving a group keeps your account and other groups.

**1v1.** From the 1v1 tab, pick a time limit (30 minutes to 7 days) and how many items each player writes (1-10), then send the private `/vs/<token>` link. Only the first person to accept it gets in; after that the link is locked to the two of you. Each player writes a list for the other to find and taps Done; the timer starts only once both lists are done (you can tap *Edit my list* until then). You hunt your opponent's list with two photos per item, and you judge the photos sent for the items you wrote. Most approved items wins; a tie on items goes to whoever got there first. After the timer, photos sent in time can still be judged for an hour; anything left after that is approved. Either player can call it off before the timer starts.

**Global Search.** A group admin can tick *List this group in Global Search* in Settings. Listed groups appear in the Global Search section on the home page, where anyone can search for them and join with one tap (no invite needed). All-time points earned in listed groups make up the global leaderboard and rank tiers: Rookie, Bronze (50), Silver (150), Gold (400), Platinum (800), Diamond (1500), Legend (3000).

**Feed.** Each group has a Feed tab. Once the admin approves a submission, both photos appear there for the group's players, who can comment on them. Only members of that group can see the feed. The player who posted it, or the admin, can take a post off the feed (points stay). Submissions approved before the feed existed stay private.

**Active hunts.** The home page and sign-in page show one live number, e.g. "30 active hunts": weekly challenges running right now in any group plus live 1v1s. It never says which.

**The week.** Default Monday 12:00 AM to Sunday 11:59 PM Lagos time (editable before publishing). Items and points stay hidden until the challenge is live, then locked. When it ends, submissions close, results are finalized, the winner gets a pending prize record, and the next week starts at zero.

## Rules enforced on the server

- **Group isolation:** every `/api/groups/:id/...` route first checks you're an active member (or the owner, for admin routes); challenge, item, submission and member IDs are always looked up inside that group.
- **Photos** open only for the player who took them and the admin of that group. Reference images show to members only after the challenge starts.
- **Points** come from the item in the database at approval time; a unique index guarantees one payment per player per item.
- **Tie-break:** equal points rank by the submission time of the player's latest scoring item; the rule is shown with every challenge and leaderboard.
- **Submissions:** exactly 2 photos (JPEG/PNG/WebP checked by content, 2 MB each, shrunk on the phone first), immutable once sent, refused after the deadline.
- **Auth:** scrypt password hashing, signed HttpOnly cookies, origin check on writes, rate limits on register, login, invites, resets and submissions. Emails are never shown to other users, including group admins.
- **Score adjustments** are logged per group (previous, new, difference, reason, admin, time).

## Notes

- Times are shown and entered in Lagos time for everyone.
- Pending submissions can be reviewed after a week ends; results and the prize winner update until the prize is marked paid.
- An approval can't be undone in the UI; use Adjust score with a reason.
- Not built: GPS checks, phone push notifications, in-app group deletion.
