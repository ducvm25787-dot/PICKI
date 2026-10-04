-- P5 operational finance. Append-only ledger. Commercial terms are snapshotted on the order.
-- payments.order_id stays the order-payment table. Subscription cash uses billing_payments.

CREATE SEQUENCE IF NOT EXISTS payos_order_code_seq AS bigint START WITH 1;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payos_order_code bigint;

CREATE UNIQUE INDEX IF NOT EXISTS payments_payos_order_code_uidx
  ON payments (payos_order_code)
  WHERE payos_order_code IS NOT NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS commercial_fulfillment_status text NOT NULL DEFAULT 'NOT_FULFILLED',
  ADD COLUMN IF NOT EXISTS financial_snapshot jsonb;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_commercial_fulfillment_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_commercial_fulfillment_check
  CHECK (
    commercial_fulfillment_status IN (
      'NOT_FULFILLED',
      'FULFILLED',
      'FULFILLED_AFTER_CANCEL',
      'DISPUTED'
    )
  );

CREATE TABLE IF NOT EXISTS commercial_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL,
  scope_key text NOT NULL DEFAULT '',
  revenue_model text NOT NULL,
  subscription_required boolean NOT NULL DEFAULT false,
  transaction_fee_type text NOT NULL DEFAULT 'NONE',
  transaction_fee_value integer NOT NULL DEFAULT 0,
  transaction_fee_basis text NOT NULL DEFAULT 'MERCHANDISE_GMV',
  policy_source text NOT NULL DEFAULT 'DEFAULT',
  note text,
  contract_ref text,
  version integer NOT NULL DEFAULT 1,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commercial_policies_scope_check CHECK (
    scope_type IN ('SYSTEM', 'PROVIDER_TYPE', 'PROVIDER', 'CITY', 'ZONE', 'LOCATION')
  ),
  CONSTRAINT commercial_policies_model_check CHECK (
    revenue_model IN ('FREE', 'SUBSCRIPTION', 'TRANSACTION_FEE', 'HYBRID', 'ENTERPRISE')
  ),
  CONSTRAINT commercial_policies_fee_type_check CHECK (
    transaction_fee_type IN ('NONE', 'PERCENT', 'FIXED')
  ),
  CONSTRAINT commercial_policies_basis_check CHECK (
    transaction_fee_basis IN (
      'MERCHANDISE_GMV',
      'MERCHANDISE_AFTER_PROVIDER_DISCOUNT',
      'ORDER_FIXED'
    )
  ),
  CONSTRAINT commercial_policies_source_check CHECK (
    policy_source IN ('DEFAULT', 'CONTRACT', 'PROMOTION', 'MANUAL_OVERRIDE')
  ),
  CONSTRAINT commercial_policies_fee_nonneg CHECK (transaction_fee_value >= 0),
  CONSTRAINT commercial_policies_version_check CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS commercial_policies_open_uidx
  ON commercial_policies (scope_type, scope_key)
  WHERE effective_to IS NULL;

CREATE TABLE IF NOT EXISTS provider_subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  provider_type text,
  max_locations integer,
  max_members integer,
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  grace_period_days integer NOT NULL DEFAULT 7,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_subscription_plans_grace_check CHECK (grace_period_days >= 0)
);

CREATE TABLE IF NOT EXISTS provider_subscription_plan_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES provider_subscription_plans (id) ON DELETE CASCADE,
  duration_months integer NOT NULL,
  price_vnd integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_subscription_plan_prices_duration_check CHECK (
    duration_months IN (1, 3, 6, 12, 36)
  ),
  CONSTRAINT provider_subscription_plan_prices_amount_check CHECK (price_vnd >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_subscription_plan_prices_uidx
  ON provider_subscription_plan_prices (plan_id, duration_months)
  WHERE active = true;

CREATE TABLE IF NOT EXISTS provider_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers (id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES provider_subscription_plans (id) ON DELETE RESTRICT,
  plan_price_id uuid NOT NULL REFERENCES provider_subscription_plan_prices (id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL,
  auto_renew_requested boolean NOT NULL DEFAULT false,
  grace_period_days integer NOT NULL DEFAULT 7,
  next_billing_at timestamptz,
  last_invoice_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_subscriptions_status_check CHECK (
    status IN ('TRIAL', 'ACTIVE', 'GRACE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED')
  ),
  CONSTRAINT provider_subscriptions_grace_check CHECK (grace_period_days >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_subscriptions_one_open_uidx
  ON provider_subscriptions (provider_id)
  WHERE status <> 'CANCELLED';

CREATE TABLE IF NOT EXISTS provider_billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers (id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES provider_subscriptions (id) ON DELETE RESTRICT,
  invoice_type text NOT NULL DEFAULT 'SUBSCRIPTION',
  amount_vnd integer NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  paid_at timestamptz,
  billing_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_billing_invoices_type_check CHECK (invoice_type IN ('SUBSCRIPTION')),
  CONSTRAINT provider_billing_invoices_status_check CHECK (
    status IN ('DRAFT', 'OPEN', 'PAID', 'VOID', 'OVERDUE')
  ),
  CONSTRAINT provider_billing_invoices_amount_check CHECK (amount_vnd >= 0)
);

CREATE TABLE IF NOT EXISTS billing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL UNIQUE REFERENCES provider_billing_invoices (id) ON DELETE RESTRICT,
  amount_vnd integer NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  provider_kind text NOT NULL DEFAULT 'DEV_STUB',
  provider_ref text,
  payos_order_code bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_payments_status_check CHECK (
    status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED')
  ),
  CONSTRAINT billing_payments_amount_check CHECK (amount_vnd >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_payments_payos_order_code_uidx
  ON billing_payments (payos_order_code)
  WHERE payos_order_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_payment_id uuid NOT NULL REFERENCES billing_payments (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS financial_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type text NOT NULL,
  status text NOT NULL DEFAULT 'POSTED',
  order_id uuid REFERENCES orders (id) ON DELETE RESTRICT,
  provider_id uuid REFERENCES providers (id) ON DELETE RESTRICT,
  provider_location_id uuid REFERENCES provider_locations (id) ON DELETE RESTRICT,
  zone_id uuid REFERENCES zones (id) ON DELETE RESTRICT,
  city_id uuid REFERENCES experience_cities (id) ON DELETE RESTRICT,
  campaign_id uuid REFERENCES provider_campaigns (id) ON DELETE RESTRICT,
  runner_user_id uuid REFERENCES users (id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES payments (id) ON DELETE RESTRICT,
  billing_payment_id uuid REFERENCES billing_payments (id) ON DELETE RESTRICT,
  amount_vnd integer NOT NULL,
  currency text NOT NULL DEFAULT 'VND',
  from_party text NOT NULL,
  to_party text NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz NOT NULL DEFAULT now(),
  reversal_of_id uuid REFERENCES financial_ledger_entries (id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_ledger_status_check CHECK (status = 'POSTED'),
  CONSTRAINT financial_ledger_amount_check CHECK (amount_vnd >= 0),
  CONSTRAINT financial_ledger_currency_check CHECK (currency = 'VND'),
  CONSTRAINT financial_ledger_type_check CHECK (
    entry_type IN (
      'MERCHANDISE_GMV',
      'CUSTOMER_DELIVERY_FEE',
      'PLATFORM_FEE',
      'RUNNER_PAYABLE',
      'PROVIDER_DELIVERY_SUBSIDY',
      'PICKEE_DELIVERY_SUBSIDY',
      'PROVIDER_FUNDED_DISCOUNT',
      'PICKEE_FUNDED_DISCOUNT',
      'PAYMENT_RECEIVED',
      'PAYMENT_SENT',
      'SUBSCRIPTION_REVENUE',
      'REFUND',
      'ADJUSTMENT',
      'REVERSAL'
    )
  )
);

CREATE INDEX IF NOT EXISTS financial_ledger_order_idx ON financial_ledger_entries (order_id);
CREATE INDEX IF NOT EXISTS financial_ledger_provider_idx ON financial_ledger_entries (provider_id);
CREATE INDEX IF NOT EXISTS financial_ledger_zone_idx ON financial_ledger_entries (zone_id);
CREATE INDEX IF NOT EXISTS financial_ledger_city_idx ON financial_ledger_entries (city_id);

CREATE OR REPLACE FUNCTION financial_ledger_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'posted ledger entries cannot be updated or deleted';
END;
$$;

DROP TRIGGER IF EXISTS financial_ledger_no_mutate ON financial_ledger_entries;
CREATE TRIGGER financial_ledger_no_mutate
  BEFORE UPDATE OR DELETE ON financial_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION financial_ledger_immutable();

CREATE TABLE IF NOT EXISTS settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_type text NOT NULL,
  party_id uuid NOT NULL,
  zone_id uuid REFERENCES zones (id) ON DELETE RESTRICT,
  city_id uuid REFERENCES experience_cities (id) ON DELETE RESTRICT,
  amount_vnd integer NOT NULL,
  direction text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  reference text,
  note text,
  paid_at timestamptz,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlements_party_check CHECK (party_type IN ('PROVIDER', 'RUNNER')),
  CONSTRAINT settlements_direction_check CHECK (direction IN ('PAYABLE', 'RECEIVABLE')),
  CONSTRAINT settlements_status_check CHECK (status IN ('OPEN', 'PAID', 'RECEIVED')),
  CONSTRAINT settlements_amount_check CHECK (amount_vnd >= 0)
);

CREATE TABLE IF NOT EXISTS provider_commercial_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES providers (id) ON DELETE RESTRICT,
  standing text NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_commercial_standings_check CHECK (
    standing IN ('NORMAL', 'WATCH', 'WARNED', 'RESTRICTED', 'BLOCKED')
  )
);

CREATE INDEX IF NOT EXISTS provider_commercial_standings_provider_idx
  ON provider_commercial_standings (provider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS provider_subscription_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES provider_subscriptions (id) ON DELETE CASCADE,
  kind text NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_subscription_notices_kind_check CHECK (
    kind IN (
      'T-14',
      'T-7',
      'T-3',
      'T-1',
      'EXPIRY_DAY',
      'GRACE_WARNING',
      'FINAL_SUSPENSION_WARNING'
    )
  ),
  CONSTRAINT provider_subscription_notices_uidx UNIQUE (subscription_id, kind, period_end)
);
