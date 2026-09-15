-- S30: Home Services — service requests + PROVIDER_VISIT offerings

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_fulfillment_mode_check;
ALTER TABLE offerings ADD CONSTRAINT offerings_fulfillment_mode_check CHECK (
  fulfillment_mode IS NULL OR fulfillment_mode IN (
    'INSTANT', 'PREORDER', 'PICKUP', 'PICKUP_AND_RETURN', 'ON_SITE', 'PROVIDER_VISIT'
  )
);

CREATE TABLE IF NOT EXISTS service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE,
  customer_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE RESTRICT,
  offering_id uuid REFERENCES offerings (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'OPEN',
  customer_note text,
  provider_note text,
  preferred_at timestamptz,
  delivery_building text,
  delivery_apartment text,
  delivery_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_requests_status_check CHECK (
    status IN (
      'OPEN',
      'CONFIRMED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'PROVIDER_REJECTED'
    )
  )
);

CREATE INDEX IF NOT EXISTS service_requests_customer_idx
  ON service_requests (customer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_location_idx
  ON service_requests (provider_location_id, status, created_at DESC);
