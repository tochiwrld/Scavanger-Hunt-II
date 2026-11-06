-- End-of-week stat recaps, lead-change tracking and "Hunter of the week" (PRIMAHUNT OFFICIAL winner).
CREATE TABLE IF NOT EXISTS hunt.week_recaps (
  challenge_id INT PRIMARY KEY REFERENCES hunt.challenges(id) ON DELETE CASCADE,
  group_id INT NOT NULL REFERENCES hunt.groups(id) ON DELETE CASCADE,
  data JSONB NOT NULL,          -- user ids only; nicknames are resolved when read ("Deleted player" stays anonymous)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE hunt.week_recaps ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS hunt.hunter_awards (
  challenge_id INT PRIMARY KEY REFERENCES hunt.challenges(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  week_number INT,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hunter_awards_user_idx ON hunt.hunter_awards (user_id);
ALTER TABLE hunt.hunter_awards ENABLE ROW LEVEL SECURITY;

-- Who is on top right now, so a change of leader can be announced once.
ALTER TABLE hunt.challenges ADD COLUMN IF NOT EXISTS leader_user_id INT;

REVOKE ALL ON hunt.week_recaps, hunt.hunter_awards FROM anon, authenticated;
