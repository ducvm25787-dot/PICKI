-- Daily update multi-photo (max 3 enforced in API)

ALTER TABLE provider_daily_updates
  ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
