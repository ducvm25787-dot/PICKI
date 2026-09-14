-- Grab-like handoff: provider confirms handoff before runner pickup

ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_handoff_at timestamptz;
