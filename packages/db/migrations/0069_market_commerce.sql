-- Market commerce rides the existing catalog and order engine.
-- Shop kind stays on provider_type. Goods taxonomy stays on product_categories.

INSERT INTO product_categories (id, parent_id, name, type, sort_order)
VALUES
  ('a1000002-0000-4000-8000-000000000001', NULL, 'Rau củ', 'FRESH', 10),
  ('a1000002-0000-4000-8000-000000000002', NULL, 'Trái cây', 'FRESH', 20),
  ('a1000002-0000-4000-8000-000000000003', NULL, 'Thịt', 'FRESH', 30),
  ('a1000002-0000-4000-8000-000000000004', NULL, 'Cá & Hải sản', 'FRESH', 40),
  ('a1000002-0000-4000-8000-000000000005', NULL, 'Gia cầm', 'FRESH', 50),
  ('a1000002-0000-4000-8000-000000000006', NULL, 'Trứng', 'FRESH', 60),
  ('a1000003-0000-4000-8000-000000000001', NULL, 'Sữa & Đồ uống', 'RETAIL', 10),
  ('a1000003-0000-4000-8000-000000000002', NULL, 'Đồ khô', 'RETAIL', 20),
  ('a1000003-0000-4000-8000-000000000003', NULL, 'Đông lạnh', 'RETAIL', 30),
  ('a1000003-0000-4000-8000-000000000004', NULL, 'Đồ dùng gia đình', 'RETAIL', 40),
  ('a1000003-0000-4000-8000-000000000005', NULL, 'Hàng thiết yếu', 'RETAIL', 50)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE providers ADD COLUMN IF NOT EXISTS primary_category_id uuid
  REFERENCES product_categories (id) ON DELETE SET NULL;

UPDATE providers
SET commerce_model = 'FRESH_MARKET'
WHERE commerce_model IS NULL
  AND provider_type = 'MARKET_VENDOR';

UPDATE providers
SET commerce_model = 'RETAIL_STORE'
WHERE commerce_model IS NULL
  AND provider_type IN ('MINIMART', 'RETAIL_STORE', 'SUPERMARKET');

ALTER TABLE product_daily_availability
  ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false;

INSERT INTO provider_capabilities (provider_id, capability, enabled)
SELECT p.id, cap.capability, true
FROM providers p
CROSS JOIN (
  VALUES ('SELL_NOW'), ('DELIVERY'), ('TODAY_FEATURE')
) AS cap(capability)
WHERE p.provider_type IN ('MARKET_VENDOR', 'MINIMART', 'RETAIL_STORE')
ON CONFLICT (provider_id, capability) DO NOTHING;

INSERT INTO provider_capabilities (provider_id, capability, enabled)
SELECT p.id, cap.capability, false
FROM providers p
CROSS JOIN (
  VALUES ('SELL_NOW'), ('DELIVERY'), ('TODAY_FEATURE')
) AS cap(capability)
WHERE p.provider_type = 'SUPERMARKET'
ON CONFLICT (provider_id, capability) DO NOTHING;
