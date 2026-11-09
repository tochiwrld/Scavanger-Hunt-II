-- A row is reserved (sent_at NULL) right before sending and stamped when the email actually went.
ALTER TABLE hunt.email_log ADD COLUMN IF NOT EXISTS reserved_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE hunt.email_log ALTER COLUMN sent_at DROP NOT NULL;
ALTER TABLE hunt.email_log ALTER COLUMN sent_at DROP DEFAULT;
