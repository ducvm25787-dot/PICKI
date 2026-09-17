-- Track auto/manual copy source for provider banner ("menu hôm nay lấy từ …")
ALTER TABLE family_dinner_daily_menus
  ADD COLUMN IF NOT EXISTS copied_from_service_date date;
