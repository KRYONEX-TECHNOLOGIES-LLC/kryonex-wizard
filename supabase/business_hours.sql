-- Add structured business hours and emergency toggle to profiles
-- Run this migration in Supabase SQL Editor

-- Add business_hours JSONB column for structured hours
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS business_hours jsonb DEFAULT '{
  "monday": {"open": "08:00", "close": "18:00", "closed": false},
  "tuesday": {"open": "08:00", "close": "18:00", "closed": false},
  "wednesday": {"open": "08:00", "close": "18:00", "closed": false},
  "thursday": {"open": "08:00", "close": "18:00", "closed": false},
  "friday": {"open": "08:00", "close": "18:00", "closed": false},
  "saturday": {"open": "09:00", "close": "14:00", "closed": false},
  "sunday": {"open": null, "close": null, "closed": true}
}'::jsonb;

-- Add timezone for accurate time checking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS business_timezone text DEFAULT 'America/Chicago';

-- Add 24/7 emergency toggle
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS emergency_24_7 boolean DEFAULT false;

-- Comment for clarity
COMMENT ON COLUMN public.profiles.business_hours IS 'Structured business hours per day with open/close times (24h format HH:MM) and closed flag';
COMMENT ON COLUMN public.profiles.business_timezone IS 'IANA timezone for business hours (e.g. America/New_York)';
COMMENT ON COLUMN public.profiles.emergency_24_7 IS 'If true, after-hours check always returns open for emergency calls';
