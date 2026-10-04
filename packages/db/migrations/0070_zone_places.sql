-- Building and area access. Local knowledge: elevator, card, security, call-up.
-- Wait minutes × VND/minute is added to runner payable only. Customer fee stays on the delivery base.

CREATE TABLE IF NOT EXISTS zone_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id uuid NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  kind text NOT NULL,
  code text NOT NULL,
  display_name text NOT NULL,
  elevator_note text,
  access_card_required boolean NOT NULL DEFAULT false,
  security_note text,
  call_up_required boolean NOT NULL DEFAULT false,
  door_delivery_allowed boolean NOT NULL DEFAULT true,
  lobby_wait_minutes integer NOT NULL DEFAULT 0,
  door_wait_minutes integer NOT NULL DEFAULT 0,
  runner_fee_per_minute_vnd integer NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zone_places_kind_check CHECK (kind IN ('BUILDING', 'AREA')),
  CONSTRAINT zone_places_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  CONSTRAINT zone_places_wait_check CHECK (
    lobby_wait_minutes >= 0
    AND lobby_wait_minutes <= 180
    AND door_wait_minutes >= 0
    AND door_wait_minutes <= 180
    AND runner_fee_per_minute_vnd >= 0
  ),
  CONSTRAINT zone_places_zone_code_uidx UNIQUE (zone_id, code)
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS runner_wait_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS runner_wait_fee_vnd integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_access_note text;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_runner_wait_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_runner_wait_check CHECK (
    runner_wait_minutes >= 0
    AND runner_wait_fee_vnd >= 0
  );

INSERT INTO zone_places (zone_id, kind, code, display_name)
SELECT z.id, 'BUILDING', v.code, v.display_name
FROM zones z
CROSS JOIN (
  VALUES
    ('CT12', 'CT12'),
    ('CT12A', 'CT12A'),
    ('CT11', 'CT11')
) AS v(code, display_name)
WHERE z.slug = 'kim-van-kim-lu'
ON CONFLICT (zone_id, code) DO NOTHING;
