-- Step 1 delivery foundation.
-- Money identity and delivery_fee_vnd = customer_delivery_fee are service rules, not CHECK constraints.
-- runner_payable is not required to equal delivery_fee_base.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_mode text NOT NULL DEFAULT 'PICKEE_RUNNER',
  ADD COLUMN IF NOT EXISTS delivery_fee_base integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_delivery_fee integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_delivery_subsidy integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pickee_delivery_subsidy integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS runner_payable integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_delivery_earning integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS runner_search_cancelled_at timestamptz;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fulfillment_mode_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_fulfillment_mode_check
  CHECK (fulfillment_mode IN ('PICKEE_RUNNER', 'PROVIDER_SELF_DELIVERY', 'CUSTOMER_PICKUP'));

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_funding_nonneg_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_delivery_funding_nonneg_check
  CHECK (
    delivery_fee_base >= 0
    AND customer_delivery_fee >= 0
    AND provider_delivery_subsidy >= 0
    AND pickee_delivery_subsidy >= 0
    AND runner_payable >= 0
    AND provider_delivery_earning >= 0
  );

-- Backfill. runner_sought_at alone is not evidence that a Pickee runner delivered the order.
WITH evidence AS (
  SELECT o.id
  FROM orders o
  WHERE o.runner_user_id IS NOT NULL
     OR o.status IN ('RUNNER_ASSIGNED', 'PICKED_UP', 'RETURN_RUNNER_ASSIGNED', 'RETURN_PICKED_UP')
     OR EXISTS (
       SELECT 1
       FROM order_status_history h
       WHERE h.order_id = o.id
         AND h.to_status IN (
           'RUNNER_ASSIGNED',
           'PICKED_UP',
           'RETURN_RUNNER_ASSIGNED',
           'RETURN_PICKED_UP'
         )
     )
     OR EXISTS (
       SELECT 1
       FROM runner_order_offers r
       WHERE r.order_id = o.id
         AND r.status = 'ACCEPTED'
     )
),
classified AS (
  SELECT
    o.id,
    o.service_vertical,
    o.order_kind,
    o.status,
    o.laundry_pickup_mode,
    o.runner_user_id,
    o.runner_sought_at,
    o.delivery_fee_vnd AS legacy_fee,
    (e.id IS NOT NULL) AS has_runner,
    (
      o.service_vertical <> 'LAUNDRY'
      AND o.order_kind IN ('FAMILY_DINNER', 'LATE_DINNER', 'BREAKFAST_PREORDER')
    ) AS cook_first
  FROM orders o
  LEFT JOIN evidence e ON e.id = o.id
)
UPDATE orders o
SET
  fulfillment_mode = CASE
    WHEN c.has_runner THEN 'PICKEE_RUNNER'
    WHEN c.cook_first
      AND c.runner_user_id IS NULL
      AND c.status IN ('DELIVERING', 'DELIVERED')
      THEN 'PROVIDER_SELF_DELIVERY'
    WHEN c.service_vertical = 'LAUNDRY'
      AND c.runner_user_id IS NULL
      AND NOT c.has_runner
      AND c.status IN ('RETURN_DELIVERING', 'COMPLETED')
      AND c.laundry_pickup_mode IS DISTINCT FROM 'ON_SITE'
      THEN 'PROVIDER_SELF_DELIVERY'
    ELSE 'PICKEE_RUNNER'
  END,
  delivery_fee_base = CASE
    WHEN c.service_vertical = 'LAUNDRY' THEN 0
    ELSE c.legacy_fee
  END,
  customer_delivery_fee = CASE
    WHEN c.service_vertical = 'LAUNDRY' THEN 0
    ELSE c.legacy_fee
  END,
  provider_delivery_subsidy = 0,
  pickee_delivery_subsidy = 0,
  runner_payable = CASE
    WHEN c.has_runner THEN c.legacy_fee
    WHEN c.cook_first
      AND c.runner_user_id IS NULL
      AND c.status IN ('DELIVERING', 'DELIVERED')
      THEN 0
    WHEN c.service_vertical = 'LAUNDRY'
      AND c.runner_user_id IS NULL
      AND NOT c.has_runner
      AND c.status IN ('RETURN_DELIVERING', 'COMPLETED')
      AND c.laundry_pickup_mode IS DISTINCT FROM 'ON_SITE'
      THEN 0
    WHEN c.service_vertical = 'LAUNDRY'
      AND c.status = 'READY_FOR_RETURN'
      AND c.runner_sought_at IS NOT NULL
      AND c.runner_user_id IS NULL
      THEN c.legacy_fee
    WHEN c.service_vertical <> 'LAUNDRY'
      AND NOT c.cook_first
      AND c.status IN ('DELIVERING', 'DELIVERED')
      AND c.runner_user_id IS NULL
      AND NOT c.has_runner
      THEN 0
    WHEN c.service_vertical = 'LAUNDRY' THEN 0
    ELSE c.legacy_fee
  END,
  provider_delivery_earning = CASE
    WHEN c.service_vertical <> 'LAUNDRY'
      AND NOT c.has_runner
      AND c.cook_first
      AND c.runner_user_id IS NULL
      AND c.status IN ('DELIVERING', 'DELIVERED')
      THEN c.legacy_fee
    ELSE 0
  END,
  delivery_fee_vnd = CASE
    WHEN c.service_vertical = 'LAUNDRY' THEN 0
    ELSE c.legacy_fee
  END
FROM classified c
WHERE c.id = o.id;
