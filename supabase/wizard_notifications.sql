-- =============================================================================
-- WIZARD NOTIFICATIONS & SMS OPT-OUT MIGRATION
-- Run in Supabase SQL Editor to add new columns and tables for wizard step 3
-- =============================================================================

-- =============================================================================
-- PROFILES TABLE ADDITIONS
-- New columns for Communications step in wizard
-- =============================================================================

-- Add user_personal_phone for receiving SMS notifications about bookings
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_personal_phone text;

COMMENT ON COLUMN public.profiles.user_personal_phone IS 
  'User personal phone for receiving SMS notifications about bookings';

-- Add business_hours JSON column (schedule from wizard step 2)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_hours jsonb;

COMMENT ON COLUMN public.profiles.business_hours IS 
  'JSON object with weekday/saturday/sunday hours from wizard';

-- Add business_timezone for correct time calculations
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_timezone text DEFAULT 'America/Chicago';

COMMENT ON COLUMN public.profiles.business_timezone IS 
  'User timezone for business hours calculations';

-- Add emergency_24_7 toggle
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS emergency_24_7 boolean DEFAULT false;

COMMENT ON COLUMN public.profiles.emergency_24_7 IS 
  'Whether 24/7 emergency dispatching is enabled';

-- Add notification_preferences JSON column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{"email_on_booking": true, "sms_on_booking": true, "email_on_low_usage": true, "sms_on_low_usage": true}'::jsonb;

COMMENT ON COLUMN public.profiles.notification_preferences IS 
  'JSON with email_on_booking, sms_on_booking, email_on_low_usage, and sms_on_low_usage toggles';

-- Migration: Update existing profiles to include new low usage alert preferences
UPDATE public.profiles
SET notification_preferences = notification_preferences || '{"email_on_low_usage": true, "sms_on_low_usage": true}'::jsonb
WHERE notification_preferences IS NOT NULL
  AND NOT (notification_preferences ? 'sms_on_low_usage');

-- =============================================================================
-- AGENTS TABLE ADDITIONS
-- New columns for SMS automation settings
-- =============================================================================

-- Add post_call_sms_enabled toggle
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS post_call_sms_enabled boolean DEFAULT true;

COMMENT ON COLUMN public.agents.post_call_sms_enabled IS 
  'Whether to send post-call thank you SMS to customers';

-- Add confirmation_sms_enabled toggle  
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS confirmation_sms_enabled boolean DEFAULT true;

COMMENT ON COLUMN public.agents.confirmation_sms_enabled IS 
  'Whether to send appointment confirmation SMS to customers';

-- Add schedule_summary text column (human-readable for AI prompt)
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS schedule_summary text;

COMMENT ON COLUMN public.agents.schedule_summary IS 
  'Human-readable schedule summary for AI prompt, e.g., "Monday-Friday 8am-5pm, Saturday 9am-2pm"';

-- Add standard_fee column
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS standard_fee text DEFAULT '89';

COMMENT ON COLUMN public.agents.standard_fee IS 
  'Standard service call fee for AI to quote';

-- Add emergency_fee column
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS emergency_fee text DEFAULT '189';

COMMENT ON COLUMN public.agents.emergency_fee IS 
  'Emergency/after-hours fee for AI to quote';

-- =============================================================================
-- SMS OPT-OUT TRACKING TABLE
-- Tracks customers who reply STOP - CRITICAL FOR LEGAL COMPLIANCE
-- NOTE: This table may already exist. The CREATE IF NOT EXISTS is safe to run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- Which tenant they opted out from (NULL for global)
  phone text NOT NULL,                   -- Customer phone (E.164 format)
  global_opt_out boolean DEFAULT false,  -- True = opted out from shared number (all tenants)
  opted_out_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Unique constraint: one opt-out record per phone per user (or global)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sms_opt_outs_user_phone 
  ON public.sms_opt_outs (user_id, phone) WHERE user_id IS NOT NULL;

-- Index for global opt-out lookups (shared number mode)
CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_global 
  ON public.sms_opt_outs (phone, global_opt_out) WHERE global_opt_out = true;

-- Fast lookup index for checking opt-out before sending
CREATE INDEX IF NOT EXISTS idx_sms_opt_outs_phone 
  ON public.sms_opt_outs (phone);

-- RLS: Only system can manage opt-outs (via supabaseAdmin)
ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;

-- No user-facing policies - all access via supabaseAdmin which bypasses RLS
-- This ensures only the backend can manage opt-outs

COMMENT ON TABLE public.sms_opt_outs IS 
  'Tracks SMS opt-outs (STOP replies). Check before EVERY outbound SMS. CRITICAL FOR LEGAL COMPLIANCE. global_opt_out=true means they opted out from shared number.';

-- =============================================================================
-- TRIGGER FOR UPDATED_AT
-- =============================================================================

CREATE OR REPLACE FUNCTION update_sms_opt_outs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sms_opt_outs_updated_at ON public.sms_opt_outs;
CREATE TRIGGER sms_opt_outs_updated_at
  BEFORE UPDATE ON public.sms_opt_outs
  FOR EACH ROW
  EXECUTE FUNCTION update_sms_opt_outs_updated_at();

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify columns were added
DO $$
BEGIN
  RAISE NOTICE 'Migration complete. Verify with:';
  RAISE NOTICE '  -- Check profiles columns:';
  RAISE NOTICE '  SELECT column_name FROM information_schema.columns WHERE table_name = ''profiles'' AND column_name IN (''user_personal_phone'', ''business_hours'', ''business_timezone'', ''emergency_24_7'', ''notification_preferences'');';
  RAISE NOTICE '  -- Check agents columns:';
  RAISE NOTICE '  SELECT column_name FROM information_schema.columns WHERE table_name = ''agents'' AND column_name IN (''post_call_sms_enabled'', ''confirmation_sms_enabled'', ''schedule_summary'', ''standard_fee'', ''emergency_fee'');';
  RAISE NOTICE '  -- Check sms_opt_outs table:';
  RAISE NOTICE '  SELECT column_name FROM information_schema.columns WHERE table_name = ''sms_opt_outs'';';
END $$;
