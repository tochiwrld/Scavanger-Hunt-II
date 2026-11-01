-- Group feed: approved submissions are shared with the group, with comments.
-- Submissions made before the feed existed were sent under "only you and the admin see your photos",
-- so they stay out of the feed (in_feed = false). Everything from now on defaults to true.
ALTER TABLE hunt.submissions ADD COLUMN in_feed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hunt.submissions ALTER COLUMN in_feed SET DEFAULT true;
CREATE INDEX submissions_feed_idx ON hunt.submissions (group_id, reviewed_at DESC) WHERE status = 'approved' AND in_feed;

CREATE TABLE hunt.feed_comments (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES hunt.groups(id) ON DELETE CASCADE,
  submission_id INT NOT NULL REFERENCES hunt.submissions(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX feed_comments_sub_idx ON hunt.feed_comments (submission_id, created_at);

ALTER TABLE hunt.feed_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hunt.feed_comments FROM anon, authenticated;
REVOKE ALL ON SEQUENCE hunt.feed_comments_id_seq FROM anon, authenticated;
