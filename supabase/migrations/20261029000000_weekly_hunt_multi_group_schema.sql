-- Weekly Hunt: multi-group schema, kept in its own `hunt` schema so it never touches other objects.
CREATE SCHEMA IF NOT EXISTS hunt;


CREATE TABLE hunt.users (
  id SERIAL PRIMARY KEY,
  nickname TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  can_create_groups BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_nickname_uq ON hunt.users (lower(nickname));
CREATE UNIQUE INDEX users_email_uq ON hunt.users (lower(email));

CREATE TABLE hunt.groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_key TEXT,
  owner_user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  invite_token TEXT NOT NULL UNIQUE,
  invite_active BOOLEAN NOT NULL DEFAULT true,
  invite_expires_at TIMESTAMPTZ,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX groups_owner_idx ON hunt.groups (owner_user_id);

CREATE TABLE hunt.group_members (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES hunt.groups(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'player',          -- 'owner' | 'player'
  status TEXT NOT NULL DEFAULT 'active',        -- 'active' | 'left' | 'removed'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX group_members_user_idx ON hunt.group_members (user_id);

CREATE TABLE hunt.challenges (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES hunt.groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rules TEXT NOT NULL DEFAULT '',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  prize_amount INT NOT NULL DEFAULT 3000,
  status TEXT NOT NULL DEFAULT 'draft',          -- draft | published | archived
  week_number INT,
  published_at TIMESTAMPTZ,
  start_notified BOOLEAN NOT NULL DEFAULT false,
  end_notified BOOLEAN NOT NULL DEFAULT false,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX challenges_group_idx ON hunt.challenges (group_id, start_at DESC);

CREATE TABLE hunt.challenge_items (
  id SERIAL PRIMARY KEY,
  challenge_id INT NOT NULL REFERENCES hunt.challenges(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'easy',
  points INT NOT NULL,
  hint TEXT,
  reference_image_key TEXT,
  display_order INT NOT NULL DEFAULT 0
);
CREATE INDEX items_challenge_idx ON hunt.challenge_items (challenge_id);

CREATE TABLE hunt.submissions (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES hunt.groups(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES hunt.challenge_items(id) ON DELETE CASCADE,
  photo_1_key TEXT NOT NULL,
  photo_2_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  reviewed_by INT REFERENCES hunt.users(id) ON DELETE SET NULL
);
-- one pending-or-approved submission per player per item: blocks duplicates and double approvals
CREATE UNIQUE INDEX submissions_one_active_uq ON hunt.submissions (user_id, item_id) WHERE status IN ('pending','approved');
CREATE INDEX submissions_group_status_idx ON hunt.submissions (group_id, status, submitted_at);

CREATE TABLE hunt.point_transactions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  group_id INT NOT NULL REFERENCES hunt.groups(id) ON DELETE CASCADE,
  challenge_id INT NOT NULL REFERENCES hunt.challenges(id) ON DELETE CASCADE,
  item_id INT REFERENCES hunt.challenge_items(id) ON DELETE SET NULL,
  submission_id INT,
  points INT NOT NULL,
  transaction_type TEXT NOT NULL,
  reason TEXT,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- a player is paid once, ever, per item
CREATE UNIQUE INDEX points_once_per_item_uq ON hunt.point_transactions (user_id, item_id) WHERE transaction_type = 'approval';
CREATE INDEX points_challenge_idx ON hunt.point_transactions (challenge_id, user_id);

CREATE TABLE hunt.weekly_results (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES hunt.groups(id) ON DELETE CASCADE,
  challenge_id INT NOT NULL REFERENCES hunt.challenges(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  final_points INT NOT NULL,
  final_rank INT NOT NULL,
  reached_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);

CREATE TABLE hunt.prizes (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES hunt.groups(id) ON DELETE CASCADE,
  challenge_id INT NOT NULL UNIQUE REFERENCES hunt.challenges(id) ON DELETE CASCADE,
  winner_user_id INT REFERENCES hunt.users(id) ON DELETE SET NULL,
  amount INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',        -- pending | paid
  paid_at TIMESTAMPTZ,
  payout_note TEXT
);

CREATE TABLE hunt.notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  group_id INT REFERENCES hunt.groups(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON hunt.notifications (user_id, created_at DESC);

CREATE TABLE hunt.audit_logs (
  id SERIAL PRIMARY KEY,
  admin_user_id INT REFERENCES hunt.users(id) ON DELETE SET NULL,
  group_id INT REFERENCES hunt.groups(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_group_idx ON hunt.audit_logs (group_id, created_at DESC);

CREATE TABLE hunt.password_resets (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE hunt.rate_limits (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INT NOT NULL DEFAULT 0
);

-- Lock the tables down: only the server (database owner role) may read/write. The public Data API roles get nothing.
ALTER TABLE hunt.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.challenge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.weekly_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA hunt FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA hunt FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA hunt FROM anon, authenticated;
