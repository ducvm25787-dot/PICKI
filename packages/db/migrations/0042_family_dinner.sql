-- S41 Family Dinner Phase A (ADR-046)

CREATE TABLE IF NOT EXISTS family_dinner_provider_settings (
  provider_location_id uuid PRIMARY KEY
    REFERENCES provider_locations (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  cutoff_time time NOT NULL DEFAULT '16:00',
  daily_capacity integer CHECK (daily_capacity IS NULL OR daily_capacity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family_dinner_delivery_windows (
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
  CONSTRAINT fd_windows_status_check CHECK (status IN ('OPEN', 'FULL', 'CLOSED')),
  CONSTRAINT fd_windows_range_check CHECK (ends_at > starts_at),
  CONSTRAINT fd_windows_remaining_check CHECK (remaining_capacity <= capacity),
  UNIQUE (provider_location_id, service_date, starts_at, ends_at)
);

CREATE INDEX IF NOT EXISTS fd_windows_location_date_idx
  ON family_dinner_delivery_windows (provider_location_id, service_date);

CREATE TABLE IF NOT EXISTS family_dinner_daily_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL
    REFERENCES provider_locations (id) ON DELETE CASCADE,
  service_date date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_location_id, service_date),
  CONSTRAINT fd_menus_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS family_dinner_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_menu_id uuid NOT NULL
    REFERENCES family_dinner_daily_menus (id) ON DELETE CASCADE,
  category text NOT NULL,
  name text NOT NULL,
  description text,
  price_vnd integer NOT NULL CHECK (price_vnd >= 0),
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  remaining_capacity integer CHECK (remaining_capacity IS NULL OR remaining_capacity >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fd_items_category_check CHECK (
    category IN ('MAIN', 'SIDE', 'VEGETABLE', 'SOUP', 'EXTRA')
  ),
  CONSTRAINT fd_items_status_check CHECK (
    status IN ('DRAFT', 'ACTIVE', 'SOLD_OUT', 'PAUSED', 'ENDED')
  )
);

CREATE INDEX IF NOT EXISTS fd_menu_items_menu_idx
  ON family_dinner_menu_items (daily_menu_id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS order_kind text NOT NULL DEFAULT 'STANDARD';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_kind_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_order_kind_check CHECK (
    order_kind IN ('STANDARD', 'FAMILY_DINNER')
  );

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_date date;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_window_id uuid
    REFERENCES family_dinner_delivery_windows (id) ON DELETE SET NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS family_dinner_menu_item_id uuid
    REFERENCES family_dinner_menu_items (id) ON DELETE SET NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS family_dinner_category text;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_fd_category_check;
ALTER TABLE order_items
  ADD CONSTRAINT order_items_fd_category_check CHECK (
    family_dinner_category IS NULL
    OR family_dinner_category IN ('MAIN', 'SIDE', 'VEGETABLE', 'SOUP', 'EXTRA')
  );
