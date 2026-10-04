-- Sáng mai giao: scheduled fulfillment on the existing STANDARD market order.
-- Does not alter breakfast, lunch, or family-dinner window tables.
--
-- Customer cancel before READY is a temporary service rule, not a schema policy.
-- A later scheduled-order cancellation cutoff can read scheduled_delivery_window_id
-- plus scheduled_fulfillment_settings without another migration.

CREATE TABLE IF NOT EXISTS scheduled_delivery_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE CASCADE,
  service_date date NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  capacity integer,
  remaining_capacity integer,
  purpose text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_windows_purpose_check CHECK (purpose IN ('MARKET_MORNING')),
  CONSTRAINT scheduled_windows_status_check CHECK (status IN ('OPEN', 'CLOSED')),
  CONSTRAINT scheduled_windows_slot_uidx UNIQUE (provider_location_id, service_date, purpose, starts_at, ends_at)
);

CREATE INDEX IF NOT EXISTS scheduled_windows_location_date_idx
  ON scheduled_delivery_windows (provider_location_id, service_date, purpose);

CREATE TABLE IF NOT EXISTS scheduled_fulfillment_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE CASCADE,
  purpose text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  cutoff_time time NOT NULL,
  prepare_lead_minutes integer NOT NULL,
  slots jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scheduled_fulfillment_purpose_check CHECK (purpose IN ('MARKET_MORNING')),
  CONSTRAINT scheduled_fulfillment_lead_check CHECK (prepare_lead_minutes >= 0 AND prepare_lead_minutes <= 240),
  CONSTRAINT scheduled_fulfillment_location_purpose_uidx UNIQUE (provider_location_id, purpose)
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS scheduled_delivery_window_id uuid
  REFERENCES scheduled_delivery_windows (id) ON DELETE SET NULL;

COMMENT ON COLUMN orders.scheduled_delivery_window_id IS
  'Generic scheduled slot. V1 purpose is MARKET_MORNING. Cancel-before-READY is temporary service logic; a later cutoff uses this column and location settings, not a new column.';
