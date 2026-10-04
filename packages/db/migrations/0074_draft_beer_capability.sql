-- Allow Ops to store DRAFT_BEER_SALES on the existing capability table.

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
      'RESERVATION',
      'DRAFT_BEER_SALES'
    )
  );
