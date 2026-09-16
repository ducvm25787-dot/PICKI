-- S41 Family Dinner Phase B–D (ADR-046)
-- B: production lock + cancel gate
-- C: recipe versions + yield + inventory + production batch
-- D: late dinner offers + atomic remaining

ALTER TABLE family_dinner_provider_settings
  ADD COLUMN IF NOT EXISTS procurement_buffer_percent integer
    CHECK (
      procurement_buffer_percent IS NULL
      OR (procurement_buffer_percent >= 0 AND procurement_buffer_percent <= 100)
    );

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS production_locked_at timestamptz;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_kind_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_order_kind_check CHECK (
    order_kind IN ('STANDARD', 'FAMILY_DINNER', 'LATE_DINNER')
  );

CREATE TABLE IF NOT EXISTS ingredient_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  base_unit text NOT NULL DEFAULT 'g',
  procurement_class text NOT NULL DEFAULT 'SAME_DAY',
  default_yield_percent numeric(5, 2) NOT NULL DEFAULT 100
    CHECK (default_yield_percent > 0 AND default_yield_percent <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ingredient_procurement_class_check CHECK (
    procurement_class IN ('MORNING_FRESH', 'SAME_DAY', 'SHORT_STORAGE', 'PANTRY')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ingredient_master_name_uidx
  ON ingredient_master (lower(name));

CREATE TABLE IF NOT EXISTS provider_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_recipes_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS provider_recipes_provider_idx
  ON provider_recipes (provider_id);

CREATE TABLE IF NOT EXISTS provider_recipe_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES provider_recipes (id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  portion_label text NOT NULL DEFAULT '1 family portion',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, version_number)
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_version_id uuid NOT NULL
    REFERENCES provider_recipe_versions (id) ON DELETE CASCADE,
  ingredient_id uuid NOT NULL REFERENCES ingredient_master (id) ON DELETE RESTRICT,
  quantity_net numeric(12, 3) NOT NULL CHECK (quantity_net > 0),
  unit text NOT NULL DEFAULT 'g',
  yield_percent_override numeric(5, 2)
    CHECK (
      yield_percent_override IS NULL
      OR (yield_percent_override > 0 AND yield_percent_override <= 100)
    ),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS recipe_ingredients_version_idx
  ON recipe_ingredients (recipe_version_id);

ALTER TABLE family_dinner_menu_items
  ADD COLUMN IF NOT EXISTS recipe_version_id uuid
    REFERENCES provider_recipe_versions (id) ON DELETE SET NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS recipe_version_id uuid
    REFERENCES provider_recipe_versions (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS family_dinner_production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL
    REFERENCES provider_locations (id) ON DELETE CASCADE,
  service_date date NOT NULL,
  cutoff_at timestamptz,
  status text NOT NULL DEFAULT 'PLANNING',
  confirmed_orders integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_location_id, service_date),
  CONSTRAINT fd_batch_status_check CHECK (
    status IN ('PLANNING', 'LOCKED', 'COOKING', 'ASSEMBLING', 'READY', 'COMPLETED')
  )
);

CREATE TABLE IF NOT EXISTS family_dinner_production_item_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_batch_id uuid NOT NULL
    REFERENCES family_dinner_production_batches (id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL
    REFERENCES family_dinner_menu_items (id) ON DELETE RESTRICT,
  recipe_version_id uuid
    REFERENCES provider_recipe_versions (id) ON DELETE SET NULL,
  confirmed_quantity integer NOT NULL DEFAULT 0 CHECK (confirmed_quantity >= 0),
  late_quantity integer NOT NULL DEFAULT 0 CHECK (late_quantity >= 0),
  prepared_quantity integer NOT NULL DEFAULT 0 CHECK (prepared_quantity >= 0),
  remaining_quantity integer NOT NULL DEFAULT 0 CHECK (remaining_quantity >= 0),
  UNIQUE (production_batch_id, menu_item_id)
);

CREATE TABLE IF NOT EXISTS family_dinner_inventory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL
    REFERENCES provider_locations (id) ON DELETE CASCADE,
  service_date date NOT NULL,
  ingredient_id uuid NOT NULL REFERENCES ingredient_master (id) ON DELETE RESTRICT,
  on_hand_quantity numeric(12, 3) NOT NULL DEFAULT 0 CHECK (on_hand_quantity >= 0),
  unit text NOT NULL DEFAULT 'g',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_location_id, service_date, ingredient_id)
);

CREATE TABLE IF NOT EXISTS late_dinner_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL
    REFERENCES provider_locations (id) ON DELETE CASCADE,
  service_date date NOT NULL,
  production_batch_id uuid
    REFERENCES family_dinner_production_batches (id) ON DELETE SET NULL,
  title text NOT NULL,
  price_vnd integer NOT NULL CHECK (price_vnd >= 0),
  capacity integer NOT NULL CHECK (capacity > 0),
  remaining_capacity integer NOT NULL CHECK (remaining_capacity >= 0),
  eta_minutes integer NOT NULL DEFAULT 25 CHECK (eta_minutes > 0),
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT late_offer_status_check CHECK (status IN ('ACTIVE', 'SOLD_OUT', 'CLOSED')),
  CONSTRAINT late_offer_remaining_check CHECK (remaining_capacity <= capacity)
);

CREATE INDEX IF NOT EXISTS late_dinner_offers_location_date_idx
  ON late_dinner_offers (provider_location_id, service_date);

CREATE TABLE IF NOT EXISTS late_dinner_offer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES late_dinner_offers (id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL
    REFERENCES family_dinner_menu_items (id) ON DELETE RESTRICT,
  quantity_per_tray integer NOT NULL DEFAULT 1 CHECK (quantity_per_tray > 0)
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS late_dinner_offer_id uuid
    REFERENCES late_dinner_offers (id) ON DELETE SET NULL;
