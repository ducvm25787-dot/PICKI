-- Sprint 19: Orders + state history (Food MVP foundation)

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'CREATED',
  payment_mode text NOT NULL DEFAULT 'COD',
  subtotal_vnd integer NOT NULL CHECK (subtotal_vnd >= 0),
  delivery_fee_vnd integer NOT NULL DEFAULT 0 CHECK (delivery_fee_vnd >= 0),
  total_vnd integer NOT NULL CHECK (total_vnd >= 0),
  delivery_building text,
  delivery_floor text,
  delivery_apartment text,
  delivery_note text,
  delivery_lat double precision,
  delivery_lng double precision,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_status_check CHECK (
    status IN (
      'CREATED',
      'PAYMENT_PENDING',
      'PAID',
      'PROVIDER_ACCEPTED',
      'PREPARING',
      'READY',
      'RUNNER_ASSIGNED',
      'PICKED_UP',
      'DELIVERING',
      'DELIVERED',
      'PROVIDER_REJECTED',
      'CUSTOMER_CANCELLED',
      'SYSTEM_CANCELLED',
      'PAYMENT_FAILED',
      'REFUND_PENDING',
      'REFUNDED'
    )
  ),
  CONSTRAINT orders_payment_mode_check CHECK (
    payment_mode IN (
      'PAY_ON_PICKI',
      'PAY_PROVIDER_DIRECTLY',
      'PAY_ON_COMPLETION',
      'COD',
      'NO_PAYMENT'
    )
  )
);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  offering_id uuid REFERENCES offerings (id) ON DELETE SET NULL,
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  unit_price_vnd integer NOT NULL CHECK (unit_price_vnd >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total_vnd integer NOT NULL CHECK (line_total_vnd >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_customer_user_id_idx ON orders (customer_user_id);
CREATE INDEX IF NOT EXISTS orders_zone_id_idx ON orders (zone_id);
CREATE INDEX IF NOT EXISTS orders_provider_location_id_idx ON orders (provider_location_id);
CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx ON order_status_history (order_id);
