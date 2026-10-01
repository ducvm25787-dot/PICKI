-- Food daypart: one daily-menu engine for breakfast and lunch.
-- daypart lives on the menu and delivery window only.
-- orders.breakfast_delivery_window_id and order_items.breakfast_menu_item_id
-- stay as compatibility names; both dayparts use those columns.

ALTER TABLE breakfast_preorder_daily_menus
  ADD COLUMN IF NOT EXISTS daypart text NOT NULL DEFAULT 'BREAKFAST';

ALTER TABLE breakfast_preorder_daily_menus
  DROP CONSTRAINT IF EXISTS breakfast_preorder_daily_menu_provider_location_id_service__key;

ALTER TABLE breakfast_preorder_daily_menus
  DROP CONSTRAINT IF EXISTS bf_menus_daypart_check;

ALTER TABLE breakfast_preorder_daily_menus
  ADD CONSTRAINT bf_menus_daypart_check
  CHECK (daypart IN ('BREAKFAST', 'LUNCH'));

ALTER TABLE breakfast_preorder_daily_menus
  DROP CONSTRAINT IF EXISTS bf_menus_location_date_daypart_uidx;

ALTER TABLE breakfast_preorder_daily_menus
  ADD CONSTRAINT bf_menus_location_date_daypart_uidx
  UNIQUE (provider_location_id, service_date, daypart);

ALTER TABLE breakfast_preorder_delivery_windows
  ADD COLUMN IF NOT EXISTS daypart text NOT NULL DEFAULT 'BREAKFAST';

ALTER TABLE breakfast_preorder_delivery_windows
  DROP CONSTRAINT IF EXISTS breakfast_preorder_delivery_w_provider_location_id_service__key;

ALTER TABLE breakfast_preorder_delivery_windows
  DROP CONSTRAINT IF EXISTS bf_windows_daypart_check;

ALTER TABLE breakfast_preorder_delivery_windows
  ADD CONSTRAINT bf_windows_daypart_check
  CHECK (daypart IN ('BREAKFAST', 'LUNCH'));

ALTER TABLE breakfast_preorder_delivery_windows
  DROP CONSTRAINT IF EXISTS bf_windows_location_date_daypart_slot_uidx;

ALTER TABLE breakfast_preorder_delivery_windows
  ADD CONSTRAINT bf_windows_location_date_daypart_slot_uidx
  UNIQUE (provider_location_id, service_date, daypart, starts_at, ends_at);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_order_kind_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_order_kind_check CHECK (
    order_kind IN (
      'STANDARD',
      'FAMILY_DINNER',
      'LATE_DINNER',
      'BREAKFAST_PREORDER',
      'LUNCH'
    )
  );

ALTER TABLE provider_capabilities DROP CONSTRAINT IF EXISTS provider_capabilities_capability_check;
ALTER TABLE provider_capabilities
  ADD CONSTRAINT provider_capabilities_capability_check CHECK (
    capability IN (
      'SELL_NOW',
      'PREORDER',
      'BREAKFAST_PREORDER',
      'FAMILY_DINNER',
      'LATE_NIGHT',
      'LUNCH',
      'COMBO_SET',
      'TODAY_FEATURE',
      'DELIVERY',
      'PICKUP',
      'CATERING',
      'CUSTOM_QUOTE',
      'RESERVATION'
    )
  );
