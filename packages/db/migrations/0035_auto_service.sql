-- S34: Xe máy / Ô tô — rửa & bơm lốp (queue) + dịch vụ liên hệ trực tiếp

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_fulfillment_mode_check;
ALTER TABLE offerings ADD CONSTRAINT offerings_fulfillment_mode_check CHECK (
  fulfillment_mode IS NULL OR fulfillment_mode IN (
    'INSTANT', 'PREORDER', 'PICKUP', 'PICKUP_AND_RETURN', 'ON_SITE',
    'PROVIDER_VISIT', 'CUSTOMER_VISIT', 'ONLINE', 'CONTACT_ONLY'
  )
);
