-- Official hunts (PRIMAHUNT OFFICIAL): no cash prize, one long challenge (about a year), admins may add items after publishing,
-- and photos are deleted 7 days after review instead of 7 days after the challenge ends.
ALTER TABLE hunt.groups            ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false;
ALTER TABLE hunt.submissions       ADD COLUMN IF NOT EXISTS photos_purged_at timestamptz;
ALTER TABLE hunt.duel_submissions  ADD COLUMN IF NOT EXISTS photos_purged_at timestamptz;

UPDATE hunt.groups SET is_official = true WHERE id = 11 AND name = 'PRIMAHUNT OFFICIAL';
UPDATE hunt.challenges SET prize_amount = 0, end_at = '2027-11-01 23:59:59+01',
       title = 'PrimaHunt: Nigerian finds'
 WHERE group_id = 11 AND status = 'draft';
