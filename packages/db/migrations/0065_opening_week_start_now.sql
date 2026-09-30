-- Opening Week starts at 20:28 on 2026-09-30, not midnight 1/10.
-- End stays 2026-10-08 00:00 +07 (through the end of 7/10).

UPDATE delivery_promotions
SET
  starts_at = timestamptz '2026-09-30 20:28:00+07',
  updated_at = now()
WHERE id = 'b1000001-0000-4000-8000-000000000001'
  AND starts_at > timestamptz '2026-09-30 20:28:00+07';
