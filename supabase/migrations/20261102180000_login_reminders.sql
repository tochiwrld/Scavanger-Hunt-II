-- Reminder emails for players who haven't opened the app in a while.
-- Existing users start "seen now" so nobody gets an email the moment this ships.
ALTER TABLE hunt.users
  ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN last_nudge_at TIMESTAMPTZ,
  ADD COLUMN nudge_count INT NOT NULL DEFAULT 0,
  ADD COLUMN email_reminders BOOLEAN NOT NULL DEFAULT true;
CREATE INDEX users_last_seen_idx ON hunt.users (last_seen_at) WHERE email_reminders;
