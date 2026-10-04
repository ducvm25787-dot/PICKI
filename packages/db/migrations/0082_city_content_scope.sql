-- City sits between Global and Zone for shared content.
-- Experiences already store experience_cities.code (Hanoi). Reuse that catalog.
-- CITY role scope_id is experience_cities.id. Banner rows gain the same city code.

ALTER TABLE experience_cities ADD COLUMN IF NOT EXISTS id uuid;
UPDATE experience_cities SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE experience_cities ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE experience_cities ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS experience_cities_id_uidx ON experience_cities (id);

ALTER TABLE home_hero_images ADD COLUMN IF NOT EXISTS city text;
UPDATE home_hero_images SET city = 'Hanoi' WHERE city IS NULL;
ALTER TABLE home_hero_images ALTER COLUMN city SET DEFAULT 'Hanoi';
ALTER TABLE home_hero_images ALTER COLUMN city SET NOT NULL;

ALTER TABLE home_hero_images DROP CONSTRAINT IF EXISTS home_hero_images_city_fk;
ALTER TABLE home_hero_images
  ADD CONSTRAINT home_hero_images_city_fk
  FOREIGN KEY (city) REFERENCES experience_cities (code);

ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check CHECK (
  role IN (
    'CUSTOMER',
    'PROVIDER_OWNER',
    'PROVIDER_MANAGER',
    'PROVIDER_STAFF',
    'RUNNER',
    'ZONE_AGENT',
    'ZONE_OPERATOR',
    'SUPPORT',
    'FINANCE',
    'ZONE_ADMIN',
    'CITY_ADMIN',
    'SUPER_ADMIN'
  )
);
