-- Customer self-entered face for Mini App. Provider sees it on orders.
-- Not a Zalo scrape: the customer types their Zalo display name and uploads a photo.

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
