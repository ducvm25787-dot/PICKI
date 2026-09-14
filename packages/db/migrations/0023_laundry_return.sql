-- S29: laundry return leg statuses + home pickup mode

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'CREATED',
    'PAYMENT_PENDING',
    'PAID',
    'PROVIDER_ACCEPTED',
    'PREPARING',
    'READY',
    'RUNNER_ASSIGNED',
    'PICKED_UP',
    'DELIVERING',
    'DELIVERED',
    'AT_SHOP',
    'PROCESSING',
    'READY_FOR_RETURN',
    'RETURN_RUNNER_ASSIGNED',
    'RETURN_PICKED_UP',
    'RETURN_DELIVERING',
    'COMPLETED',
    'PROVIDER_REJECTED',
    'CUSTOMER_CANCELLED',
    'SYSTEM_CANCELLED',
    'PAYMENT_FAILED',
    'REFUND_PENDING',
    'REFUNDED'
  )
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS laundry_pickup_mode text;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_laundry_pickup_mode_check;
ALTER TABLE orders ADD CONSTRAINT orders_laundry_pickup_mode_check CHECK (
  laundry_pickup_mode IS NULL OR laundry_pickup_mode IN ('HOME_PICKUP', 'SHOP_DROP_OFF')
);
