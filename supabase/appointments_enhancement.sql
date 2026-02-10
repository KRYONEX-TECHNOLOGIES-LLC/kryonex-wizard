-- ============================================================================
-- APPOINTMENTS TABLE ENHANCEMENT MIGRATION
-- Adds additional fields for richer appointment data
-- ============================================================================

-- Add issue_type column to appointments (e.g., NO_HEAT, NO_AC, LEAK)
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS issue_type TEXT;

-- Add source column to track where booking originated
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS source TEXT;

-- Add duration_minutes column (default 60)
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;

-- Add customer_email column if not exists
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- Add service_address as alias/alternative to location
-- (Some code uses service_address, some uses location - supporting both)
COMMENT ON COLUMN appointments.location IS 'Service address/location for the appointment';

-- ============================================================================
-- PROFILES TABLE ENHANCEMENT
-- Add appointment_sms_enabled for owner notification preferences
-- ============================================================================

-- Add appointment_sms_enabled to profiles (controls owner notifications)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS appointment_sms_enabled BOOLEAN DEFAULT true;

-- Add phone column to profiles if not exists (for owner SMS notifications)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS phone TEXT;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on source for filtering by booking source
CREATE INDEX IF NOT EXISTS idx_appointments_source ON appointments(source);

-- Index on issue_type for filtering by service type
CREATE INDEX IF NOT EXISTS idx_appointments_issue_type ON appointments(issue_type);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN appointments.issue_type IS 'Type of service issue (e.g., NO_HEAT, NO_AC, LEAK, MAINTENANCE)';
COMMENT ON COLUMN appointments.source IS 'Booking source (retell_calcom, retell_internal, manual, cal.com_webhook)';
COMMENT ON COLUMN appointments.duration_minutes IS 'Appointment duration in minutes';
COMMENT ON COLUMN appointments.customer_email IS 'Customer email address';
COMMENT ON COLUMN profiles.appointment_sms_enabled IS 'Whether to send SMS notifications to owner for new appointments';
COMMENT ON COLUMN profiles.phone IS 'Business owner phone number for notifications';
