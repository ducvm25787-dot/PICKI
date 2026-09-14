-- Sprint 22: Fulfillment + Route (multi-stop, not 1 order = 1 route)

CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders (id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deliveries_status_check CHECK (
    status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
  )
);

CREATE TABLE IF NOT EXISTS delivery_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  runner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'PLANNED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_routes_status_check CHECK (
    status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
  )
);

CREATE TABLE IF NOT EXISTS route_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES delivery_routes (id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  delivery_id uuid NOT NULL REFERENCES deliveries (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_orders_route_order_unique UNIQUE (route_id, order_id),
  CONSTRAINT route_orders_order_unique UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL REFERENCES delivery_routes (id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  stop_type text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  order_id uuid REFERENCES orders (id) ON DELETE SET NULL,
  provider_location_id uuid REFERENCES provider_locations (id) ON DELETE SET NULL,
  building text,
  floor text,
  apartment text,
  lat double precision,
  lng double precision,
  label text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT route_stops_type_check CHECK (
    stop_type IN ('PICKUP', 'LOBBY_DROPOFF', 'APARTMENT_DROPOFF', 'PICKI_POINT')
  ),
  CONSTRAINT route_stops_status_check CHECK (
    status IN ('PENDING', 'ARRIVED', 'COMPLETED', 'SKIPPED')
  ),
  CONSTRAINT route_stops_route_sequence_unique UNIQUE (route_id, sequence)
);

CREATE INDEX IF NOT EXISTS deliveries_zone_id_idx ON deliveries (zone_id);
CREATE INDEX IF NOT EXISTS delivery_routes_runner_user_id_idx ON delivery_routes (runner_user_id);
CREATE INDEX IF NOT EXISTS delivery_routes_zone_id_idx ON delivery_routes (zone_id);
CREATE INDEX IF NOT EXISTS route_orders_route_id_idx ON route_orders (route_id);
CREATE INDEX IF NOT EXISTS route_stops_route_id_idx ON route_stops (route_id);
