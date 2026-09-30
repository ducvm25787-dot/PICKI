-- Step 2 delivery promotions. Money identity stays in the service layer.
-- Opening Week is a row in this table, not a hard-coded fee rule.

CREATE TABLE IF NOT EXISTS delivery_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sponsor_type text NOT NULL,
  subsidy_mode text NOT NULL,
  zone_id uuid NOT NULL REFERENCES zones (id) ON DELETE RESTRICT,
  provider_id uuid REFERENCES providers (id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  minimum_order_vnd integer NOT NULL DEFAULT 0,
  max_subsidy_per_order_vnd integer NOT NULL,
  provider_share_vnd integer NOT NULL DEFAULT 0,
  pickee_share_vnd integer NOT NULL DEFAULT 0,
  usage_limit_total integer,
  usage_limit_per_user integer,
  usage_limit_per_user_per_day integer,
  budget_vnd integer,
  budget_spent_vnd integer NOT NULL DEFAULT 0,
  eligible_modes text NOT NULL DEFAULT 'PICKEE_RUNNER',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_promotions_sponsor_check CHECK (
    sponsor_type IN ('PROVIDER', 'PICKEE', 'SHARED')
  ),
  CONSTRAINT delivery_promotions_mode_check CHECK (
    subsidy_mode IN ('COVER_UP_TO', 'SHARED_AMOUNTS')
  ),
  CONSTRAINT delivery_promotions_window_check CHECK (ends_at > starts_at),
  CONSTRAINT delivery_promotions_money_nonneg_check CHECK (
    minimum_order_vnd >= 0
    AND max_subsidy_per_order_vnd >= 0
    AND provider_share_vnd >= 0
    AND pickee_share_vnd >= 0
    AND budget_spent_vnd >= 0
    AND (budget_vnd IS NULL OR budget_vnd >= 0)
  )
);

CREATE INDEX IF NOT EXISTS delivery_promotions_zone_active_idx
  ON delivery_promotions (zone_id, active, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS delivery_promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES delivery_promotions (id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
  customer_user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  provider_subsidy_vnd integer NOT NULL DEFAULT 0,
  pickee_subsidy_vnd integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_promotion_redemptions_order_uidx UNIQUE (order_id),
  CONSTRAINT delivery_promotion_redemptions_money_nonneg_check CHECK (
    provider_subsidy_vnd >= 0 AND pickee_subsidy_vnd >= 0
  )
);

CREATE INDEX IF NOT EXISTS delivery_promotion_redemptions_promo_user_idx
  ON delivery_promotion_redemptions (promotion_id, customer_user_id, created_at);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_promotion_id uuid REFERENCES delivery_promotions (id) ON DELETE RESTRICT;
