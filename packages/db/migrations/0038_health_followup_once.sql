-- Nhắc tái khám: mỗi khách chỉ có tối đa một lời nhắc đang chờ hoặc đã gửi
-- tại cùng phòng khám (hủy rồi mới được đặt lại).

DROP INDEX IF EXISTS health_followup_pending_unique;

CREATE UNIQUE INDEX IF NOT EXISTS health_followup_once_unique
  ON health_followup_reminders (provider_location_id, customer_user_id)
  WHERE status IN ('SCHEDULED', 'SENT');
