-- Create consent_logs table for tracking user consent acceptance
-- Run this migration in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.consent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version text NOT NULL DEFAULT '1.0',
  ip text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own consent logs
DROP POLICY IF EXISTS "Users can read own consent logs" ON public.consent_logs;
CREATE POLICY "Users can read own consent logs" ON public.consent_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Service role can insert (backend only)
DROP POLICY IF EXISTS "Service role can insert consent logs" ON public.consent_logs;
CREATE POLICY "Service role can insert consent logs" ON public.consent_logs
  FOR INSERT WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_consent_logs_user_id ON public.consent_logs(user_id);

-- Also ensure profiles has the consent columns
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS consent_accepted_at timestamptz;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS consent_version text DEFAULT '1.0';

COMMENT ON TABLE public.consent_logs IS 'Audit log for user consent acceptance with IP and user agent tracking';
