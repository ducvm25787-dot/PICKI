-- Sprint 2: Identity & Auth

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text,
  active_zone_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_user_id text NOT NULL,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_identities_provider_check CHECK (
    provider IN ('PHONE', 'EMAIL', 'ZALO', 'APPLE', 'GOOGLE')
  ),
  CONSTRAINT user_identities_provider_external_unique UNIQUE (provider, external_user_id)
);

CREATE INDEX IF NOT EXISTS user_identities_user_id_idx ON user_identities (user_id);

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL,
  scope_type text,
  scope_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_role_check CHECK (
    role IN (
      'CUSTOMER',
      'PROVIDER_OWNER',
      'PROVIDER_MANAGER',
      'PROVIDER_STAFF',
      'RUNNER',
      'ZONE_AGENT',
      'ZONE_OPERATOR',
      'SUPPORT',
      'FINANCE',
      'ZONE_ADMIN',
      'SUPER_ADMIN'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_global_unique
  ON user_roles (user_id, role)
  WHERE scope_type IS NULL AND scope_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_scoped_unique
  ON user_roles (user_id, role, scope_type, scope_id)
  WHERE scope_type IS NOT NULL AND scope_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON user_roles (user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at_idx ON auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS auth_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  destination text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_otp_channel_check CHECK (channel IN ('PHONE', 'EMAIL'))
);

CREATE INDEX IF NOT EXISTS auth_otp_destination_created_idx
  ON auth_otp_challenges (destination, created_at DESC);

ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL;
