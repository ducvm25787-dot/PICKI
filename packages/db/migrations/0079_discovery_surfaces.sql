-- Home rails follow approved_surface. featured no longer publishes a dish.
-- Snack groups are FOOD categories so the product form can classify a dish.

ALTER TABLE provider_daily_updates
  ADD COLUMN IF NOT EXISTS suggested_surface text,
  ADD COLUMN IF NOT EXISTS approved_surface text;

ALTER TABLE provider_daily_updates DROP CONSTRAINT IF EXISTS pdu_suggested_surface_check;
ALTER TABLE provider_daily_updates
  ADD CONSTRAINT pdu_suggested_surface_check
  CHECK (
    suggested_surface IS NULL
    OR suggested_surface IN ('SPECIAL_TODAY', 'SNACK_DESSERT', 'MARKET_TODAY')
  );

ALTER TABLE provider_daily_updates DROP CONSTRAINT IF EXISTS pdu_approved_surface_check;
ALTER TABLE provider_daily_updates
  ADD CONSTRAINT pdu_approved_surface_check
  CHECK (
    approved_surface IS NULL
    OR approved_surface IN ('SPECIAL_TODAY', 'SNACK_DESSERT', 'MARKET_TODAY')
  );

INSERT INTO product_categories (id, parent_id, name, type, sort_order)
VALUES
  ('a1000001-0000-4000-8000-000000000101', NULL, 'Ốc & đồ nóng', 'FOOD', 110),
  ('a1000001-0000-4000-8000-000000000102', NULL, 'Nem / đồ chiên', 'FOOD', 120),
  ('a1000001-0000-4000-8000-000000000103', NULL, 'Xiên nướng', 'FOOD', 130),
  ('a1000001-0000-4000-8000-000000000104', NULL, 'Bánh nóng', 'FOOD', 140),
  ('a1000001-0000-4000-8000-000000000105', NULL, 'Ngô - Khoai - Sắn', 'FOOD', 150),
  ('a1000001-0000-4000-8000-000000000106', NULL, 'Chè', 'FOOD', 160),
  ('a1000001-0000-4000-8000-000000000107', NULL, 'Kem / Sữa chua / Tào phớ', 'FOOD', 170),
  ('a1000001-0000-4000-8000-000000000108', NULL, 'Trà sữa & đồ uống', 'FOOD', 180),
  ('a1000001-0000-4000-8000-000000000109', NULL, 'Trái cây ăn ngay', 'FOOD', 190)
ON CONFLICT (id) DO NOTHING;
