# Photo deletion policy

Implemented in `lib/retention.js` (`runRetention()`, run by the 15-minute cron) and shown to users in the Privacy Policy, sections 5 and 6.

| Trigger | What is deleted | When |
|---|---|---|
| A weekly challenge ends | All its submission photos and submissions (with rejection reasons), their feed comments, and the items' reference images | `end_at + 7 days` |
| A 1v1 finishes or is cancelled | All its photos, submissions and both lists | `finished_at + 7 days` |
| A Team vs match finishes or is cancelled | All its photos, submissions and both teams' lists (score card kept on `team_matches`) | `finished_at + 7 days` |
| A daily hunt photo is taken | The photo (the `daily_finds` row stays as the streak) | `created_at + 7 days` |
| A player deletes their account | Every photo they took (hunts and 1v1s). The account is anonymised to "Deleted player"; other players' photos and results are untouched | Immediately |
| An admin deletes a hunt | Every photo in the hunt, its item reference images and the hunt image | Immediately |
| An admin replaces/removes a hunt image or reference image | The old file | Immediately |
| A player or admin removes a post from the feed | Nothing is deleted; the photo becomes private again (submitter + admin) until the 7-day deletion | — |
| Email request to the operator | A specific photo | On request |

**Kept (score cards):** challenge titles and dates, item names and points, `point_transactions`, `weekly_results`, `prizes`, and each 1v1's final scores (`duels.creator_items/opponent_items/..._reached_at`) and winner.

**Order of deletion:** files are removed from Supabase Storage **first**, the database rows **second**. If storage refuses, the rows stay and the job retries 15 minutes later, so no photo is ever orphaned.

**Before upload is stored:** EXIF/XMP/comments (including GPS) are stripped on the server (`lib/imagesafe.js`), and the in-app camera re-encodes every photo with a stamp.

**Housekeeping in the same job:** notifications older than 30 days; expired password-reset tokens; rate-limit rows older than 2 days.
