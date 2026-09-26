-- Hanoi experiences P0: discovery, import drafts, save/interest. No ticketing.

CREATE TABLE IF NOT EXISTS experience_organizers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_fold text NOT NULL,
  website_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS experience_organizers_name_fold_idx
  ON experience_organizers (name_fold);

CREATE TABLE IF NOT EXISTS experience_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_fold text NOT NULL,
  address text,
  address_fold text NOT NULL DEFAULT '',
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS experience_venues_name_fold_idx
  ON experience_venues (name_fold, address_fold);

CREATE TABLE IF NOT EXISTS experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  title_fold text NOT NULL,
  city text NOT NULL DEFAULT 'Hanoi',
  summary text NOT NULL,
  why_go text NOT NULL,
  body text,
  organizer_id uuid NOT NULL REFERENCES experience_organizers (id) ON DELETE RESTRICT,
  venue_id uuid NOT NULL REFERENCES experience_venues (id) ON DELETE RESTRICT,
  price_mode text NOT NULL,
  price_from_vnd integer,
  price_to_vnd integer,
  price_note text,
  age_note text,
  language text,
  duration_minutes integer,
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  audiences jsonb NOT NULL DEFAULT '[]'::jsonb,
  booking_url text,
  cover_url text,
  media_status text NOT NULL DEFAULT 'PLACEHOLDER',
  booking_deadline timestamptz,
  registration_deadline timestamptz,
  sold_out boolean NOT NULL DEFAULT false,
  featured_rank integer,
  status text NOT NULL DEFAULT 'DRAFT',
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  published_at timestamptz,
  published_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experiences_city_chk CHECK (city = 'Hanoi'),
  CONSTRAINT experiences_price_mode_chk CHECK (price_mode IN ('FREE', 'PRICED', 'UNKNOWN')),
  CONSTRAINT experiences_price_values_chk CHECK (
    (
      price_mode = 'FREE'
      AND price_from_vnd IS NULL
      AND price_to_vnd IS NULL
    )
    OR (
      price_mode = 'UNKNOWN'
      AND price_from_vnd IS NULL
      AND price_to_vnd IS NULL
    )
    OR (
      price_mode = 'PRICED'
      AND price_from_vnd IS NOT NULL
      AND price_from_vnd >= 0
      AND (price_to_vnd IS NULL OR price_to_vnd >= price_from_vnd)
    )
  ),
  CONSTRAINT experiences_status_chk CHECK (
    status IN ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'EXPIRED')
  ),
  CONSTRAINT experiences_media_chk CHECK (
    media_status IN ('READY', 'NEEDS_REVIEW', 'PLACEHOLDER')
  )
);

CREATE INDEX IF NOT EXISTS experiences_status_idx ON experiences (status);
CREATE INDEX IF NOT EXISTS experiences_title_fold_idx ON experiences (title_fold);

CREATE TABLE IF NOT EXISTS experience_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS experience_occurrences_start_idx
  ON experience_occurrences (experience_id, start_at);

CREATE TABLE IF NOT EXISTS experience_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experience_id uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  source_url text NOT NULL,
  source_name text NOT NULL,
  source_type text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experience_sources_type_chk CHECK (
    source_type IN ('OFFICIAL', 'ORGANIZER', 'VENUE', 'TICKETING', 'CURATED', 'OTHER')
  )
);

CREATE INDEX IF NOT EXISTS experience_sources_experience_idx
  ON experience_sources (experience_id);

CREATE TABLE IF NOT EXISTS experience_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  experience_id uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  save_for text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experience_saves_user_experience_uidx UNIQUE (user_id, experience_id)
);

CREATE TABLE IF NOT EXISTS experience_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  experience_id uuid NOT NULL REFERENCES experiences (id) ON DELETE CASCADE,
  remind_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experience_interests_user_experience_uidx UNIQUE (user_id, experience_id)
);
