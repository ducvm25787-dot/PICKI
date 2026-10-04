-- New dishes and homepage posts wait for Ops before customers see them.
-- DRAFT offerings already exist. Daily posts gain a review state.

ALTER TABLE provider_daily_updates DROP CONSTRAINT IF EXISTS pdu_status_check;
ALTER TABLE provider_daily_updates
  ADD CONSTRAINT pdu_status_check
  CHECK (status IN ('ACTIVE', 'EXPIRED', 'HIDDEN', 'PENDING_REVIEW', 'REJECTED'));
