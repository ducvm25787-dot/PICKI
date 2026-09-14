-- Sprint 21: Runner foundation

CREATE TABLE IF NOT EXISTS runners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runners_status_check CHECK (status IN ('ACTIVE', 'PAUSED', 'SUSPENDED'))
);

CREATE TABLE IF NOT EXISTS runner_presence (
  runner_id uuid PRIMARY KEY REFERENCES runners (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'OFFLINE',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runner_presence_status_check CHECK (
    status IN ('OFFLINE', 'AVAILABLE', 'PICKING_UP', 'DELIVERING')
  )
);

CREATE INDEX IF NOT EXISTS runners_zone_id_idx ON runners (zone_id);
