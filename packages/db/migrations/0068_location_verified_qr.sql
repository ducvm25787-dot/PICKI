-- Pickee Verified sticker: one opaque token per verified location.
-- The QR stores only this token. Renames do not require a reprint.
-- Reissue replaces the column. audit_logs record the action, not the token.

ALTER TABLE provider_locations
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS verification_note text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_qr_token text,
  ADD COLUMN IF NOT EXISTS verified_qr_issued_at timestamptz;

ALTER TABLE provider_locations
  DROP CONSTRAINT IF EXISTS provider_locations_verification_status_check;

ALTER TABLE provider_locations
  ADD CONSTRAINT provider_locations_verification_status_check
  CHECK (verification_status IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'));

ALTER TABLE provider_locations
  DROP CONSTRAINT IF EXISTS provider_locations_verified_qr_only_when_verified_check;

ALTER TABLE provider_locations
  ADD CONSTRAINT provider_locations_verified_qr_only_when_verified_check
  CHECK (verified_qr_token IS NULL OR verification_status = 'VERIFIED');

ALTER TABLE provider_locations
  DROP CONSTRAINT IF EXISTS provider_locations_verified_qr_token_key;

ALTER TABLE provider_locations
  ADD CONSTRAINT provider_locations_verified_qr_token_key
  UNIQUE (verified_qr_token);
