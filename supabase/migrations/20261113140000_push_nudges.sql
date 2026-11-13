-- Come-back push nudges at 5 h, 10 h and 1 day away (reset when the player opens the app),
-- and a small outbox for one-off pushes (tests, announcements) sent by the cron.
ALTER TABLE hunt.users ADD COLUMN IF NOT EXISTS push_nudge_stage smallint NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS hunt.push_outbox (
  id serial PRIMARY KEY,
  user_id int REFERENCES hunt.users(id) ON DELETE CASCADE, -- NULL = everyone with alerts
  title text NOT NULL,
  body text NOT NULL,
  url text NOT NULL DEFAULT '/',
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  phones int
);
ALTER TABLE hunt.push_outbox ENABLE ROW LEVEL SECURITY;
