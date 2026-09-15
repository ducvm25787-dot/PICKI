-- Runner offer waves: targeted dispatch (3–5 runners), skip/resend

ALTER TABLE zone_fulfillment_settings
  ADD COLUMN IF NOT EXISTS laundry_return_runner_fee_vnd integer NOT NULL DEFAULT 15000;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS runner_offer_wave integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS runner_order_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  runner_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  wave integer NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runner_order_offers_status_check CHECK (
    status IN ('PENDING', 'ACCEPTED', 'SKIPPED', 'EXPIRED', 'SUPERSEDED')
  ),
  CONSTRAINT runner_order_offers_order_runner_wave_unique UNIQUE (order_id, runner_user_id, wave)
);

CREATE INDEX IF NOT EXISTS runner_order_offers_runner_pending_idx
  ON runner_order_offers (runner_user_id, status)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS runner_order_offers_order_idx ON runner_order_offers (order_id);

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
