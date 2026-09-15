-- S36: Phòng khám (Health) — LISTING + LIVE_STATUS + QUEUE_STATUS + CONTACT
-- Master Spec §86: professional verification bắt buộc; không lưu triệu chứng,
-- chẩn đoán hay hồ sơ điều trị trong Picki. Nhắc tái khám chỉ gồm khách + mốc giờ.

ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS license_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS health_followup_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_location_id uuid NOT NULL REFERENCES provider_locations(id) ON DELETE CASCADE,
  customer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'SENT', 'CANCELLED')),
  remind_at timestamptz NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS health_followup_due_idx
  ON health_followup_reminders (status, remind_at);

CREATE INDEX IF NOT EXISTS health_followup_location_idx
  ON health_followup_reminders (provider_location_id, remind_at DESC);

-- Một khách chỉ có một lời nhắc đang chờ cho cùng mốc giờ tại cùng phòng khám
CREATE UNIQUE INDEX IF NOT EXISTS health_followup_pending_unique
  ON health_followup_reminders (provider_location_id, customer_user_id, remind_at)
  WHERE status = 'SCHEDULED';
