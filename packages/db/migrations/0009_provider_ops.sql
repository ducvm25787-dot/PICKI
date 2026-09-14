-- Sprint 25: Provider staff + order runner assignment column

CREATE TABLE IF NOT EXISTS provider_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers (id) ON DELETE CASCADE,
  provider_location_id uuid REFERENCES provider_locations (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'STAFF',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_members_role_check CHECK (role IN ('OWNER', 'MANAGER', 'STAFF')),
  UNIQUE (user_id, provider_id, provider_location_id)
);

CREATE INDEX IF NOT EXISTS provider_members_user_id_idx ON provider_members (user_id);
CREATE INDEX IF NOT EXISTS provider_members_provider_id_idx ON provider_members (provider_id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS runner_user_id uuid REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_runner_user_id_idx ON orders (runner_user_id);
