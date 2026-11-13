-- Push alerts for normal hunt games, with per-person choices.
ALTER TABLE hunt.users ADD COLUMN IF NOT EXISTS push_stars boolean NOT NULL DEFAULT true;
ALTER TABLE hunt.users ADD COLUMN IF NOT EXISTS push_games boolean NOT NULL DEFAULT true;
