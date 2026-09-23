-- Habit-First S-H3: search extensions + synonyms

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Wrapper so we can use unaccent in expressions safely
CREATE OR REPLACE FUNCTION picki_unaccent(text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;

CREATE TABLE IF NOT EXISTS search_synonyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical text NOT NULL,
  variant text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_synonyms_unique UNIQUE (canonical, variant)
);

CREATE INDEX IF NOT EXISTS search_synonyms_variant_trgm_idx
  ON search_synonyms USING gin (variant gin_trgm_ops);

INSERT INTO search_synonyms (canonical, variant) VALUES
  ('giao hàng', 'ship'),
  ('giao hàng', 'delivery'),
  ('dọn nhà', 'giúp việc'),
  ('điều hòa', 'sửa lạnh'),
  ('điều hòa', 'máy lạnh'),
  ('bữa tối', 'cơm nhà'),
  ('bữa tối', 'family dinner'),
  ('ăn sáng', 'sáng mai'),
  ('cắt tóc', 'cắt tóc trẻ em'),
  ('giặt', 'nước giặt'),
  ('giặt', 'laundry')
ON CONFLICT DO NOTHING;
