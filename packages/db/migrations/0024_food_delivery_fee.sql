-- S30: Food delivery fee (Zone flat pilot) — ADR-041

ALTER TABLE zone_fulfillment_settings
  ADD COLUMN IF NOT EXISTS food_delivery_fee_vnd integer NOT NULL DEFAULT 15000
    CHECK (food_delivery_fee_vnd >= 0),
  ADD COLUMN IF NOT EXISTS food_door_delivery_fee_vnd integer NOT NULL DEFAULT 20000
    CHECK (food_door_delivery_fee_vnd >= 0);
