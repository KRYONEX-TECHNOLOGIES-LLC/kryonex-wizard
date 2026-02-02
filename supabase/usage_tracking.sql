-- Usage Tracking Tables - REQUIRED for minutes/SMS tracking to work
-- Run this migration in Supabase SQL Editor

-- Table: usage_limits - Core usage tracking per user (create if not exists)
CREATE TABLE IF NOT EXISTS public.usage_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_used_seconds integer DEFAULT 0,
  call_cap_seconds integer DEFAULT 0,
  sms_used integer DEFAULT 0,
  sms_cap integer DEFAULT 0,
  grace_seconds integer DEFAULT 600,
  period_start timestamptz DEFAULT now(),
  period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own usage_limits" ON public.usage_limits;
CREATE POLICY "Users can view own usage_limits" ON public.usage_limits
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage usage_limits" ON public.usage_limits;
CREATE POLICY "Service role can manage usage_limits" ON public.usage_limits
  FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS idx_usage_limits_user_id ON public.usage_limits(user_id);

-- Table: usage_calls - Tracks individual call records for billing/analytics
CREATE TABLE IF NOT EXISTS public.usage_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text,
  call_id text,
  seconds integer NOT NULL DEFAULT 0,
  cost_cents integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Table: usage_sms - Tracks individual SMS records for billing/analytics
CREATE TABLE IF NOT EXISTS public.usage_sms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id text,
  segments integer DEFAULT 1,
  cost_cents integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Table: usage_snapshots - Point-in-time usage snapshots
CREATE TABLE IF NOT EXISTS public.usage_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text,
  minutes_used integer DEFAULT 0,
  cap_minutes integer DEFAULT 0,
  remaining_minutes integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Table: unknown_phone - Store unattributed calls for review
CREATE TABLE IF NOT EXISTS public.unknown_phone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text,
  event_type text,
  raw_payload jsonb,
  received_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.usage_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_sms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unknown_phone ENABLE ROW LEVEL SECURITY;

-- RLS Policies for usage_calls
DROP POLICY IF EXISTS "Users can view own usage_calls" ON public.usage_calls;
CREATE POLICY "Users can view own usage_calls" ON public.usage_calls
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage usage_calls" ON public.usage_calls;
CREATE POLICY "Service role can manage usage_calls" ON public.usage_calls
  FOR ALL USING (true);

-- RLS Policies for usage_sms
DROP POLICY IF EXISTS "Users can view own usage_sms" ON public.usage_sms;
CREATE POLICY "Users can view own usage_sms" ON public.usage_sms
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage usage_sms" ON public.usage_sms;
CREATE POLICY "Service role can manage usage_sms" ON public.usage_sms
  FOR ALL USING (true);

-- RLS Policies for usage_snapshots
DROP POLICY IF EXISTS "Users can view own usage_snapshots" ON public.usage_snapshots;
CREATE POLICY "Users can view own usage_snapshots" ON public.usage_snapshots
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage usage_snapshots" ON public.usage_snapshots;
CREATE POLICY "Service role can manage usage_snapshots" ON public.usage_snapshots
  FOR ALL USING (true);

-- RLS Policies for unknown_phone (admin only basically)
DROP POLICY IF EXISTS "Service role can manage unknown_phone" ON public.unknown_phone;
CREATE POLICY "Service role can manage unknown_phone" ON public.unknown_phone
  FOR ALL USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_calls_user_id ON public.usage_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_calls_created_at ON public.usage_calls(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_sms_user_id ON public.usage_sms(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_sms_created_at ON public.usage_sms(created_at);
CREATE INDEX IF NOT EXISTS idx_usage_snapshots_user_id ON public.usage_snapshots(user_id);

-- Ensure usage_limits has all required columns
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS call_used_seconds integer DEFAULT 0;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS call_cap_seconds integer DEFAULT 0;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS sms_used integer DEFAULT 0;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS sms_cap integer DEFAULT 0;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS grace_seconds integer DEFAULT 600;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS call_credit_seconds integer DEFAULT 0;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS rollover_seconds integer DEFAULT 0;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS sms_credit integer DEFAULT 0;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS period_start timestamptz;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS period_end timestamptz;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS limit_state text DEFAULT 'active';
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS soft_limit_threshold integer DEFAULT 80;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS hard_limit_threshold integer DEFAULT 100;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS force_pause boolean DEFAULT false;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS force_resume boolean DEFAULT false;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS hard_stop_active boolean DEFAULT false;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS last_warning_at timestamptz;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS last_block_at timestamptz;
ALTER TABLE public.usage_limits ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON TABLE public.usage_calls IS 'Individual call records for usage tracking and billing';
COMMENT ON TABLE public.usage_sms IS 'Individual SMS records for usage tracking and billing';
COMMENT ON TABLE public.usage_snapshots IS 'Point-in-time usage snapshots for debugging/audit';
COMMENT ON TABLE public.unknown_phone IS 'Unattributed calls for manual review';
