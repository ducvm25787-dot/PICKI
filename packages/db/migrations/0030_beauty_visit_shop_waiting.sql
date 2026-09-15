-- S31: Tiệm báo "Đang chờ" khách tới

ALTER TABLE beauty_visit_intents
  ADD COLUMN IF NOT EXISTS shop_waiting_at timestamptz;
