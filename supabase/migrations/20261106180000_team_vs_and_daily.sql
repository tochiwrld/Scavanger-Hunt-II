-- Team vs (2v2, 3v3, ...) and the daily hunt.

-- A team match. The creator captains team A and shares /t/<rival_token> with the rival captain (first to accept takes it).
-- Each team then has its own teammate link (/t/<a_token>, /t/<b_token>). One account can only be in one team per match.
-- Each team writes item_count items for the other team; the timer starts when both captains tap Done.
CREATE TABLE hunt.team_matches (
  id SERIAL PRIMARY KEY,
  rival_token TEXT NOT NULL UNIQUE,
  a_token TEXT NOT NULL UNIQUE,
  b_token TEXT NOT NULL UNIQUE,
  creator_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  team_size INT NOT NULL CHECK (team_size BETWEEN 2 AND 6),
  duration_minutes INT NOT NULL,
  item_count INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',        -- waiting | setup | live | finished | cancelled
  a_ready BOOLEAN NOT NULL DEFAULT false,
  b_ready BOOLEAN NOT NULL DEFAULT false,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  winner_side TEXT,                              -- 'a' | 'b' | NULL (tie / no finds)
  a_items INT, b_items INT, a_reached_at TIMESTAMPTZ, b_reached_at TIMESTAMPTZ,   -- saved score card
  finished_at TIMESTAMPTZ,
  purged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE hunt.team_members (
  match_id INT NOT NULL REFERENCES hunt.team_matches(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('a','b')),
  is_captain BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, user_id)               -- one account, one team, per match
);
CREATE UNIQUE INDEX team_members_one_captain ON hunt.team_members (match_id, side) WHERE is_captain;
CREATE INDEX team_members_user_idx ON hunt.team_members (user_id);

-- Items a team writes for the other team (setter_side) to hunt.
CREATE TABLE hunt.team_items (
  id SERIAL PRIMARY KEY,
  match_id INT NOT NULL REFERENCES hunt.team_matches(id) ON DELETE CASCADE,
  setter_side TEXT NOT NULL CHECK (setter_side IN ('a','b')),
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  display_order INT NOT NULL DEFAULT 0,
  created_by INT REFERENCES hunt.users(id) ON DELETE SET NULL
);
CREATE INDEX team_items_match_idx ON hunt.team_items (match_id, setter_side);

CREATE TABLE hunt.team_submissions (
  id SERIAL PRIMARY KEY,
  match_id INT NOT NULL REFERENCES hunt.team_matches(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES hunt.team_items(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('a','b')),  -- the hunting team
  photo_1_key TEXT NOT NULL,
  photo_2_key TEXT,
  extra_photo_keys TEXT[] NOT NULL DEFAULT '{}',
  thumb_keys TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | approved | rejected
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by INT REFERENCES hunt.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  photos_purged_at TIMESTAMPTZ
);
-- Each item counts once per team: one pending or approved submission at a time.
CREATE UNIQUE INDEX team_submissions_one_active_uq ON hunt.team_submissions (item_id) WHERE status IN ('pending','approved');
CREATE INDEX team_submissions_match_idx ON hunt.team_submissions (match_id, status);

-- Daily hunt: one item a day for everyone (same item, Lagos calendar day). A live camera photo counts straight away.
-- Rows are kept for streaks; the photos are deleted after 7 days and are only ever visible to their owner.
CREATE TABLE hunt.daily_finds (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  item_index INT NOT NULL,
  photo_1_key TEXT NOT NULL DEFAULT '',
  photo_2_key TEXT,
  extra_photo_keys TEXT[] NOT NULL DEFAULT '{}',
  thumb_keys TEXT[] NOT NULL DEFAULT '{}',
  photos_purged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, day)
);

ALTER TABLE hunt.team_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.team_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.team_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.daily_finds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hunt FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hunt FROM anon, authenticated;
