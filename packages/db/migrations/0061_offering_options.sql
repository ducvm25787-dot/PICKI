-- Phase C: size / add-on choices on a catalog dish. Price delta is added at checkout.

CREATE TABLE IF NOT EXISTS offering_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES offerings (id) ON DELETE CASCADE,
  name text NOT NULL,
  selection text NOT NULL DEFAULT 'SINGLE',
  required boolean NOT NULL DEFAULT false,
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offering_option_groups_offering_idx
  ON offering_option_groups (offering_id, sort_order);

CREATE TABLE IF NOT EXISTS offering_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES offering_option_groups (id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta_vnd integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offering_options_group_idx
  ON offering_options (group_id, sort_order);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS option_snapshot jsonb;
