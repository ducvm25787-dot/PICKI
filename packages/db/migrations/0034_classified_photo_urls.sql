-- S33: Classified — up to 3 photos per listing

ALTER TABLE classified_listings
  ADD COLUMN IF NOT EXISTS photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE classified_listings
SET photo_urls = jsonb_build_array(photo_url)
WHERE photo_url IS NOT NULL
  AND (photo_urls IS NULL OR photo_urls = '[]'::jsonb);
