-- Sprint 8: Provider + Location foundation

CREATE TABLE IF NOT EXISTS providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  brand_name text NOT NULL,
  provider_type text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT providers_status_check CHECK (
    status IN ('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'CLOSED')
  )
);

CREATE TABLE IF NOT EXISTS provider_profiles (
  provider_id uuid PRIMARY KEY REFERENCES providers (id) ON DELETE CASCADE,
  tagline text,
  description text,
  logo_url text,
  cover_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
  slug text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  address_line text,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, slug),
  CONSTRAINT provider_locations_status_check CHECK (
    status IN (
      'DRAFT',
      'PENDING_VERIFICATION',
      'ACTIVE',
      'PAUSED',
      'RELOCATING',
      'CLOSED',
      'RELOCATED'
    )
  )
);

CREATE TABLE IF NOT EXISTS provider_zone_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_location_id, zone_id),
  CONSTRAINT provider_zone_memberships_status_check CHECK (
    status IN ('PENDING', 'ACTIVE', 'PAUSED', 'REMOVED')
  )
);

CREATE TABLE IF NOT EXISTS provider_live_status (
  provider_location_id uuid PRIMARY KEY REFERENCES provider_locations (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'OFFLINE',
  message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_live_status_status_check CHECK (
    status IN ('OPEN', 'BUSY', 'CLOSED', 'OFFLINE')
  )
);

CREATE INDEX IF NOT EXISTS provider_locations_provider_id_idx ON provider_locations (provider_id);
CREATE INDEX IF NOT EXISTS provider_zone_memberships_zone_id_idx ON provider_zone_memberships (zone_id);
