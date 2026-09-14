-- Sprint 23: Batching config, Picki Points, lobby bulk handoff

CREATE TABLE IF NOT EXISTS zone_fulfillment_settings (
  zone_id uuid PRIMARY KEY REFERENCES zones (id) ON DELETE CASCADE,
  batch_wait_window_minutes integer NOT NULL DEFAULT 5 CHECK (batch_wait_window_minutes >= 0),
  max_batch_orders integer NOT NULL DEFAULT 3 CHECK (max_batch_orders > 0),
  max_route_detour_meters integer NOT NULL DEFAULT 500 CHECK (max_route_detour_meters >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS picki_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  building text NOT NULL,
  name text NOT NULL,
  point_type text NOT NULL DEFAULT 'LOBBY',
  lat double precision,
  lng double precision,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT picki_points_type_check CHECK (
    point_type IN ('LOBBY', 'DESK', 'LOCKER', 'COLLECTION_POINT', 'PARTNER_STORE')
  ),
  CONSTRAINT picki_points_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS picki_points_zone_building_type_idx
  ON picki_points (zone_id, building, point_type)
  WHERE status = 'ACTIVE';

ALTER TABLE route_stops
  ADD COLUMN IF NOT EXISTS picki_point_id uuid REFERENCES picki_points (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz;

CREATE TABLE IF NOT EXISTS lobby_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_stop_id uuid NOT NULL REFERENCES route_stops (id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  picki_point_id uuid REFERENCES picki_points (id) ON DELETE SET NULL,
  customer_status text NOT NULL DEFAULT 'WAITING',
  runner_arrived_at timestamptz,
  customer_updated_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lobby_handoffs_customer_status_check CHECK (
    customer_status IN ('WAITING', 'COMING_DOWN', 'RECEIVED', 'NO_RESPONSE')
  ),
  CONSTRAINT lobby_handoffs_stop_order_unique UNIQUE (route_stop_id, order_id)
);

CREATE INDEX IF NOT EXISTS lobby_handoffs_order_id_idx ON lobby_handoffs (order_id);
CREATE INDEX IF NOT EXISTS picki_points_zone_id_idx ON picki_points (zone_id);
