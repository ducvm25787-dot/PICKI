-- S41: Family Dinner — category RICE (Cơm)
ALTER TABLE family_dinner_menu_items
  DROP CONSTRAINT IF EXISTS fd_items_category_check;

ALTER TABLE family_dinner_menu_items
  ADD CONSTRAINT fd_items_category_check CHECK (
    category IN ('MAIN', 'SIDE', 'VEGETABLE', 'SOUP', 'RICE', 'EXTRA')
  );

ALTER TABLE order_items
  DROP CONSTRAINT IF EXISTS order_items_fd_category_check;

ALTER TABLE order_items
  ADD CONSTRAINT order_items_fd_category_check CHECK (
    family_dinner_category IS NULL
    OR family_dinner_category IN ('MAIN', 'SIDE', 'VEGETABLE', 'SOUP', 'RICE', 'EXTRA')
  );
