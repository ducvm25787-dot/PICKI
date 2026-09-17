-- S42 Breakfast Preorder Phase 1 (ADR-047) — Sáng mai ăn gì?

CREATE TABLE IF NOT EXISTS breakfast_preorder_provider_settings (
  provider_location_id uuid PRIMARY KEY
    REFERENCES provider_locations (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  cutoff_time time NOT NULL DEFAULT '23:30',
  open_from_time time NOT NULL DEFAULT '20:00',
  daily_capacity integer CHECK (daily_capacity IS NULL OR daily_capacity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS breakfast_preorder_delivery_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL
    REFERENCES provider_locations (id) ON DELETE CASCADE,
  service_date date NOT NULL,
  starts_at time NOT NULL,
  ends_at time NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  remaining_capacity integer NOT NULL CHECK (remaining_capacity >= 0),
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bf_windows_status_check CHECK (status IN ('OPEN', 'FULL', 'CLOSED')),
  CONSTRAINT bf_windows_range_check CHECK (ends_at > starts_at),
  CONSTRAINT bf_windows_remaining_check CHECK (remaining_capacity <= capacity),
  UNIQUE (provider_location_id, service_date, starts_at, ends_at)
);

CREATE INDEX IF NOT EXISTS bf_windows_location_date_idx
  ON breakfast_preorder_delivery_windows (provider_location_id, service_date);

CREATE TABLE IF NOT EXISTS breakfast_preorder_daily_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL
    REFERENCES provider_locations (id) ON DELETE CASCADE,
  service_date date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  published_at timestamptz,
  copied_from_service_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_location_id, service_date),
  CONSTRAINT bf_menus_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS breakfast_preorder_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_menu_id uuid NOT NULL
    REFERENCES breakfast_preorder_daily_menus (id) ON DELETE CASCADE,
  offering_id uuid REFERENCES offerings (id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  price_vnd integer NOT NULL CHECK (price_vnd >= 0),
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  remaining_capacity integer CHECK (remaining_capacity IS NULL OR remaining_capacity >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bf_items_status_check CHECK (
    status IN ('DRAFT', 'ACTIVE', 'SOLD_OUT', 'PAUSED', 'ENDED')
  )
);

CREATE INDEX IF NOT EXISTS bf_menu_items_menu_idx
  ON breakfast_preorder_menu_items (daily_menu_id);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_kind_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_order_kind_check CHECK (
    order_kind IN ('STANDARD', 'FAMILY_DINNER', 'LATE_DINNER', 'BREAKFAST_PREORDER')
  );

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS breakfast_delivery_window_id uuid
    REFERENCES breakfast_preorder_delivery_windows (id) ON DELETE SET NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS breakfast_menu_item_id uuid
    REFERENCES breakfast_preorder_menu_items (id) ON DELETE SET NULL;
