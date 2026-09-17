-- S43 Góc ăn khuya / Bán khuya (ADR-048)

CREATE TABLE IF NOT EXISTS late_night_provider_settings (
  provider_location_id uuid PRIMARY KEY
    REFERENCES provider_locations (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  starts_at time NOT NULL DEFAULT '20:30',
  ends_at time NOT NULL DEFAULT '02:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
