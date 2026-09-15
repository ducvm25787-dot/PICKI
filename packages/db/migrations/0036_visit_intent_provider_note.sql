-- Visit intent: provider reject reason

ALTER TABLE beauty_visit_intents
  ADD COLUMN IF NOT EXISTS provider_note text;
