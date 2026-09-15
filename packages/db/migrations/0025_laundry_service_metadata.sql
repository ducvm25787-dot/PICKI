-- S29+: laundry service metadata — estimated days, ON_SITE, quote pricing

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS estimated_days integer CHECK (estimated_days IS NULL OR estimated_days > 0);

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_fulfillment_mode_check;
ALTER TABLE offerings ADD CONSTRAINT offerings_fulfillment_mode_check CHECK (
  fulfillment_mode IS NULL OR fulfillment_mode IN (
    'INSTANT', 'PREORDER', 'PICKUP', 'PICKUP_AND_RETURN', 'ON_SITE'
  )
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_laundry_pickup_mode_check;
ALTER TABLE orders ADD CONSTRAINT orders_laundry_pickup_mode_check CHECK (
  laundry_pickup_mode IS NULL OR laundry_pickup_mode IN (
    'HOME_PICKUP', 'SHOP_DROP_OFF', 'ON_SITE'
  )
);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS estimated_days integer CHECK (estimated_days IS NULL OR estimated_days > 0);
