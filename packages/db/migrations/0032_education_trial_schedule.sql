-- S32: Education trial lesson schedule on service requests

ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check CHECK (
  status IN (
    'OPEN',
    'CONFIRMED',
    'UPCOMING',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
    'PROVIDER_REJECTED'
  )
);

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS trial_scheduled_at timestamptz;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS trial_location_type text
  CHECK (trial_location_type IS NULL OR trial_location_type IN ('OFFLINE', 'ONLINE'));
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS trial_location_detail text;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS trial_online_platform text
  CHECK (
    trial_online_platform IS NULL OR trial_online_platform IN ('ZOOM', 'GOOGLE_MEET', 'OTHER')
  );
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS trial_teacher_name text;
