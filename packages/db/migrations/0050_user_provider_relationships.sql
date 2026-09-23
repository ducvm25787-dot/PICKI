-- Habit-First P0: user ↔ provider_location relationship (familiar ≠ favorite)

CREATE TABLE IF NOT EXISTS user_provider_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider_location_id uuid NOT NULL REFERENCES provider_locations (id) ON DELETE CASCADE,
  favorite boolean NOT NULL DEFAULT false,
  completed_interactions integer NOT NULL DEFAULT 0
    CHECK (completed_interactions >= 0),
  last_interaction_at timestamptz,
  relationship_score integer NOT NULL DEFAULT 0,
  relationship_status text NOT NULL DEFAULT 'NEW'
    CHECK (relationship_status IN ('NEW', 'RETURNING', 'REGULAR', 'VIP')),
  hidden_by_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_provider_relationships_unique UNIQUE (user_id, provider_location_id)
);

CREATE INDEX IF NOT EXISTS user_provider_relationships_user_score_idx
  ON user_provider_relationships (user_id, relationship_score DESC)
  WHERE hidden_by_user = false;

CREATE INDEX IF NOT EXISTS user_provider_relationships_location_idx
  ON user_provider_relationships (provider_location_id);
