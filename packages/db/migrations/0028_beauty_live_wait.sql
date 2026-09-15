-- S31: Beauty Live Wait — queue estimate on live status + CUSTOMER_VISIT offerings

ALTER TABLE provider_live_status
  ADD COLUMN IF NOT EXISTS estimated_wait_minutes integer
  CHECK (estimated_wait_minutes IS NULL OR estimated_wait_minutes >= 0);

ALTER TABLE offerings DROP CONSTRAINT IF EXISTS offerings_fulfillment_mode_check;
ALTER TABLE offerings ADD CONSTRAINT offerings_fulfillment_mode_check CHECK (
  fulfillment_mode IS NULL OR fulfillment_mode IN (
    'INSTANT', 'PREORDER', 'PICKUP', 'PICKUP_AND_RETURN', 'ON_SITE',
    'PROVIDER_VISIT', 'CUSTOMER_VISIT'
  )
);
