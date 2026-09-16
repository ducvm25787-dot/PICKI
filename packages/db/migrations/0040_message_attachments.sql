-- Tin nhắn có thể kèm ảnh (hỏi thuốc nhà thuốc, v.v.)
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS attachment_urls jsonb NOT NULL DEFAULT '[]';
