-- Admin Zone Setup: manual shop pin verification (ADR-052)

ALTER TABLE provider_locations
  ADD COLUMN IF NOT EXISTS pin_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS pin_verified_by uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pin_note text;
