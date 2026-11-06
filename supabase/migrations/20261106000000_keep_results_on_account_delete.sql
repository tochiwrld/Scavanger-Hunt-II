-- Deleting an account now anonymises it ("Deleted player") instead of removing the row,
-- so other players' results, prizes and 1v1 wins survive.
DROP INDEX IF EXISTS hunt.users_nickname_uq;
CREATE UNIQUE INDEX users_nickname_uq ON hunt.users (lower(nickname)) WHERE status <> 'deleted';
-- A hunt whose founder deleted their account (and had no co-admin): results stay readable, no new finds or joins.
ALTER TABLE hunt.groups ADD COLUMN IF NOT EXISTS admin_left_at TIMESTAMPTZ;
