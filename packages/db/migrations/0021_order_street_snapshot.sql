-- Street / ground address snapshot on orders (§116)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address_type text NOT NULL DEFAULT 'RESIDENTIAL';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_house_number text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_alley text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_street text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_ward text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_city text;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_address_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_address_type_check CHECK (
  delivery_address_type IN ('RESIDENTIAL', 'WORKPLACE', 'STREET_ADDRESS', 'TEMPORARY', 'OTHER')
);
