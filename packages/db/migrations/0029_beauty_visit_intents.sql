-- S31+: Beauty visit intents — khách báo sắp tới (không đặt lịch)

CREATE TABLE IF NOT EXISTS beauty_visit_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE RESTRICT,
  offering_id uuid REFERENCES offerings (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  eta_minutes integer NOT NULL,
  expected_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT beauty_visit_intents_status_check CHECK (
    status IN ('ACTIVE', 'ARRIVED', 'CANCELLED', 'EXPIRED')
  ),
  CONSTRAINT beauty_visit_intents_eta_check CHECK (
    eta_minutes > 0 AND eta_minutes <= 240
  )
);

CREATE INDEX IF NOT EXISTS beauty_visit_intents_location_active_idx
  ON beauty_visit_intents (provider_location_id, status, expected_at);

CREATE INDEX IF NOT EXISTS beauty_visit_intents_customer_location_idx
  ON beauty_visit_intents (customer_user_id, provider_location_id, status);
