-- S29 Laundry: service vertical on orders + pickup-and-return route stops

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_vertical text NOT NULL DEFAULT 'FOOD';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_service_vertical_check;
ALTER TABLE orders ADD CONSTRAINT orders_service_vertical_check
  CHECK (service_vertical IN ('FOOD', 'LAUNDRY'));

ALTER TABLE route_stops DROP CONSTRAINT IF EXISTS route_stops_type_check;
ALTER TABLE route_stops ADD CONSTRAINT route_stops_type_check CHECK (
  stop_type IN (
    'PICKUP',
    'LOBBY_DROPOFF',
    'APARTMENT_DROPOFF',
    'PICKI_POINT',
    'CUSTOMER_PICKUP',
    'PROVIDER_DROPOFF',
    'RETURN_PICKUP',
    'RETURN_DROPOFF'
  )
);

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_fulfillment_mode_check;
ALTER TABLE offerings ADD CONSTRAINT offerings_fulfillment_mode_check CHECK (
  fulfillment_mode IS NULL OR fulfillment_mode IN (
    'INSTANT', 'PREORDER', 'PICKUP', 'PICKUP_AND_RETURN'
  )
);
