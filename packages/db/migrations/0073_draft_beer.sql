-- Draft beer only. Restriction flag, age declaration, order snapshot.
-- cancel_reason is free text in the database. Services validate it against an enum.

ALTER TABLE offerings
  ADD COLUMN IF NOT EXISTS alcohol_restricted boolean NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS declared_full_name text,
  ADD COLUMN IF NOT EXISTS declared_date_of_birth date,
  ADD COLUMN IF NOT EXISTS age_declared_at timestamptz;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS contains_alcohol boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_age_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_reason text;
