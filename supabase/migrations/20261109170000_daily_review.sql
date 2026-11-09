-- Daily hunt finds are reviewed by the PRIMAHUNT OFFICIAL admin before they count toward a streak.
ALTER TABLE hunt.daily_finds ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected'));
ALTER TABLE hunt.daily_finds ADD COLUMN IF NOT EXISTS reviewed_by int REFERENCES hunt.users(id) ON DELETE SET NULL;
ALTER TABLE hunt.daily_finds ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE hunt.daily_finds ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE hunt.daily_finds ALTER COLUMN status SET DEFAULT 'pending';
-- A rejected find can be retried the same day: one live (pending/approved) find per player per day.
ALTER TABLE hunt.daily_finds DROP CONSTRAINT IF EXISTS daily_finds_user_id_day_key;
CREATE UNIQUE INDEX IF NOT EXISTS daily_finds_live_uq ON hunt.daily_finds (user_id, day) WHERE status <> 'rejected';
CREATE INDEX IF NOT EXISTS daily_finds_pending_idx ON hunt.daily_finds (created_at) WHERE status = 'pending';
