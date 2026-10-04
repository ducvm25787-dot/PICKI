-- Zone snapshot on ops audit events. Null stays global and is not shown in Zone nhật ký.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES zones (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS audit_logs_zone_created_idx
  ON audit_logs (zone_id, created_at DESC);

COMMENT ON COLUMN audit_logs.zone_id IS
  'Zone of this ops event. Null = global log, visible on Global nhật ký only.';
