-- Team vs: each captain names their team (falls back to "Team A"/"Team B").
ALTER TABLE hunt.team_matches ADD COLUMN IF NOT EXISTS a_name text CHECK (a_name IS NULL OR char_length(a_name) BETWEEN 2 AND 24);
ALTER TABLE hunt.team_matches ADD COLUMN IF NOT EXISTS b_name text CHECK (b_name IS NULL OR char_length(b_name) BETWEEN 2 AND 24);
