-- Opening Week starts 2026-09-30 20:28 Asia/Ho_Chi_Minh and runs through the end of 7/10.
-- 7 days, Pickee covers up to 20_000đ per food runner job, 2 orders per customer per day.
-- Numbers live in this row. The fee calculator does not hard-code them.

INSERT INTO delivery_promotions (
  id,
  name,
  sponsor_type,
  subsidy_mode,
  zone_id,
  provider_id,
  starts_at,
  ends_at,
  minimum_order_vnd,
  max_subsidy_per_order_vnd,
  provider_share_vnd,
  pickee_share_vnd,
  usage_limit_per_user_per_day,
  eligible_modes,
  active
)
SELECT
  'b1000001-0000-4000-8000-000000000001',
  'Opening Week Kim Văn – Kim Lũ',
  'PICKEE',
  'COVER_UP_TO',
  z.id,
  NULL,
  timestamptz '2026-09-30 20:28:00+07',
  timestamptz '2026-10-08 00:00:00+07',
  0,
  20000,
  0,
  0,
  2,
  'PICKEE_RUNNER',
  true
FROM zones z
WHERE z.slug = 'kim-van-kim-lu'
  AND NOT EXISTS (
    SELECT 1
    FROM delivery_promotions p
    WHERE p.id = 'b1000001-0000-4000-8000-000000000001'
  );
