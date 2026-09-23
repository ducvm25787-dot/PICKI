-- Habit-First P1: Today updates + lean provider loyalty (no coins)

CREATE TABLE IF NOT EXISTS provider_daily_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE CASCADE,
  update_type text NOT NULL,
  title text NOT NULL,
  description text,
  image_url text,
  linked_entity_type text,
  linked_entity_id uuid,
  cta_label text,
  cta_href text,
  valid_from timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pdu_type_check CHECK (
    update_type IN (
      'TODAY_AVAILABLE',
      'DAILY_SPECIAL',
      'NEW_ITEM',
      'OPEN_SLOT',
      'LOW_STOCK',
      'LATE_DINNER',
      'PROMOTION',
      'NEW_SERVICE'
    )
  ),
  CONSTRAINT pdu_status_check CHECK (status IN ('ACTIVE', 'EXPIRED', 'HIDDEN')),
  CONSTRAINT pdu_linked_type_check CHECK (
    linked_entity_type IS NULL OR linked_entity_type IN (
      'OFFERING', 'FAMILY_DINNER_ITEM', 'BREAKFAST_ITEM', 'LOCATION'
    )
  )
);

CREATE INDEX IF NOT EXISTS provider_daily_updates_loc_active_idx
  ON provider_daily_updates (provider_location_id, expires_at)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS provider_loyalty_programs (
  provider_location_id uuid PRIMARY KEY REFERENCES provider_locations (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  regular_threshold integer NOT NULL DEFAULT 5 CHECK (regular_threshold >= 1),
  vip_threshold integer NOT NULL DEFAULT 15 CHECK (vip_threshold >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plp_thresholds_check CHECK (vip_threshold > regular_threshold)
);

CREATE TABLE IF NOT EXISTS provider_loyalty_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE CASCADE,
  tier text NOT NULL,
  benefit_type text NOT NULL,
  title text NOT NULL,
  description text,
  discount_percent integer CHECK (discount_percent IS NULL OR (discount_percent > 0 AND discount_percent <= 100)),
  custom_text text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plb_tier_check CHECK (tier IN ('REGULAR', 'VIP')),
  CONSTRAINT plb_type_check CHECK (
    benefit_type IN (
      'DISCOUNT_PERCENT',
      'FREE_ITEM',
      'FREE_DELIVERY',
      'PRIORITY_SLOT',
      'EARLY_ACCESS',
      'CUSTOM_TEXT'
    )
  )
);

CREATE INDEX IF NOT EXISTS provider_loyalty_benefits_loc_idx
  ON provider_loyalty_benefits (provider_location_id)
  WHERE active = true;
