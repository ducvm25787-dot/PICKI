-- Soft-delete offerings so the provider can undo from the product list.
-- Order lines keep their snapshot; DELETED rows stay out of menus (status = ACTIVE only).

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_status_check;
ALTER TABLE offerings
  ADD CONSTRAINT offerings_status_check
  CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED', 'DELETED'));
