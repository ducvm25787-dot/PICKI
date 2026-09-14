-- Pilot: estimated ready time for early runner dispatch

ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_estimated_ready_at_idx
  ON orders (estimated_ready_at)
  WHERE estimated_ready_at IS NOT NULL;
