ALTER TABLE provider_locations
  ADD COLUMN IF NOT EXISTS opens_at timestamptz;

CREATE TABLE IF NOT EXISTS opening_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE CASCADE,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opening_reminders_user_location_uidx UNIQUE (user_id, provider_location_id)
);

CREATE TABLE IF NOT EXISTS provider_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  detail text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  spotlight boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_promotions_zone_window_idx
  ON provider_promotions (zone_id, starts_at, ends_at);
