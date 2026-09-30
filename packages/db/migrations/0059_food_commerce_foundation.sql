-- Phase A: food commerce foundation.
-- Additive. Existing orders, menus, and provider_type stay.
-- No daily availability rows are copied from menu capacity (null qty = unlimited).

CREATE TABLE IF NOT EXISTS product_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_categories (
  id uuid PRIMARY KEY,
  parent_id uuid REFERENCES product_categories (id) ON DELETE RESTRICT,
  name text NOT NULL,
  type text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_categories_type_check CHECK (type IN ('FOOD', 'FRESH', 'RETAIL'))
);

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_root_name_uidx
  ON product_categories (type, name)
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_categories_child_name_uidx
  ON product_categories (type, parent_id, name)
  WHERE parent_id IS NOT NULL;

INSERT INTO product_categories (id, parent_id, name, type, sort_order)
VALUES
  ('a1000001-0000-4000-8000-000000000001', NULL, 'Món chính', 'FOOD', 10),
  ('a1000001-0000-4000-8000-000000000002', NULL, 'Món phụ', 'FOOD', 20),
  ('a1000001-0000-4000-8000-000000000003', NULL, 'Rau', 'FOOD', 30),
  ('a1000001-0000-4000-8000-000000000004', NULL, 'Canh', 'FOOD', 40),
  ('a1000001-0000-4000-8000-000000000005', NULL, 'Cơm', 'FOOD', 50),
  ('a1000001-0000-4000-8000-000000000006', NULL, 'Tráng miệng', 'FOOD', 60),
  ('a1000001-0000-4000-8000-000000000007', NULL, 'Đồ uống', 'FOOD', 70),
  ('a1000001-0000-4000-8000-000000000008', NULL, 'Món thêm', 'FOOD', 80)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE providers ADD COLUMN IF NOT EXISTS commerce_model text;

ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_commerce_model_check;
ALTER TABLE providers
  ADD CONSTRAINT providers_commerce_model_check CHECK (
    commerce_model IS NULL OR commerce_model IN ('FOOD_SERVICE', 'FRESH_MARKET', 'RETAIL_STORE')
  );

UPDATE providers
SET commerce_model = 'FOOD_SERVICE'
WHERE commerce_model IS NULL
  AND provider_type IN (
    'RESTAURANT', 'FOOD_STALL', 'HOME_COOK', 'CAFE', 'CAFÉ', 'BAKERY', 'FOOD'
  );

CREATE TABLE IF NOT EXISTS provider_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
  capability text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_capabilities_capability_check CHECK (
    capability IN (
      'SELL_NOW',
      'PREORDER',
      'BREAKFAST_PREORDER',
      'FAMILY_DINNER',
      'LATE_NIGHT',
      'COMBO_SET',
      'TODAY_FEATURE',
      'DELIVERY',
      'PICKUP',
      'CATERING',
      'CUSTOM_QUOTE',
      'RESERVATION'
    )
  ),
  CONSTRAINT provider_capabilities_provider_capability_uidx UNIQUE (provider_id, capability)
);

INSERT INTO provider_capabilities (provider_id, capability)
SELECT p.id, 'DELIVERY'
FROM providers p
WHERE p.commerce_model = 'FOOD_SERVICE'
ON CONFLICT (provider_id, capability) DO NOTHING;

INSERT INTO provider_capabilities (provider_id, capability)
SELECT DISTINCT o.provider_id, 'SELL_NOW'
FROM offerings o
JOIN providers p ON p.id = o.provider_id
WHERE p.commerce_model = 'FOOD_SERVICE'
  AND o.status = 'ACTIVE'
ON CONFLICT (provider_id, capability) DO NOTHING;

INSERT INTO provider_capabilities (provider_id, capability)
SELECT DISTINCT pl.provider_id, 'FAMILY_DINNER'
FROM family_dinner_provider_settings s
JOIN provider_locations pl ON pl.id = s.provider_location_id
WHERE s.enabled
ON CONFLICT (provider_id, capability) DO NOTHING;

INSERT INTO provider_capabilities (provider_id, capability)
SELECT DISTINCT pl.provider_id, 'BREAKFAST_PREORDER'
FROM breakfast_preorder_provider_settings s
JOIN provider_locations pl ON pl.id = s.provider_location_id
WHERE s.enabled
ON CONFLICT (provider_id, capability) DO NOTHING;

INSERT INTO provider_capabilities (provider_id, capability)
SELECT DISTINCT pl.provider_id, 'LATE_NIGHT'
FROM late_night_provider_settings s
JOIN provider_locations pl ON pl.id = s.provider_location_id
WHERE s.enabled
ON CONFLICT (provider_id, capability) DO NOTHING;

ALTER TABLE offerings ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES product_categories (id) ON DELETE SET NULL;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'phần';
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS prep_time_minutes integer;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS ready_to_eat_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS self_cook_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS self_cook_instruction text;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS product_family_id uuid REFERENCES product_families (id) ON DELETE SET NULL;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands (id) ON DELETE SET NULL;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS sku_code text;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS barcode text;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS pack_size text;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS net_weight numeric(12, 3);
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS sale_price_vnd integer;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS external_source text;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS external_updated_at timestamptz;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS sync_status text;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_sale_price_check;
ALTER TABLE offerings
  ADD CONSTRAINT offerings_sale_price_check CHECK (sale_price_vnd IS NULL OR sale_price_vnd >= 0);

CREATE TABLE IF NOT EXISTS product_daily_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES offerings (id) ON DELETE CASCADE,
  service_date date NOT NULL,
  status text NOT NULL DEFAULT 'AVAILABLE',
  available_qty integer,
  reserved_qty integer NOT NULL DEFAULT 0,
  sold_qty integer NOT NULL DEFAULT 0,
  price_override_vnd integer,
  available_from time,
  available_until time,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_daily_availability_status_check CHECK (
    status IN ('AVAILABLE', 'SOLD_OUT', 'HIDDEN')
  ),
  CONSTRAINT product_daily_availability_qty_check CHECK (
    (available_qty IS NULL OR available_qty >= 0)
    AND reserved_qty >= 0
    AND sold_qty >= 0
    AND (available_qty IS NULL OR available_qty >= reserved_qty + sold_qty)
  ),
  CONSTRAINT product_daily_availability_price_check CHECK (
    price_override_vnd IS NULL OR price_override_vnd >= 0
  ),
  CONSTRAINT product_daily_availability_offering_date_uidx UNIQUE (offering_id, service_date)
);

CREATE INDEX IF NOT EXISTS product_daily_availability_provider_date_idx
  ON product_daily_availability (provider_id, service_date);

CREATE TABLE IF NOT EXISTS offering_stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES offerings (id) ON DELETE CASCADE,
  service_date date NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'RESERVED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offering_stock_reservations_status_check CHECK (
    status IN ('RESERVED', 'CONFIRMED', 'RELEASED')
  ),
  CONSTRAINT offering_stock_reservations_order_offering_uidx UNIQUE (order_id, offering_id)
);

CREATE INDEX IF NOT EXISTS offering_stock_reservations_order_idx
  ON offering_stock_reservations (order_id);

ALTER TABLE family_dinner_menu_items
  ADD COLUMN IF NOT EXISTS offering_id uuid REFERENCES offerings (id) ON DELETE SET NULL;

UPDATE family_dinner_menu_items mi
SET offering_id = match.offering_id
FROM (
  SELECT mi2.id AS menu_item_id, (min(o.id::text))::uuid AS offering_id
  FROM family_dinner_menu_items mi2
  JOIN family_dinner_daily_menus m ON m.id = mi2.daily_menu_id
  JOIN provider_locations pl ON pl.id = m.provider_location_id
  JOIN offerings o
    ON o.provider_id = pl.provider_id
   AND lower(btrim(o.name)) = lower(btrim(mi2.name))
  WHERE mi2.offering_id IS NULL
  GROUP BY mi2.id
  HAVING count(DISTINCT o.id) = 1
) match
WHERE mi.id = match.menu_item_id
  AND mi.offering_id IS NULL;

CREATE INDEX IF NOT EXISTS fd_menu_items_offering_idx
  ON family_dinner_menu_items (offering_id)
  WHERE offering_id IS NOT NULL;
