// Data retention (see /privacy and docs/PHOTO_DELETION_POLICY.md).
// RETAIN_DAYS after a weekly challenge ends, or after a 1v1 finishes, everything except the score card is deleted:
// submissions and their photos, feed comments (cascade), rejection reasons, item reference images, 1v1 lists and photos.
// Kept: challenge titles/dates, items' names and points, point_transactions, weekly_results, prizes, 1v1 final scores and winner.
// Photos are deleted from storage first and the rows second, so a storage failure never leaves orphaned photos behind.
import { q } from "./db.js";
import { deleteObjects } from "./storage.js";
import { RETAIN_DAYS } from "./shared.js";

/** Every stored file of these submission rows: the photos and their thumbnails. Callers must select thumb_keys too. */
export const photoKeys = (rows) => rows.flatMap((r) => [r.photo_1_key, r.photo_2_key, ...(r.extra_photo_keys || []), ...(r.thumb_keys || [])]).filter(Boolean);

/** Every stored file that belongs to a hunt: submission photos, item reference images and the hunt image. */
export async function groupPhotoKeys(gid) {
  const subs = await q(`SELECT photo_1_key, photo_2_key, extra_photo_keys, thumb_keys FROM submissions WHERE group_id=$1`, [gid]);
  const other = await q(
    `SELECT ci.reference_image_key AS k FROM challenge_items ci JOIN challenges c ON c.id=ci.challenge_id WHERE c.group_id=$1 AND ci.reference_image_key IS NOT NULL
     UNION ALL SELECT image_key FROM groups WHERE id=$1 AND image_key IS NOT NULL`, [gid]);
  return [...photoKeys(subs), ...other.map((r) => r.k)];
}
/** Photos in every 1v1 a user plays in (those duels are deleted with the account). */
export async function userDuelPhotoKeys(uid) {
  return photoKeys(await q(
    `SELECT s.photo_1_key, s.photo_2_key, s.extra_photo_keys, s.thumb_keys FROM duel_submissions s JOIN duels d ON d.id=s.duel_id WHERE d.creator_id=$1 OR d.opponent_id=$1`, [uid]));
}

export async function runRetention() {
  const days = RETAIN_DAYS;
  const report = { submissions: 0, references: 0, duels: 0, photos: 0, rolling: 0 };

  // Weekly hunts
  const subs = await q(
    `SELECT s.id, s.photo_1_key, s.photo_2_key, s.extra_photo_keys, s.thumb_keys
       FROM submissions s JOIN challenge_items i ON i.id=s.item_id JOIN challenges c ON c.id=i.challenge_id
      WHERE c.status IN ('published','archived') AND c.end_at < now() - make_interval(days => $1) LIMIT 1000`, [days]);
  if (subs.length) {
    report.photos += await deleteObjects(photoKeys(subs));
    await q(`DELETE FROM submissions WHERE id = ANY($1::int[])`, [subs.map((s) => s.id)]);
    report.submissions = subs.length;
  }
  const refs = await q(
    `SELECT i.id, i.reference_image_key AS k FROM challenge_items i JOIN challenges c ON c.id=i.challenge_id
      WHERE c.status IN ('published','archived') AND c.end_at < now() - make_interval(days => $1) AND i.reference_image_key IS NOT NULL LIMIT 1000`, [days]);
  if (refs.length) {
    report.photos += await deleteObjects(refs.map((r) => r.k));
    await q(`UPDATE challenge_items SET reference_image_key=NULL WHERE id = ANY($1::int[])`, [refs.map((r) => r.id)]);
    report.references = refs.length;
  }
  await q(`UPDATE challenges SET purged_at=now() WHERE purged_at IS NULL AND status IN ('published','archived') AND end_at < now() - make_interval(days => $1)`, [days]);

  // Long-running official hunts (groups.is_official, e.g. PRIMAHUNT OFFICIAL) last about a year, so their photos can't wait for
  // the end: each reviewed submission's photos, thumbnails and feed comments go RETAIN_DAYS after review. The row stays (photo keys
  // blanked, photos_purged_at set) so the item still counts as approved and can't be submitted twice.
  const rolling = await q(
    `SELECT s.id, s.photo_1_key, s.photo_2_key, s.extra_photo_keys, s.thumb_keys
       FROM submissions s JOIN groups g ON g.id=s.group_id
      WHERE g.is_official AND s.photos_purged_at IS NULL AND s.status IN ('approved','rejected')
        AND s.reviewed_at < now() - make_interval(days => $1) LIMIT 1000`, [days]);
  if (rolling.length) {
    const ids = rolling.map((s) => s.id);
    report.photos += await deleteObjects(photoKeys(rolling));
    await q(`DELETE FROM feed_comments WHERE submission_id = ANY($1::int[])`, [ids]);
    await q(`UPDATE submissions SET photo_1_key='', photo_2_key=NULL, extra_photo_keys='{}', thumb_keys='{}', photos_purged_at=now() WHERE id = ANY($1::int[])`, [ids]);
    report.rolling = ids.length;
  }

  // 1v1s: the final score was saved on the duel row when it finished.
  const duels = await q(
    `SELECT id FROM duels WHERE purged_at IS NULL AND status IN ('finished','cancelled')
        AND COALESCE(finished_at, end_at, created_at) < now() - make_interval(days => $1) LIMIT 200`, [days]);
  if (duels.length) {
    const ids = duels.map((d) => d.id);
    report.photos += await deleteObjects(photoKeys(await q(`SELECT photo_1_key, photo_2_key, extra_photo_keys, thumb_keys FROM duel_submissions WHERE duel_id = ANY($1::int[])`, [ids])));
    await q(`DELETE FROM duel_submissions WHERE duel_id = ANY($1::int[])`, [ids]);
    await q(`DELETE FROM duel_items WHERE duel_id = ANY($1::int[])`, [ids]);
    await q(`UPDATE duels SET purged_at=now() WHERE id = ANY($1::int[])`, [ids]);
    report.duels = ids.length;
  }

  // Housekeeping
  await q(`DELETE FROM notifications WHERE created_at < now() - interval '30 days'`);
  await q(`DELETE FROM password_resets WHERE expires_at < now() - interval '1 day'`);
  await q(`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`);
  return report;
}
