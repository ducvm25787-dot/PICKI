-- S33: Classified (Thanh lý) + Give Away — C2C listings in Zone

CREATE TABLE IF NOT EXISTS classified_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_number text NOT NULL UNIQUE,
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
  seller_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  listing_type text NOT NULL CHECK (listing_type IN ('RESALE', 'GIVE_AWAY')),
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK (
    status IN ('DRAFT', 'AVAILABLE', 'RESERVED', 'COMPLETED', 'GIVEN', 'ARCHIVED')
  ),
  title text NOT NULL,
  description text,
  price_vnd integer CHECK (price_vnd IS NULL OR price_vnd >= 0),
  condition text CHECK (
    condition IS NULL OR condition IN ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR')
  ),
  photo_url text,
  location_label text NOT NULL,
  reserved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reserved_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classified_listings_zone_status_idx
  ON classified_listings (zone_id, status, listing_type);

CREATE INDEX IF NOT EXISTS classified_listings_seller_idx
  ON classified_listings (seller_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS classified_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES classified_listings(id) ON DELETE CASCADE,
  buyer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS classified_reservations_listing_idx
  ON classified_reservations (listing_id, status);

CREATE INDEX IF NOT EXISTS classified_reservations_buyer_idx
  ON classified_reservations (buyer_user_id, created_at DESC);
