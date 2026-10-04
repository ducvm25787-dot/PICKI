-- Runner identity for real operations: CCCD, vehicle papers, payout account.
-- Stored now so Ops can attach them before live dispatch rules depend on them.
-- Payout fields are a record only. Picki does not transfer money to this account.

ALTER TABLE runners
  ADD COLUMN IF NOT EXISTS cccd_number text,
  ADD COLUMN IF NOT EXISTS cccd_full_name text,
  ADD COLUMN IF NOT EXISTS cccd_front_file text,
  ADD COLUMN IF NOT EXISTS cccd_back_file text,
  ADD COLUMN IF NOT EXISTS vehicle_plate text,
  ADD COLUMN IF NOT EXISTS vehicle_doc_file text,
  ADD COLUMN IF NOT EXISTS payout_bank_name text,
  ADD COLUMN IF NOT EXISTS payout_account_number text,
  ADD COLUMN IF NOT EXISTS payout_account_holder text,
  ADD COLUMN IF NOT EXISTS credentials_updated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS runners_cccd_number_uidx
  ON runners (cccd_number)
  WHERE cccd_number IS NOT NULL;
