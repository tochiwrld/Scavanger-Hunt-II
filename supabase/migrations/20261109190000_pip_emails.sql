-- Pip's weekly emails: each one goes out once per challenge (claimed atomically by the cron).
ALTER TABLE hunt.challenges ADD COLUMN IF NOT EXISTS drop_emailed_at timestamptz;
ALTER TABLE hunt.challenges ADD COLUMN IF NOT EXISTS mid_emailed_at timestamptz;
ALTER TABLE hunt.challenges ADD COLUMN IF NOT EXISTS last_emailed_at timestamptz;
ALTER TABLE hunt.challenges ADD COLUMN IF NOT EXISTS results_emailed_at timestamptz;
-- Win-back: 0 = none sent, 1 = 30-day sent, 2 = 60-day sent. Reset when the player comes back.
ALTER TABLE hunt.users ADD COLUMN IF NOT EXISTS winback_stage int NOT NULL DEFAULT 0;
-- Don't email about the past: mark older weeks as already handled.
UPDATE hunt.challenges SET drop_emailed_at = now() WHERE start_at < now() - interval '1 day';
UPDATE hunt.challenges SET mid_emailed_at = now() WHERE start_at + (end_at - start_at) * 0.45 < now() - interval '1 day' OR end_at < now();
UPDATE hunt.challenges SET last_emailed_at = now() WHERE end_at < now() + interval '2 hours';
UPDATE hunt.challenges SET results_emailed_at = now() WHERE end_at < now() - interval '2 days';
-- PRIMAHUNT OFFICIAL now sends Pip's weekly emails too (players can switch them off in Profile).
UPDATE hunt.groups SET settings = COALESCE(settings, '{}'::jsonb) || '{"email_enabled": true}'::jsonb WHERE is_official;
