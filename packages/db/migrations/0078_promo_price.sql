-- Ưu đãi on the homepage is a lower selling price for today, not a free-text label.
-- Stored on the post until Ops approves, then copied onto today's price override.

ALTER TABLE provider_daily_updates
  ADD COLUMN IF NOT EXISTS promo_price_vnd integer;

ALTER TABLE provider_daily_updates
  DROP CONSTRAINT IF EXISTS provider_daily_updates_promo_price_check;

ALTER TABLE provider_daily_updates
  ADD CONSTRAINT provider_daily_updates_promo_price_check
  CHECK (promo_price_vnd IS NULL OR promo_price_vnd > 0);
