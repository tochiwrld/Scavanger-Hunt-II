-- 1v1 duels (private one-person links) and Global Search (public groups anyone can join).

-- Global Search: an admin can list a group publicly. Anyone can then find it and join without an invite.
ALTER TABLE hunt.groups ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX groups_public_idx ON hunt.groups (is_public) WHERE is_public;

-- A 1v1: the creator shares /vs/<token>. The first person to accept becomes the opponent and the link is
-- locked to the two of them. Each writes `item_count` items for the other to find, then taps Done.
-- The timer (duration_minutes) starts only once both lists are done.
CREATE TABLE hunt.duels (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  creator_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  opponent_id INT REFERENCES hunt.users(id) ON DELETE CASCADE,
  duration_minutes INT NOT NULL,
  item_count INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',        -- waiting | setup | live | finished | cancelled
  creator_ready BOOLEAN NOT NULL DEFAULT false,
  opponent_ready BOOLEAN NOT NULL DEFAULT false,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  winner_id INT REFERENCES hunt.users(id) ON DELETE SET NULL,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX duels_creator_idx ON hunt.duels (creator_id, created_at DESC);
CREATE INDEX duels_opponent_idx ON hunt.duels (opponent_id, created_at DESC);

-- Items a player sets for their opponent to find.
CREATE TABLE hunt.duel_items (
  id SERIAL PRIMARY KEY,
  duel_id INT NOT NULL REFERENCES hunt.duels(id) ON DELETE CASCADE,
  setter_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  display_order INT NOT NULL DEFAULT 0
);
CREATE INDEX duel_items_duel_idx ON hunt.duel_items (duel_id, setter_id);

-- Photos the hunter sends; the item's setter approves or rejects.
CREATE TABLE hunt.duel_submissions (
  id SERIAL PRIMARY KEY,
  duel_id INT NOT NULL REFERENCES hunt.duels(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES hunt.duel_items(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  photo_1_key TEXT NOT NULL,
  photo_2_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | approved | rejected
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT
);
CREATE UNIQUE INDEX duel_submissions_one_active_uq ON hunt.duel_submissions (user_id, item_id) WHERE status IN ('pending','approved');
CREATE INDEX duel_submissions_duel_idx ON hunt.duel_submissions (duel_id, status);

ALTER TABLE hunt.duels ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.duel_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.duel_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hunt FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hunt FROM anon, authenticated;
