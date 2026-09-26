-- Organizer self-submit: membership and uploaded images. No ticketing.

CREATE TABLE IF NOT EXISTS experience_organizer_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES experience_organizers (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT experience_organizer_members_uidx UNIQUE (organizer_id, user_id)
);

ALTER TABLE experiences
  ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
