-- S40: Thất lạc / Pet Lost — peer listings trên Classified (ADR-045)
-- Quota (app-enforced): 2 tin AVAILABLE + 5 lần tạo/tháng. TTL 14 ngày.

ALTER TABLE classified_listings
  DROP CONSTRAINT IF EXISTS classified_listings_listing_type_check;

ALTER TABLE classified_listings
  ADD CONSTRAINT classified_listings_listing_type_check
  CHECK (listing_type IN (
    'RESALE', 'GIVE_AWAY', 'CHO_THUE', 'O_GHEP', 'LOST_FOUND', 'PET_LOST'
  ));

CREATE INDEX IF NOT EXISTS classified_lost_active_idx
  ON classified_listings (seller_user_id)
  WHERE listing_type IN ('LOST_FOUND', 'PET_LOST')
    AND status = 'AVAILABLE';

CREATE INDEX IF NOT EXISTS classified_lost_expires_idx
  ON classified_listings (expires_at)
  WHERE listing_type IN ('LOST_FOUND', 'PET_LOST')
    AND status = 'AVAILABLE'
    AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS classified_lost_quota_idx
  ON classified_listings (seller_user_id, created_at DESC)
  WHERE listing_type IN ('LOST_FOUND', 'PET_LOST');
