-- Sprint 4–5: Zone Planner candidates + Zone Engine

CREATE TABLE IF NOT EXISTS zone_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'CANDIDATE',
  anchor_lng double precision NOT NULL,
  anchor_lat double precision NOT NULL,
  proposed_boundary geometry(MultiPolygon, 4326),
  scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zone_candidates_status_check CHECK (
    status IN (
      'DETECTED',
      'CANDIDATE',
      'UNDER_REVIEW',
      'FIELD_VALIDATION',
      'APPROVED',
      'REJECTED',
      'ARCHIVED'
    )
  )
);

CREATE TABLE IF NOT EXISTS zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  anchor_lng double precision NOT NULL,
  anchor_lat double precision NOT NULL,
  candidate_id uuid REFERENCES zone_candidates (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zones_status_check CHECK (
    status IN ('DRAFT', 'CONFIGURING', 'PILOT', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'CLOSED')
  )
);

CREATE TABLE IF NOT EXISTS zone_boundary_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  version integer NOT NULL,
  boundary geometry(MultiPolygon, 4326) NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (zone_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS zone_boundary_versions_current_idx
  ON zone_boundary_versions (zone_id)
  WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS zone_settings (
  zone_id uuid PRIMARY KEY REFERENCES zones (id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  kind text NOT NULL,
  boundary geometry(MultiPolygon, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_areas_kind_check CHECK (kind IN ('CORE', 'PRIMARY', 'EXTENDED'))
);

CREATE INDEX IF NOT EXISTS service_areas_zone_id_idx ON service_areas (zone_id);
CREATE INDEX IF NOT EXISTS zone_boundary_versions_boundary_gix
  ON zone_boundary_versions USING GIST (boundary);
