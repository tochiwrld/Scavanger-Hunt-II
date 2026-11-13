-- "Add PrimaHunt to your home screen": when the app was first opened from the home screen,
-- and one-off bonus pips (install bonus: +30 on the first approved find after installing). Bonus pips count on the global board only.
ALTER TABLE hunt.users ADD COLUMN IF NOT EXISTS installed_at timestamptz;
CREATE TABLE IF NOT EXISTS hunt.pip_bonuses (
  user_id int NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  pips int NOT NULL CHECK (pips > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE hunt.pip_bonuses ENABLE ROW LEVEL SECURITY;
