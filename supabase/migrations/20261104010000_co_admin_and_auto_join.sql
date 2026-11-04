-- Co-admins: group_members.role can now be 'owner' | 'admin' | 'player'. One 'admin' per hunt (enforced here and in lib/router.js).
CREATE UNIQUE INDEX IF NOT EXISTS group_members_one_co_admin ON hunt.group_members (group_id) WHERE role = 'admin' AND status = 'active';

-- Hunts every account joins automatically on sign-up (PRIMAHUNT OFFICIAL). Set by the site owner directly in the database.
ALTER TABLE hunt.groups ADD COLUMN IF NOT EXISTS auto_join boolean NOT NULL DEFAULT false;
