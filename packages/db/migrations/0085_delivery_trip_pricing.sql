-- P4.5 trip-class runner pricing. Reuses zone_places and the delivery funding columns.
-- Customer fee, provider subsidy, and Pickee subsidy stay on the existing funding snapshot.

ALTER TABLE zone_fulfillment_settings
  ADD COLUMN IF NOT EXISTS same_building_base_fee integer NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS building_to_building_base_fee integer NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS ground_to_building_base_fee integer NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS building_to_ground_base_fee integer NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS ground_to_ground_base_fee integer NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS minimum_runner_payable integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hot_food_surcharge integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heavy_surcharge integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bulky_surcharge integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS batch_extra_order_fee integer NOT NULL DEFAULT 2000;

ALTER TABLE zone_fulfillment_settings DROP CONSTRAINT IF EXISTS zone_fulfillment_trip_fee_check;
ALTER TABLE zone_fulfillment_settings
  ADD CONSTRAINT zone_fulfillment_trip_fee_check CHECK (
    same_building_base_fee >= 0
    AND building_to_building_base_fee >= 0
    AND ground_to_building_base_fee >= 0
    AND building_to_ground_base_fee >= 0
    AND ground_to_ground_base_fee >= 0
    AND minimum_runner_payable >= 0
    AND hot_food_surcharge >= 0
    AND heavy_surcharge >= 0
    AND bulky_surcharge >= 0
    AND batch_extra_order_fee >= 0
  );

ALTER TABLE zone_places
  ADD COLUMN IF NOT EXISTS door_surcharge integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slow_elevator_surcharge integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS elevator_wait_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anchor_code text;

ALTER TABLE zone_places DROP CONSTRAINT IF EXISTS zone_places_kind_check;
ALTER TABLE zone_places
  ADD CONSTRAINT zone_places_kind_check CHECK (
    kind IN (
      'BUILDING',
      'AREA',
      'TRADITIONAL_MARKET',
      'RESIDENTIAL_PODIUM_CLUSTER',
      'GROUND_STREET_CLUSTER'
    )
  );

ALTER TABLE zone_places DROP CONSTRAINT IF EXISTS zone_places_surcharge_check;
ALTER TABLE zone_places
  ADD CONSTRAINT zone_places_surcharge_check CHECK (
    door_surcharge >= 0
    AND slow_elevator_surcharge >= 0
    AND elevator_wait_minutes >= 0
    AND elevator_wait_minutes <= 180
  );

ALTER TABLE provider_locations
  ADD COLUMN IF NOT EXISTS zone_place_id uuid REFERENCES zone_places (id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_pricing_snapshot jsonb;

ALTER TABLE delivery_routes
  ADD COLUMN IF NOT EXISTS runner_payable integer NOT NULL DEFAULT 0;

ALTER TABLE route_orders
  ADD COLUMN IF NOT EXISTS runner_cost_allocation integer NOT NULL DEFAULT 0;

ALTER TABLE delivery_routes DROP CONSTRAINT IF EXISTS delivery_routes_runner_payable_check;
ALTER TABLE delivery_routes
  ADD CONSTRAINT delivery_routes_runner_payable_check CHECK (runner_payable >= 0);

ALTER TABLE route_orders DROP CONSTRAINT IF EXISTS route_orders_allocation_check;
ALTER TABLE route_orders
  ADD CONSTRAINT route_orders_allocation_check CHECK (runner_cost_allocation >= 0);
