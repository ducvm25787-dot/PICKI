-- S32: Education — offering metadata + ONLINE fulfillment

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_fulfillment_mode_check;
ALTER TABLE offerings ADD CONSTRAINT offerings_fulfillment_mode_check CHECK (
  fulfillment_mode IS NULL OR fulfillment_mode IN (
    'INSTANT', 'PREORDER', 'PICKUP', 'PICKUP_AND_RETURN', 'ON_SITE',
    'PROVIDER_VISIT', 'CUSTOMER_VISIT', 'ONLINE'
  )
);

ALTER TABLE offerings ADD COLUMN IF NOT EXISTS education_subject text;
ALTER TABLE offerings ADD COLUMN IF NOT EXISTS education_grade text;
