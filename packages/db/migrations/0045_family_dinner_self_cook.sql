-- Family Dinner: món cho phép khách chọn Tự nấu (cùng giá Nấu sẵn).
ALTER TABLE family_dinner_menu_items
  ADD COLUMN IF NOT EXISTS allows_self_cook boolean NOT NULL DEFAULT false;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS prep_mode text;

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_prep_mode_check;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_prep_mode_check
  CHECK (prep_mode IS NULL OR prep_mode IN ('READY_COOKED', 'SELF_COOK'));
