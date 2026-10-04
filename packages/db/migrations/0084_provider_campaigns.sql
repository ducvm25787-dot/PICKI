-- P4 chain campaigns: one campaign, central approval, local suppression.
-- Local hero stays on provider_daily_updates. No finance ledger.

CREATE TABLE IF NOT EXISTS provider_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  campaign_type text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  approval_status text NOT NULL DEFAULT 'NONE',
  content_revision integer NOT NULL DEFAULT 1,
  approved_revision integer,
  approved_snapshot jsonb,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users (id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_campaigns_type_check CHECK (
    campaign_type IN (
      'HERO_PRODUCT',
      'TODAY_FEATURE',
      'PRICE_PROMOTION',
      'DELIVERY_SUBSIDY',
      'CONTENT_CAMPAIGN'
    )
  ),
  CONSTRAINT provider_campaigns_status_check CHECK (
    status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAUSED', 'REJECTED')
  ),
  CONSTRAINT provider_campaigns_approval_check CHECK (
    approval_status IN ('NONE', 'PENDING', 'APPROVED', 'REJECTED')
  ),
  CONSTRAINT provider_campaigns_window_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS provider_campaigns_provider_status_idx
  ON provider_campaigns (provider_id, status, starts_at);

CREATE TABLE IF NOT EXISTS provider_campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES provider_campaigns (id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  CONSTRAINT provider_campaign_targets_type_check CHECK (
    target_type IN ('PROVIDER', 'CITY', 'ZONE', 'LOCATION')
  ),
  CONSTRAINT provider_campaign_targets_uidx UNIQUE (campaign_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS provider_campaign_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES provider_campaigns (id) ON DELETE CASCADE,
  offering_id uuid REFERENCES offerings (id) ON DELETE RESTRICT,
  campaign_price integer,
  discount_amount integer,
  discount_percent integer,
  hero_priority integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT provider_campaign_items_price_check CHECK (campaign_price IS NULL OR campaign_price >= 0),
  CONSTRAINT provider_campaign_items_discount_check CHECK (discount_amount IS NULL OR discount_amount >= 0),
  CONSTRAINT provider_campaign_items_percent_check CHECK (
    discount_percent IS NULL OR (discount_percent >= 1 AND discount_percent <= 99)
  )
);

CREATE INDEX IF NOT EXISTS provider_campaign_items_offering_idx
  ON provider_campaign_items (offering_id);

CREATE TABLE IF NOT EXISTS provider_campaign_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES provider_campaigns (id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE CASCADE,
  provider_location_id uuid REFERENCES provider_locations (id) ON DELETE CASCADE,
  suppressed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  lifted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_campaign_suppressions_zone_uidx
  ON provider_campaign_suppressions (campaign_id, zone_id)
  WHERE provider_location_id IS NULL AND lifted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS provider_campaign_suppressions_location_uidx
  ON provider_campaign_suppressions (campaign_id, provider_location_id)
  WHERE provider_location_id IS NOT NULL AND lifted_at IS NULL;

-- One order can carry more than one campaign. P5 reads this. Checkout does not price from it yet.
CREATE TABLE IF NOT EXISTS order_campaign_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES provider_campaigns (id) ON DELETE RESTRICT,
  provider_location_id uuid REFERENCES provider_locations (id) ON DELETE SET NULL,
  offering_id uuid REFERENCES offerings (id) ON DELETE SET NULL,
  attribution_kind text NOT NULL,
  campaign_price integer,
  discount_amount integer,
  discount_percent integer,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_campaign_attributions_kind_check CHECK (
    attribution_kind IN (
      'HERO_PRODUCT',
      'TODAY_FEATURE',
      'PRICE_PROMOTION',
      'DELIVERY_SUBSIDY',
      'CONTENT_CAMPAIGN'
    )
  ),
  CONSTRAINT order_campaign_attributions_uidx UNIQUE (order_id, campaign_id, offering_id, attribution_kind)
);

CREATE INDEX IF NOT EXISTS order_campaign_attributions_campaign_idx
  ON order_campaign_attributions (campaign_id);

COMMENT ON TABLE provider_campaigns IS
  'Chain campaign. ACTIVE and ENDED are derived from APPROVED plus the time window. Zone admins do not approve these.';
