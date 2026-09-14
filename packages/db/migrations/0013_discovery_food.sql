-- S11–S18: Live availability, discovery food metadata, reviews, favorites, daily specials

ALTER TABLE provider_live_status
  ADD COLUMN IF NOT EXISTS prep_minutes integer CHECK (prep_minutes IS NULL OR prep_minutes >= 0),
  ADD COLUMN IF NOT EXISTS eta_minutes integer CHECK (eta_minutes IS NULL OR eta_minutes >= 0);

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS food_moment text,
  ADD COLUMN IF NOT EXISTS fulfillment_mode text,
  ADD COLUMN IF NOT EXISTS payment_policy text;

ALTER TABLE offerings
  ADD CONSTRAINT offerings_food_moment_check CHECK (
    food_moment IS NULL OR food_moment IN (
      'BREAKFAST_PREORDER',
      'BREAKFAST_INSTANT',
      'LUNCH',
      'DINNER',
      'SNACK',
      'GROCERY',
      'FAMILY_MEAL'
    )
  );

ALTER TABLE offerings
  ADD CONSTRAINT offerings_fulfillment_mode_check CHECK (
    fulfillment_mode IS NULL OR fulfillment_mode IN ('INSTANT', 'PREORDER', 'PICKUP')
  );

ALTER TABLE offerings
  ADD CONSTRAINT offerings_payment_policy_check CHECK (
    payment_policy IS NULL OR payment_policy IN (
      'PREPAY_REQUIRED',
      'PREPAY_PREFERRED',
      'COD_ALLOWED'
    )
  );

CREATE TABLE IF NOT EXISTS daily_specials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES offerings (id) ON DELETE CASCADE,
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE CASCADE,
  available_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity_total integer NOT NULL CHECK (quantity_total > 0),
  quantity_remaining integer NOT NULL CHECK (quantity_remaining >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_specials_offering_location_date_unique UNIQUE (
    offering_id,
    provider_location_id,
    available_date
  )
);

CREATE TABLE IF NOT EXISTS location_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE CASCADE,
  customer_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders (id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_reviews_user_location_unique UNIQUE (provider_location_id, customer_user_id)
);

CREATE TABLE IF NOT EXISTS user_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_favorites_unique UNIQUE (user_id, provider_location_id)
);

CREATE INDEX IF NOT EXISTS daily_specials_location_date_idx
  ON daily_specials (provider_location_id, available_date);
CREATE INDEX IF NOT EXISTS location_reviews_location_id_idx ON location_reviews (provider_location_id);
CREATE INDEX IF NOT EXISTS user_favorites_user_id_idx ON user_favorites (user_id);
