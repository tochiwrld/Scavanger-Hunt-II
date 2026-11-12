-- Star hunt: stars placed at real spots in Lagos by the PrimaHunt admin; players catch them on the spot with the camera.
CREATE TABLE IF NOT EXISTS hunt.stars (
  id serial PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  area text NOT NULL DEFAULT '' CHECK (char_length(area) <= 40),
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lon double precision NOT NULL CHECK (lon BETWEEN -180 AND 180),
  pips int NOT NULL DEFAULT 20 CHECK (pips IN (20, 30, 50)),
  radius_m int NOT NULL DEFAULT 30 CHECK (radius_m BETWEEN 15 AND 150),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_by int REFERENCES hunt.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  pushed_at timestamptz
);
-- One catch per player per star. Only the distance is kept, never the player's location.
CREATE TABLE IF NOT EXISTS hunt.star_catches (
  user_id int NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  star_id int NOT NULL REFERENCES hunt.stars(id) ON DELETE CASCADE,
  pips int NOT NULL,
  distance_m int NOT NULL,
  caught_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, star_id)
);
CREATE INDEX IF NOT EXISTS star_catches_user_idx ON hunt.star_catches (user_id, caught_at DESC);
-- Web push: one row per phone/browser that said yes to notifications.
CREATE TABLE IF NOT EXISTS hunt.push_subscriptions (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES hunt.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_ok_at timestamptz
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON hunt.push_subscriptions (user_id);
ALTER TABLE hunt.stars ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.star_catches ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunt.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hunt.stars, hunt.star_catches, hunt.push_subscriptions FROM anon, authenticated;
-- First stars, placed by the PrimaHunt admin account (positions approximate; the admin can move or remove them).
INSERT INTO hunt.stars (name, area, lat, lon, pips, created_by, pushed_at)
SELECT v.name, v.area, v.lat, v.lon, v.pips, (SELECT owner_user_id FROM hunt.groups WHERE is_official LIMIT 1), now()
FROM (VALUES
  ('Freedom Park', 'Lagos Island', 6.4497, 3.3962, 20),
  ('Tafawa Balewa Square', 'Lagos Island', 6.4462, 3.4012, 20),
  ('Balogun Market', 'Lagos Island', 6.4583, 3.3878, 20),
  ('National Theatre', 'Iganmu', 6.4746, 3.3700, 30),
  ('Lekki–Ikoyi Link Bridge', 'Ikoyi', 6.4456, 3.4316, 30),
  ('Lekki Conservation Centre', 'Lekki', 6.4419, 3.5355, 50),
  ('Eko Atlantic', 'Victoria Island', 6.4180, 3.4110, 30),
  ('UNILAG Lagoon Front', 'Akoka', 6.5158, 3.3897, 20),
  ('Tejuosho Market', 'Yaba', 6.5030, 3.3690, 20),
  ('Teslim Balogun Stadium', 'Surulere', 6.4993, 3.3631, 20),
  ('Computer Village', 'Ikeja', 6.5965, 3.3426, 20),
  ('Ikeja City Mall', 'Alausa', 6.6142, 3.3577, 20),
  ('Muri Okunola Park', 'Victoria Island', 6.4302, 3.4228, 50)
) AS v(name, area, lat, lon, pips)
WHERE NOT EXISTS (SELECT 1 FROM hunt.stars);
