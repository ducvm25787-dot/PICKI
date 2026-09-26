-- Experience cities are a catalog. P0 enables Hanoi only.
-- Opening another city is a row here plus content, not a schema change.

CREATE TABLE IF NOT EXISTS experience_cities (
  code text PRIMARY KEY,
  label text NOT NULL,
  slug text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO experience_cities (code, label, slug, enabled)
VALUES ('Hanoi', 'Hà Nội', 'hanoi', true)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE experiences DROP CONSTRAINT IF EXISTS experiences_city_chk;

ALTER TABLE experiences DROP CONSTRAINT IF EXISTS experiences_city_fk;
ALTER TABLE experiences
  ADD CONSTRAINT experiences_city_fk
  FOREIGN KEY (city) REFERENCES experience_cities (code);

ALTER TABLE experience_venues ADD COLUMN IF NOT EXISTS city text;
UPDATE experience_venues SET city = 'Hanoi' WHERE city IS NULL;
ALTER TABLE experience_venues ALTER COLUMN city SET NOT NULL;
ALTER TABLE experience_venues DROP CONSTRAINT IF EXISTS experience_venues_city_fk;
ALTER TABLE experience_venues
  ADD CONSTRAINT experience_venues_city_fk
  FOREIGN KEY (city) REFERENCES experience_cities (code);

ALTER TABLE experience_organizers ADD COLUMN IF NOT EXISTS city text;
UPDATE experience_organizers SET city = 'Hanoi' WHERE city IS NULL;
ALTER TABLE experience_organizers ALTER COLUMN city SET NOT NULL;
ALTER TABLE experience_organizers DROP CONSTRAINT IF EXISTS experience_organizers_city_fk;
ALTER TABLE experience_organizers
  ADD CONSTRAINT experience_organizers_city_fk
  FOREIGN KEY (city) REFERENCES experience_cities (code);

CREATE INDEX IF NOT EXISTS experiences_city_status_idx ON experiences (city, status);
