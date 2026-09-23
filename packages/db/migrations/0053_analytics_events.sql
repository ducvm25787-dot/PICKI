-- Habit-First S-H7: lean product analytics (append-only)

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  zone_id uuid,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_events_name_check CHECK (
    char_length(event_name) BETWEEN 1 AND 80
  )
);

CREATE INDEX IF NOT EXISTS analytics_events_created_idx
  ON analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx
  ON analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_user_created_idx
  ON analytics_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
