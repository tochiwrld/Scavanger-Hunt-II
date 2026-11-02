-- Privacy consent records, saved 1v1 score cards, and retention markers.

-- Which privacy notice the user accepted, and when. NULL = must accept before using the app.
ALTER TABLE hunt.users ADD COLUMN privacy_version TEXT, ADD COLUMN privacy_accepted_at TIMESTAMPTZ;

-- Full consent history (each acceptance, with every statement the user ticked).
CREATE TABLE hunt.consents (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  items JSONB NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX consents_user_idx ON hunt.consents (user_id, accepted_at DESC);
ALTER TABLE hunt.consents ENABLE ROW LEVEL SECURITY;

-- 1v1 score card kept after the photos and lists are deleted.
ALTER TABLE hunt.duels
  ADD COLUMN creator_items INT, ADD COLUMN opponent_items INT,
  ADD COLUMN creator_reached_at TIMESTAMPTZ, ADD COLUMN opponent_reached_at TIMESTAMPTZ,
  ADD COLUMN purged_at TIMESTAMPTZ;
ALTER TABLE hunt.challenges ADD COLUMN purged_at TIMESTAMPTZ;

UPDATE hunt.duels d SET
  creator_items = (SELECT count(*) FROM hunt.duel_submissions s WHERE s.duel_id=d.id AND s.user_id=d.creator_id AND s.status='approved'),
  opponent_items = (SELECT count(*) FROM hunt.duel_submissions s WHERE s.duel_id=d.id AND s.user_id=d.opponent_id AND s.status='approved'),
  creator_reached_at = (SELECT max(submitted_at) FROM hunt.duel_submissions s WHERE s.duel_id=d.id AND s.user_id=d.creator_id AND s.status='approved'),
  opponent_reached_at = (SELECT max(submitted_at) FROM hunt.duel_submissions s WHERE s.duel_id=d.id AND s.user_id=d.opponent_id AND s.status='approved')
WHERE d.status='finished';

REVOKE ALL ON ALL TABLES IN SCHEMA hunt FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hunt FROM anon, authenticated;

-- Lock down the photo bucket itself too: private, 2 MB per file, images only.
UPDATE storage.buckets SET public = false, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp'] WHERE id = 'hunt-photos';
