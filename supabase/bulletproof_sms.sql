-- Bulletproof SMS System - Database Migration
-- Run this in Supabase SQL Editor
-- Implements: Thread locking, collision detection, per-customer rate limiting

-- =============================================================================
-- Table: phone_thread_owner (Sticky Thread Lock)
-- Purpose: Tracks which tenant owns the conversation with a customer phone
-- Updated on every outbound SMS, expires after 72 hours
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.phone_thread_owner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_number text NOT NULL,              -- Customer phone number (normalized)
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  locked_until timestamptz NOT NULL,      -- Expires after 72h from last outbound
  last_outbound_at timestamptz DEFAULT now(),
  business_name text,                     -- Cached for disambiguation prompts
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(from_number)
);

-- Enable RLS
ALTER TABLE public.phone_thread_owner ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view own thread locks" ON public.phone_thread_owner;
CREATE POLICY "Users can view own thread locks" ON public.phone_thread_owner
  FOR SELECT USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "Service role can manage thread locks" ON public.phone_thread_owner;
CREATE POLICY "Service role can manage thread locks" ON public.phone_thread_owner
  FOR ALL USING (true);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_phone_thread_owner_from_number ON public.phone_thread_owner(from_number);
CREATE INDEX IF NOT EXISTS idx_phone_thread_owner_tenant_id ON public.phone_thread_owner(tenant_id);
CREATE INDEX IF NOT EXISTS idx_phone_thread_owner_locked_until ON public.phone_thread_owner(locked_until);

COMMENT ON TABLE public.phone_thread_owner IS 'Sticky thread lock for SMS routing - prevents cross-tenant message mix-ups';
COMMENT ON COLUMN public.phone_thread_owner.from_number IS 'Customer phone number (E.164 format)';
COMMENT ON COLUMN public.phone_thread_owner.tenant_id IS 'User ID who owns this conversation';
COMMENT ON COLUMN public.phone_thread_owner.locked_until IS 'Thread lock expires 72h after last outbound SMS';

-- =============================================================================
-- Table: sms_inbound_rate_limits (Per-Customer Rate Limiting)
-- Purpose: Prevents customers from spamming inbound SMS
-- Limits: 5 per 10 minutes, 20 per day
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.sms_inbound_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_number text NOT NULL,
  window_date date NOT NULL DEFAULT CURRENT_DATE,
  count_10min integer DEFAULT 0,
  count_daily integer DEFAULT 0,
  last_message_at timestamptz DEFAULT now(),
  blocked_until timestamptz,              -- Set when rate limit exceeded
  block_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(from_number, window_date)
);

-- Enable RLS
ALTER TABLE public.sms_inbound_rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin/service role only)
DROP POLICY IF EXISTS "Service role can manage rate limits" ON public.sms_inbound_rate_limits;
CREATE POLICY "Service role can manage rate limits" ON public.sms_inbound_rate_limits
  FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sms_inbound_rate_from_number ON public.sms_inbound_rate_limits(from_number);
CREATE INDEX IF NOT EXISTS idx_sms_inbound_rate_blocked ON public.sms_inbound_rate_limits(blocked_until) 
  WHERE blocked_until IS NOT NULL;

COMMENT ON TABLE public.sms_inbound_rate_limits IS 'Per-customer inbound SMS rate limiting to prevent spam';

-- =============================================================================
-- Table: sms_collision_log (Collision Detection Audit)
-- Purpose: Tracks when disambiguation was needed (multiple tenants contacted same phone)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.sms_collision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_number text NOT NULL,              -- Customer who replied
  tenant_ids uuid[] NOT NULL,             -- Array of conflicting tenant IDs
  business_names text[],                  -- Array of business names involved
  disambiguation_sent boolean DEFAULT false,
  customer_choice integer,                -- Which option they picked (1, 2, etc.)
  resolved_tenant_id uuid,                -- Final routing destination
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_collision_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage collision logs" ON public.sms_collision_log;
CREATE POLICY "Service role can manage collision logs" ON public.sms_collision_log
  FOR ALL USING (true);

-- Index for lookup
CREATE INDEX IF NOT EXISTS idx_sms_collision_from_number ON public.sms_collision_log(from_number);
CREATE INDEX IF NOT EXISTS idx_sms_collision_pending ON public.sms_collision_log(from_number, resolved_at) 
  WHERE resolved_at IS NULL;

COMMENT ON TABLE public.sms_collision_log IS 'Audit log for SMS routing collisions requiring disambiguation';

-- =============================================================================
-- Table: sms_outbound_throttle (Per-Tenant Outbound Throttling)
-- Purpose: Prevents tenants from blasting too many SMS too fast
-- Limit: 60 SMS per minute per tenant
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.sms_outbound_throttle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_minute timestamptz NOT NULL,     -- Truncated to minute
  count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, window_minute)
);

-- Enable RLS
ALTER TABLE public.sms_outbound_throttle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage throttle" ON public.sms_outbound_throttle;
CREATE POLICY "Service role can manage throttle" ON public.sms_outbound_throttle
  FOR ALL USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_sms_outbound_throttle_tenant ON public.sms_outbound_throttle(tenant_id, window_minute);

COMMENT ON TABLE public.sms_outbound_throttle IS 'Per-tenant outbound SMS throttling (60/min max)';

-- =============================================================================
-- Table: sms_keyword_responses (Keyword Auto-Response Tracking)
-- Purpose: Tracks automated responses to keywords (STOP, HELP, YES, NO, etc.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.sms_keyword_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_number text NOT NULL,
  tenant_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  keyword_detected text NOT NULL,         -- STOP, HELP, YES, NO, CONFIRM, RESCHEDULE
  original_body text,                     -- Full message content
  auto_response_sent text,                -- What we replied with
  action_taken text,                      -- opt_out, confirmed, declined, link_sent, etc.
  appointment_id uuid,                    -- If tied to an appointment
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sms_keyword_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own keyword responses" ON public.sms_keyword_responses;
CREATE POLICY "Users can view own keyword responses" ON public.sms_keyword_responses
  FOR SELECT USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "Service role can manage keyword responses" ON public.sms_keyword_responses;
CREATE POLICY "Service role can manage keyword responses" ON public.sms_keyword_responses
  FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sms_keyword_from_number ON public.sms_keyword_responses(from_number);
CREATE INDEX IF NOT EXISTS idx_sms_keyword_tenant ON public.sms_keyword_responses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_keyword_created ON public.sms_keyword_responses(created_at DESC);

COMMENT ON TABLE public.sms_keyword_responses IS 'Tracks keyword detection and auto-responses for inbound SMS';

-- =============================================================================
-- Add required columns to messages table
-- =============================================================================
-- First ensure base columns exist (from shared_sms_upgrade)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS from_number text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS to_number text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Add bulletproof SMS columns
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS keyword_detected text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS auto_handled boolean DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS routing_method text;

-- Basic indexes for conversation lookup
CREATE INDEX IF NOT EXISTS idx_messages_from_number ON public.messages(from_number);
CREATE INDEX IF NOT EXISTS idx_messages_to_number ON public.messages(to_number);
CREATE INDEX IF NOT EXISTS idx_messages_user_direction ON public.messages(user_id, direction);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

-- Composite index for conversation routing query
CREATE INDEX IF NOT EXISTS idx_messages_conversation_lookup 
  ON public.messages(to_number, direction, created_at DESC) 
  WHERE direction = 'outbound';

-- Index for finding unhandled inbound messages
CREATE INDEX IF NOT EXISTS idx_messages_inbound_unhandled 
  ON public.messages(user_id, direction, auto_handled, created_at DESC)
  WHERE direction = 'inbound';

-- =============================================================================
-- Cleanup function: Remove expired thread locks (older than 72h)
-- Can be called by a cron job or manually
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_thread_locks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.phone_thread_owner
  WHERE locked_until < now();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_thread_locks IS 'Removes expired thread locks older than 72 hours';

-- =============================================================================
-- Cleanup function: Reset daily rate limit counters
-- Should be called at midnight or via cron
-- =============================================================================
CREATE OR REPLACE FUNCTION reset_daily_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.sms_inbound_rate_limits
  SET count_daily = 0,
      count_10min = 0,
      blocked_until = NULL,
      block_reason = NULL,
      updated_at = now()
  WHERE window_date < CURRENT_DATE;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

COMMENT ON FUNCTION reset_daily_rate_limits IS 'Resets daily SMS rate limit counters';
