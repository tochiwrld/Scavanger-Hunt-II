# Hosting providers and international data transfers

Last reviewed: 3 November 2026. Fonts are self-hosted (next/font) since 3 Nov 2026, so browsers no longer contact Google Fonts. Shown to users in the Privacy Policy, section 7 (`app/(public)/privacy/page.js`).

PrimaHunt has no infrastructure in Nigeria. All personal data leaves Nigeria.

## Data map

| Provider (company, HQ) | Service | Region / location | Personal data it handles | Notes |
|---|---|---|---|---|
| **Supabase Inc.** (USA), on Amazon Web Services | Postgres database, private Storage bucket `hunt-photos`, public bucket `site` (hero image only), pg_cron | **eu-west-3, Paris, France** | Everything: accounts (nickname, email, password hash), game data, consent records, photos | Project ref `iwljafkilkizabmgczjn`. RLS on, no policies; only the server role reads data. Daily backups by Supabase (kept per plan). |
| **Vercel Inc.** (USA) | Hosts the Next.js app and API (serverless functions), CDN, runtime logs | Functions in **cdg1, Paris, France**; requests pass through Vercel's global edge network | All data in transit; request logs (IP, path, time) | Project `weekly-hunt`, team `wsh8`. Logs retained per Vercel plan. |
| **Google LLC** (USA) | Gmail SMTP for outgoing email (`SMTP_USER`) | USA / global | Recipient email address, email content (nickname, hunt names, game updates, password-reset links) | Only if emails are on. |
| **Resend** (USA), *optional* | Transactional email if `RESEND_API_KEY` is set | USA | Same as Gmail | Not configured today. |
| **GitHub** (Microsoft, USA) | Source code (`tochiwrld/Scavanger-Hunt-II`, public) | USA | **None.** No user data or secrets in the repo. | Keep it that way. |

## Legal basis for the transfers (NDPA Part VIII, ss.41–43; GAID 2025 Art. 45, Schedule 5)
1. **Adequacy (s.41/42):** The main destination is France (EU). The EU GDPR gives enforceable data-subject rights and redress, an independent supervisory authority (CNIL) with enforcement powers, and international commitments, which match the Schedule 5 adequacy factors. The NDPC has not yet issued adequacy decisions or a whitelist, so this is our own assessment.
2. **Contractual safeguards:** Each provider's Data Processing Addendum (DPA) binds it to process data only on instructions, keep it confidential and secure, use vetted sub-processors and assist with breaches. Accept or download the DPAs and keep copies:
   - Supabase: dashboard → Organization → Legal Documents (DPA)
   - Vercel: vercel.com/legal/dpa
   - Google Workspace/Gmail: Google's Cloud Data Processing Addendum (only covers Workspace accounts; a personal Gmail account has no DPA, which is a reason to switch to Resend or a Workspace account for email)
3. **Informed consent (s.43):** Every user ticks a separate statement at registration ("I agree that my data is stored and processed by PrimaHunt's providers outside Nigeria…"), after being told the risk in the Privacy Policy. The wording, version and time are stored in `hunt.consents`.

## Transfer risk notes
- US-headquartered providers may receive US government requests for data they hold, even when it is stored in France.
- Mitigations: minimal data collected (no real names, phone numbers, location or payment data); EXIF/GPS stripped from photos; photos and submissions deleted 7 days after each hunt; passwords hashed; private bucket; secrets only in Vercel env vars.

## When this file must be updated
Adding or changing a provider, moving region, enabling Resend, adding analytics, or the NDPC publishing adequacy decisions or transfer instruments. Update the Privacy Policy at the same time and bump `PRIVACY_VERSION` in `lib/shared.js` if users need to re-consent.
