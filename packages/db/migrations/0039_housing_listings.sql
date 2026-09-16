-- S37: Cho thuê / Ở ghép — peer listings trên engine Classified (ADR-042)
-- Không Provider BĐS. Quota: 1 tin ACTIVE + 2 lần tạo/tháng. TTL 7 ngày.

ALTER TABLE classified_listings
  DROP CONSTRAINT IF EXISTS classified_listings_listing_type_check;

ALTER TABLE classified_listings
  ADD CONSTRAINT classified_listings_listing_type_check
  CHECK (listing_type IN ('RESALE', 'GIVE_AWAY', 'CHO_THUE', 'O_GHEP'));

ALTER TABLE classified_listings
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Một tin housing đang mở (AVAILABLE) / user
CREATE UNIQUE INDEX IF NOT EXISTS classified_housing_one_active
  ON classified_listings (seller_user_id)
  WHERE listing_type IN ('CHO_THUE', 'O_GHEP')
    AND status = 'AVAILABLE';

CREATE INDEX IF NOT EXISTS classified_housing_expires_idx
  ON classified_listings (expires_at)
  WHERE listing_type IN ('CHO_THUE', 'O_GHEP')
    AND status = 'AVAILABLE'
    AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS classified_housing_quota_idx
  ON classified_listings (seller_user_id, created_at DESC)
  WHERE listing_type IN ('CHO_THUE', 'O_GHEP');
