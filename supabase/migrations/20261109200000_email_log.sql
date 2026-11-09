-- One row per person per game email (kind + challenge id), so a retry never sends anyone the same email twice.
CREATE TABLE IF NOT EXISTS hunt.email_log (
  user_id int NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref int NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, ref)
);
ALTER TABLE hunt.email_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hunt.email_log FROM anon, authenticated;
-- Steps marked "done" before launch get an old date, so the 3-day retry window never reopens them.
UPDATE hunt.challenges SET drop_emailed_at='2000-01-01' WHERE drop_emailed_at < '2026-11-09 18:10+00';
UPDATE hunt.challenges SET mid_emailed_at='2000-01-01' WHERE mid_emailed_at < '2026-11-09 18:10+00';
UPDATE hunt.challenges SET last_emailed_at='2000-01-01' WHERE last_emailed_at < '2026-11-09 18:10+00';
UPDATE hunt.challenges SET results_emailed_at='2000-01-01' WHERE results_emailed_at < '2026-11-09 18:10+00';
