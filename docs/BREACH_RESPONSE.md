# Data breach response procedure

Owner: the PrimaHunt operator (contact in `lib/shared.js` → `PRIVACY_CONTACT`).
Law: Nigeria Data Protection Act 2023 (NDPA) s.40 and the NDPC General Application and Implementation Directive (GAID) 2025.

A **personal data breach** is any security incident that leads to personal data being destroyed, lost, changed, disclosed or accessed without authorisation. Examples for PrimaHunt: a leaked `DATABASE_URL` or Supabase service key, someone viewing another hunt's photos, a stolen admin session, emails sent to the wrong people, accidental public exposure of the `hunt-photos` bucket.

## The clock
- The 72 hours start when you **become aware** of a breach, not when you finish investigating.
- **NDPC:** notify within **72 hours** if the breach is likely to risk people's rights and freedoms. If you don't have every detail yet, report what you know and send the rest in phases.
- **Players:** tell them **without undue delay** if the risk to them is high, with steps they can take.
- **Every breach**, reportable or not, goes in the breach log below.

## Step 1. Contain (first hour)
Do whatever stops the leak; you can investigate afterwards.

| If this leaked or is suspected | Do this now |
|---|---|
| `DATABASE_URL` / database password | Supabase → Project Settings → Database → **Reset database password**. Update `DATABASE_URL` in Vercel → Settings → Environment Variables. Redeploy. |
| `SUPABASE_SERVICE_ROLE_KEY` (secret key) | Supabase → Project Settings → API Keys → **revoke** the secret key and create a new one. Update the Vercel env var. Redeploy. |
| `SESSION_SECRET` (or sessions hijacked) | Set a new random `SESSION_SECRET` (32+ chars) in Vercel and redeploy. **This logs everyone out.** |
| `CRON_SECRET` | New value in Vercel, then update the `hunt-lifecycle` pg_cron job's `Authorization` header in Supabase. |
| Gmail app password (`SMTP_PASS`) | Google Account → Security → App passwords → revoke, create a new one, update Vercel. |
| GitHub access | Revoke tokens/sessions; check recent commits to `main` (pushing to `main` deploys to production). |
| A code bug exposing data | Roll back to the last good deployment in Vercel (Deployments → ⋯ → **Promote to Production**), then fix. |
| Bucket made public by mistake | Supabase → Storage → `hunt-photos` → make it **private** again. |

Then preserve evidence: export Vercel runtime logs and Supabase logs (API, Postgres, Storage) for the time window before they roll over.

## Step 2. Assess (within 24 hours)
Write down:
1. What happened, how it was found, and when (start, discovery, containment).
2. Which data: emails? photos? password hashes (scrypt, salted)? Which hunts?
3. How many people and how many records (`SELECT count(*) FROM hunt.users`, per-hunt counts).
4. Likely consequences: e.g. leaked emails → phishing risk; leaked photos → embarrassment, identification; password hashes → offline cracking of weak passwords.
5. Is the data still exposed? Is it intelligible (encrypted/hashed) to the attacker?

**Report to the NDPC** unless the breach is unlikely to cause any risk (for example, only encrypted data with the key safe, or exposure to no one).

## Step 3. Notify the NDPC (within 72 hours)
Use the NDPC's breach-notification channel published at https://ndpc.gov.ng (check the site for the current form/portal and email). Include:
- Your name and contact (the operator) and the service (PrimaHunt, weekly-hunt.vercel.app).
- Nature of the breach; categories and approximate numbers of people and records.
- Likely consequences.
- Measures taken or proposed to address it and limit harm.
- If late, the reasons for the delay.

## Step 4. Tell affected players (high risk → without delay)
Send through the in-app notifications **and** email (both are available; email via `sendEmails` in `lib/notify.js`).

Template:
> **Subject:** Security notice from PrimaHunt
>
> On [date] we found that [what happened, in plain words]. It affected [what data], from [time window]. We have [what you did to stop it].
>
> What you should do: [e.g. change your PrimaHunt password; if you use the same password elsewhere, change it there too; be wary of emails pretending to be PrimaHunt].
>
> We've reported this to the Nigeria Data Protection Commission. Questions: [contact email].

If contacting people individually is impossible or disproportionate, post the notice prominently on the sign-in page instead.

## Step 5. Recover and review (within 2 weeks)
- Fix the root cause; add a test or check so it can't recur.
- Update `CLAUDE.md`, this file and the Privacy Policy if anything changed.
- Complete the breach log entry.

## Breach log
Keep one entry per incident (including near-misses you decided not to report). Do not put personal data or secrets in this file; it is in a public repository. Keep the full record privately and summarise here.

| # | Discovered | Contained | What happened (summary) | Data / people affected | Risk | NDPC notified (date) | Players notified (date) | Fix |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-10-30 | Open | Several production secrets (Supabase secret key, database password, Gmail app password) were pasted into a chat session with an AI assistant while setting up hosting. No evidence of misuse. | None known | Low (not public), but keys should be rotated | Not required unless misuse is found | No | **Rotate the Supabase secret key, database password and Gmail app password** (Step 1) |
