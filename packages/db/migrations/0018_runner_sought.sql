-- Provider explicitly dispatches to runners (Grab-like)

ALTER TABLE orders ADD COLUMN IF NOT EXISTS runner_sought_at timestamptz;
