-- P6 taxonomy. A market cluster is a logistics grouping, not a building kind.
-- zone_places.kind stays the P4.5 access class. MARKET_MORNING tables are untouched.
-- Zone match (cluster, basket, location membership) is enforced in the server, not by a cross-table FK.
-- One location has at most one market_cluster_id. That column is the invariant.

CREATE TABLE IF NOT EXISTS market_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  cluster_format text NOT NULL,
  origin_zone_place_id uuid REFERENCES zone_places (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT',
  preorder_order_cutoff time NOT NULL DEFAULT '22:00',
  preorder_session_grace_end time NOT NULL DEFAULT '22:15',
  preorder_hard_close time NOT NULL DEFAULT '22:15',
  customer_cancel_cutoff time NOT NULL DEFAULT '23:00',
  last_on_demand_order_at time NOT NULL DEFAULT '10:00',
  delivery_service_end time NOT NULL DEFAULT '11:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_clusters_zone_slug_uidx UNIQUE (zone_id, slug),
  CONSTRAINT market_clusters_format_check CHECK (
    cluster_format IN ('TRADITIONAL_MARKET', 'KIOSK_CLUSTER', 'RESIDENTIAL_MARKET', 'OTHER')
  ),
  CONSTRAINT market_clusters_status_check CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  CONSTRAINT market_clusters_active_origin_check CHECK (
    status <> 'ACTIVE' OR origin_zone_place_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS market_clusters_zone_status_idx
  ON market_clusters (zone_id, status);

CREATE TABLE IF NOT EXISTS market_baskets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  market_cluster_id uuid NOT NULL REFERENCES market_clusters (id) ON DELETE RESTRICT,
  commerce_context text NOT NULL DEFAULT 'MARKET_TRIP',
  service_date date NOT NULL,
  ordering_mode text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_baskets_context_check CHECK (commerce_context = 'MARKET_TRIP'),
  CONSTRAINT market_baskets_mode_check CHECK (ordering_mode IN ('PREORDER', 'ON_DEMAND'))
);

CREATE INDEX IF NOT EXISTS market_baskets_customer_date_idx
  ON market_baskets (customer_user_id, service_date);

ALTER TABLE provider_locations
  ADD COLUMN IF NOT EXISTS market_cluster_id uuid REFERENCES market_clusters (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS stall_code text,
  ADD COLUMN IF NOT EXISTS seller_portrait_url text,
  ADD COLUMN IF NOT EXISTS stall_image_url text,
  ADD COLUMN IF NOT EXISTS on_demand_market_enabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS provider_locations_market_cluster_idx
  ON provider_locations (market_cluster_id)
  WHERE market_cluster_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS provider_locations_cluster_stall_uidx
  ON provider_locations (market_cluster_id, stall_code)
  WHERE market_cluster_id IS NOT NULL AND stall_code IS NOT NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS commerce_context text NOT NULL DEFAULT 'UNSPECIFIED',
  ADD COLUMN IF NOT EXISTS market_basket_id uuid REFERENCES market_baskets (id) ON DELETE RESTRICT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_commerce_context_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_commerce_context_check CHECK (
    commerce_context IN ('UNSPECIFIED', 'DIRECT', 'MARKET_TRIP')
  );

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_market_trip_basket_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_market_trip_basket_check CHECK (
    (commerce_context = 'MARKET_TRIP' AND market_basket_id IS NOT NULL)
    OR (commerce_context <> 'MARKET_TRIP' AND market_basket_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS orders_market_basket_idx
  ON orders (market_basket_id)
  WHERE market_basket_id IS NOT NULL;
