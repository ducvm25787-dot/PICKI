-- Sprint 6: Join Zone + addresses

CREATE TABLE IF NOT EXISTS addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  address_type text NOT NULL,
  building text,
  floor text,
  apartment text,
  house_number text,
  alley text,
  street text,
  ward text,
  city text,
  delivery_note text,
  coordinates geometry(Point, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT addresses_type_check CHECK (
    address_type IN ('RESIDENTIAL', 'WORKPLACE', 'STREET_ADDRESS', 'TEMPORARY', 'OTHER')
  )
);

CREATE TABLE IF NOT EXISTS user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  address_id uuid NOT NULL REFERENCES addresses (id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'HOME',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, address_id)
);

CREATE INDEX IF NOT EXISTS user_addresses_user_zone_idx ON user_addresses (user_id, zone_id);

CREATE TABLE IF NOT EXISTS address_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address_id uuid NOT NULL REFERENCES addresses (id) ON DELETE CASCADE,
  status text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT address_verifications_status_check CHECK (
    status IN ('UNVALIDATED', 'LEVEL_1_VALIDATED', 'VERIFIED', 'REVOKED')
  )
);

CREATE INDEX IF NOT EXISTS address_verifications_address_idx
  ON address_verifications (address_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_zone_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'JOINED',
  default_address_id uuid REFERENCES addresses (id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, zone_id),
  CONSTRAINT user_zone_memberships_status_check CHECK (
    status IN ('JOINED', 'VERIFIED', 'SUSPENDED', 'LEFT')
  )
);

CREATE INDEX IF NOT EXISTS user_zone_memberships_zone_idx ON user_zone_memberships (zone_id);
