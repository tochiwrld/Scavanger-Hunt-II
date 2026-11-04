-- Small copies of each photo (made on the phone, ~400px) for the group feed and 1v1 finds.
-- thumb_keys[i] is the thumbnail of photo i+1, or '' when none was uploaded (the full photo is served instead).
-- Older rows keep the empty default and simply show their full photos.
ALTER TABLE hunt.submissions       ADD COLUMN IF NOT EXISTS thumb_keys text[] NOT NULL DEFAULT '{}';
ALTER TABLE hunt.duel_submissions  ADD COLUMN IF NOT EXISTS thumb_keys text[] NOT NULL DEFAULT '{}';
