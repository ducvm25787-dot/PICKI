-- Admin photos for the home context banner. One meal window, up to 5 images.

CREATE TABLE IF NOT EXISTS home_hero_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id text NOT NULL,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT home_hero_images_context_check CHECK (
    context_id IN (
      'breakfast-morning',
      'lunch',
      'family-dinner',
      'breakfast-preorder',
      'overnight'
    )
  )
);
