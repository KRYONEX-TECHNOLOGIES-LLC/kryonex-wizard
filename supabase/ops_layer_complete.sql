-- Ops Layer Complete Migration
-- Run this in Supabase SQL Editor to add all missing columns/tables

-- ============================================
-- 1. LEADS TABLE - Add columns for call recording storage
-- ============================================
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS recording_url text,
ADD COLUMN IF NOT EXISTS name text,
ADD COLUMN IF NOT EXISTS summary text,
ADD COLUMN IF NOT EXISTS transcript text,
ADD COLUMN IF NOT EXISTS sentiment text,
ADD COLUMN IF NOT EXISTS call_duration_seconds integer,
ADD COLUMN IF NOT EXISTS agent_id text;

-- ============================================
-- 2. USAGE_ALERTS TABLE - For tracking usage threshold alerts
-- ============================================
CREATE TABLE IF NOT EXISTS public.usage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_usage_alerts_user_type 
ON public.usage_alerts(user_id, alert_type);

-- Enable RLS
ALTER TABLE public.usage_alerts ENABLE ROW LEVEL SECURITY;

-- RLS policy for users to see their own alerts (drop first if exists)
DROP POLICY IF EXISTS "Users can view own usage_alerts" ON public.usage_alerts;
CREATE POLICY "Users can view own usage_alerts"
ON public.usage_alerts FOR SELECT
USING (auth.uid() = user_id);

-- ============================================
-- 3. APPOINTMENTS TABLE - Add Cal.com booking reference
-- ============================================
ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS cal_booking_uid text;

-- Index for Cal.com booking lookups (prevent duplicates)
CREATE INDEX IF NOT EXISTS idx_appointments_cal_uid 
ON public.appointments(cal_booking_uid) 
WHERE cal_booking_uid IS NOT NULL;

-- ============================================
-- 4. Verify hard_stop_active column exists (was added earlier)
-- ============================================
ALTER TABLE public.usage_limits 
ADD COLUMN IF NOT EXISTS hard_stop_active boolean DEFAULT false;

-- ============================================
-- Done! Verify by running:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'leads';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'usage_alerts';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments';
-- ============================================
