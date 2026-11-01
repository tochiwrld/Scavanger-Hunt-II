-- Submissions need at least one photo and can have up to four (group hunts and 1v1s).
-- photo_1_key stays required; photo_2_key becomes optional; photos 3-4 go in extra_photo_keys.
ALTER TABLE hunt.submissions ALTER COLUMN photo_2_key DROP NOT NULL;
ALTER TABLE hunt.submissions ADD COLUMN extra_photo_keys TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE hunt.duel_submissions ALTER COLUMN photo_2_key DROP NOT NULL;
ALTER TABLE hunt.duel_submissions ADD COLUMN extra_photo_keys TEXT[] NOT NULL DEFAULT '{}';
