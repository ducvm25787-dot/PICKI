-- Sprint 10: Catalog + Offerings (generic, Food composes on top)

CREATE TABLE IF NOT EXISTS offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  offering_type text NOT NULL DEFAULT 'PRODUCT',
  status text NOT NULL DEFAULT 'ACTIVE',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, slug),
  CONSTRAINT offerings_type_check CHECK (
    offering_type IN ('PRODUCT', 'SERVICE', 'BOOKING', 'REQUEST', 'LEAD')
  ),
  CONSTRAINT offerings_status_check CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS offering_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES offerings (id) ON DELETE CASCADE,
  provider_location_id uuid REFERENCES provider_locations (id) ON DELETE CASCADE,
  amount_vnd integer NOT NULL CHECK (amount_vnd >= 0),
  pricing_kind text NOT NULL DEFAULT 'FIXED',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offering_prices_kind_check CHECK (
    pricing_kind IN ('FIXED', 'FROM', 'RANGE', 'QUOTE_REQUIRED', 'FREE', 'CONTACT')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS offering_prices_location_offering_idx
  ON offering_prices (offering_id, provider_location_id)
  WHERE provider_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS offerings_provider_id_idx ON offerings (provider_id);
CREATE INDEX IF NOT EXISTS offering_prices_offering_id_idx ON offering_prices (offering_id);
