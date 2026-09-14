-- Delivery handoff mode + address reference on orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_handoff_mode text NOT NULL DEFAULT 'LOBBY_PICKUP';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address_id uuid REFERENCES addresses(id) ON DELETE SET NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_handoff_mode_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_handoff_mode_check CHECK (
  delivery_handoff_mode IN ('LOBBY_PICKUP', 'DOOR_DELIVERY')
);
