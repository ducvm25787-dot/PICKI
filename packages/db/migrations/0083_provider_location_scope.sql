-- City is the parent of a Zone. A location inherits City from its Zone memberships.
-- Stock and local review are per location / per Zone, not shared across a brand.

ALTER TABLE zones ADD COLUMN IF NOT EXISTS city_id uuid;
UPDATE zones
SET city_id = (SELECT id FROM experience_cities WHERE code = 'Hanoi')
WHERE city_id IS NULL;
ALTER TABLE zones ALTER COLUMN city_id SET NOT NULL;
ALTER TABLE zones DROP CONSTRAINT IF EXISTS zones_city_fk;
ALTER TABLE zones
  ADD CONSTRAINT zones_city_fk
  FOREIGN KEY (city_id) REFERENCES experience_cities (id);

ALTER TABLE provider_members ADD COLUMN IF NOT EXISTS scope_type text;
ALTER TABLE provider_members ADD COLUMN IF NOT EXISTS scope_id uuid;

UPDATE provider_members
SET scope_type = 'LOCATION', scope_id = provider_location_id
WHERE provider_location_id IS NOT NULL
  AND scope_type IS NULL;

UPDATE provider_members
SET scope_type = 'PROVIDER', scope_id = provider_id
WHERE provider_location_id IS NULL
  AND scope_type IS NULL;

ALTER TABLE provider_members ALTER COLUMN scope_type SET NOT NULL;
ALTER TABLE provider_members ALTER COLUMN scope_id SET NOT NULL;
ALTER TABLE provider_members DROP CONSTRAINT IF EXISTS provider_members_scope_check;
ALTER TABLE provider_members
  ADD CONSTRAINT provider_members_scope_check CHECK (
    scope_type IN ('PROVIDER', 'CITY', 'ZONE', 'LOCATION')
  );

CREATE UNIQUE INDEX IF NOT EXISTS provider_members_scope_uidx
  ON provider_members (user_id, provider_id, scope_type, scope_id);

CREATE OR REPLACE FUNCTION provider_members_fill_scope() RETURNS trigger AS $$
BEGIN
  IF NEW.scope_type IS NULL OR NEW.scope_id IS NULL THEN
    IF NEW.provider_location_id IS NOT NULL THEN
      NEW.scope_type := 'LOCATION';
      NEW.scope_id := NEW.provider_location_id;
    ELSE
      NEW.scope_type := 'PROVIDER';
      NEW.scope_id := NEW.provider_id;
    END IF;
  END IF;
  IF NEW.scope_type = 'LOCATION' THEN
    NEW.provider_location_id := NEW.scope_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS provider_members_fill_scope ON provider_members;
CREATE TRIGGER provider_members_fill_scope
  BEFORE INSERT OR UPDATE ON provider_members
  FOR EACH ROW
  EXECUTE FUNCTION provider_members_fill_scope();

CREATE OR REPLACE FUNCTION provider_location_zones_same_city() RETURNS trigger AS $$
DECLARE
  new_city uuid;
  other_city uuid;
BEGIN
  IF NEW.status = 'REMOVED' THEN
    RETURN NEW;
  END IF;
  SELECT city_id INTO new_city FROM zones WHERE id = NEW.zone_id;
  SELECT z.city_id INTO other_city
  FROM provider_zone_memberships m
  JOIN zones z ON z.id = m.zone_id
  WHERE m.provider_location_id = NEW.provider_location_id
    AND m.id IS DISTINCT FROM NEW.id
    AND m.status <> 'REMOVED'
    AND z.city_id IS DISTINCT FROM new_city
  LIMIT 1;
  IF other_city IS NOT NULL THEN
    RAISE EXCEPTION 'location zones must share one city';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS provider_location_zones_same_city ON provider_zone_memberships;
CREATE TRIGGER provider_location_zones_same_city
  BEFORE INSERT OR UPDATE ON provider_zone_memberships
  FOR EACH ROW
  EXECUTE FUNCTION provider_location_zones_same_city();

ALTER TABLE product_daily_availability
  ADD COLUMN IF NOT EXISTS provider_location_id uuid;

ALTER TABLE product_daily_availability
  DROP CONSTRAINT IF EXISTS product_daily_availability_offering_date_uidx;

UPDATE product_daily_availability a
SET provider_location_id = pl.id
FROM provider_locations pl
WHERE pl.provider_id = a.provider_id
  AND a.provider_location_id IS NULL
  AND (
    SELECT count(*) FROM provider_locations x WHERE x.provider_id = a.provider_id
  ) = 1;

INSERT INTO product_daily_availability (
  provider_id, offering_id, provider_location_id, service_date, status,
  available_qty, reserved_qty, sold_qty, price_override_vnd, featured,
  available_from, available_until
)
SELECT
  a.provider_id, a.offering_id, pl.id, a.service_date, a.status,
  a.available_qty, a.reserved_qty, a.sold_qty, a.price_override_vnd, a.featured,
  a.available_from, a.available_until
FROM product_daily_availability a
JOIN provider_locations pl ON pl.provider_id = a.provider_id
WHERE a.provider_location_id IS NULL;

DELETE FROM product_daily_availability WHERE provider_location_id IS NULL;

ALTER TABLE product_daily_availability
  ALTER COLUMN provider_location_id SET NOT NULL;
ALTER TABLE product_daily_availability DROP CONSTRAINT IF EXISTS product_daily_availability_location_fk;
ALTER TABLE product_daily_availability
  ADD CONSTRAINT product_daily_availability_location_fk
  FOREIGN KEY (provider_location_id) REFERENCES provider_locations (id) ON DELETE CASCADE;
ALTER TABLE product_daily_availability
  DROP CONSTRAINT IF EXISTS product_daily_availability_location_offering_date_uidx;
ALTER TABLE product_daily_availability
  ADD CONSTRAINT product_daily_availability_location_offering_date_uidx
  UNIQUE (provider_location_id, offering_id, service_date);

ALTER TABLE offering_stock_reservations
  ADD COLUMN IF NOT EXISTS provider_location_id uuid;

UPDATE offering_stock_reservations r
SET provider_location_id = o.provider_location_id
FROM orders o
WHERE o.id = r.order_id
  AND r.provider_location_id IS NULL;

UPDATE offering_stock_reservations r
SET provider_location_id = sub.location_id
FROM (
  SELECT
    o.id AS offering_id,
    (
      SELECT pl.id
      FROM provider_locations pl
      WHERE pl.provider_id = o.provider_id
      ORDER BY pl.created_at
      LIMIT 1
    ) AS location_id
  FROM offerings o
) sub
WHERE r.offering_id = sub.offering_id
  AND r.provider_location_id IS NULL
  AND sub.location_id IS NOT NULL;

DELETE FROM offering_stock_reservations WHERE provider_location_id IS NULL;

ALTER TABLE offering_stock_reservations
  ALTER COLUMN provider_location_id SET NOT NULL;
ALTER TABLE offering_stock_reservations DROP CONSTRAINT IF EXISTS offering_stock_reservations_location_fk;
ALTER TABLE offering_stock_reservations
  ADD CONSTRAINT offering_stock_reservations_location_fk
  FOREIGN KEY (provider_location_id) REFERENCES provider_locations (id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS provider_daily_update_zone_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id uuid NOT NULL REFERENCES provider_daily_updates (id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  review_status text NOT NULL DEFAULT 'PENDING_REVIEW',
  approved_surface text,
  reviewed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdu_zone_targets_status_check CHECK (
    review_status IN ('PENDING_REVIEW', 'APPROVED', 'REJECTED')
  ),
  CONSTRAINT pdu_zone_targets_surface_check CHECK (
    approved_surface IS NULL
    OR approved_surface IN ('SPECIAL_TODAY', 'SNACK_DESSERT', 'MARKET_TODAY')
  ),
  CONSTRAINT pdu_zone_targets_uidx UNIQUE (update_id, zone_id)
);

INSERT INTO provider_daily_update_zone_targets (
  update_id, zone_id, review_status, approved_surface, reviewed_at
)
SELECT
  u.id,
  m.zone_id,
  CASE u.status
    WHEN 'ACTIVE' THEN 'APPROVED'
    WHEN 'REJECTED' THEN 'REJECTED'
    ELSE 'PENDING_REVIEW'
  END,
  CASE WHEN u.status = 'ACTIVE' THEN u.approved_surface ELSE NULL END,
  CASE WHEN u.status IN ('ACTIVE', 'REJECTED') THEN u.updated_at ELSE NULL END
FROM provider_daily_updates u
JOIN provider_zone_memberships m
  ON m.provider_location_id = u.provider_location_id
 AND m.status = 'ACTIVE'
WHERE u.status IN ('ACTIVE', 'REJECTED', 'PENDING_REVIEW')
ON CONFLICT (update_id, zone_id) DO NOTHING;
