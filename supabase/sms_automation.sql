-- SMS Automation Features Migration
-- Run this in Supabase SQL Editor to enable post-call SMS and review requests

-- ============================================
-- 1. POST-CALL SMS FOLLOW-UP FIELDS
-- ============================================
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS post_call_sms_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS post_call_sms_template text DEFAULT 'Thanks for calling {business}! We appreciate your call and will follow up shortly if needed.',
ADD COLUMN IF NOT EXISTS post_call_sms_delay_seconds integer DEFAULT 60;

-- ============================================
-- 2. REVIEW REQUEST FIELDS (on profiles for account-level settings)
-- ============================================
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS google_review_url text,
ADD COLUMN IF NOT EXISTS review_request_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS review_request_template text DEFAULT 'Thanks for choosing {business}! We hope you had a great experience. Please leave us a review: {review_link}',
ADD COLUMN IF NOT EXISTS review_request_delay_hours integer DEFAULT 24;

-- ============================================
-- 3. SMS AUTOMATION LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.sms_automation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  appointment_id uuid,
  automation_type text NOT NULL,  -- 'post_call', 'review_request', 'appointment_reminder'
  to_number text NOT NULL,
  message_body text NOT NULL,
  status text DEFAULT 'pending',  -- pending, sent, failed, skipped
  sent_at timestamptz,
  error_message text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indexes for SMS automation log
CREATE INDEX IF NOT EXISTS idx_sms_automation_log_user ON public.sms_automation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_automation_log_type ON public.sms_automation_log(automation_type);
CREATE INDEX IF NOT EXISTS idx_sms_automation_log_status ON public.sms_automation_log(status);
CREATE INDEX IF NOT EXISTS idx_sms_automation_log_created ON public.sms_automation_log(created_at);

-- ============================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.sms_automation_log ENABLE ROW LEVEL SECURITY;

-- Users can view their own automation logs
DROP POLICY IF EXISTS "Users can view own sms automation logs" ON public.sms_automation_log;
CREATE POLICY "Users can view own sms automation logs"
ON public.sms_automation_log FOR SELECT
USING (auth.uid() = user_id);

-- Admin full access
DROP POLICY IF EXISTS "Admins full access sms automation logs" ON public.sms_automation_log;
CREATE POLICY "Admins full access sms automation logs"
ON public.sms_automation_log FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ============================================
-- 5. PREMIUM FEATURES TABLE (track which features users have enabled)
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_premium_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  post_call_sms boolean DEFAULT false,
  review_requests boolean DEFAULT false,
  zapier_webhooks boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_user_premium_features_user ON public.user_premium_features(user_id);

-- RLS
ALTER TABLE public.user_premium_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own premium features" ON public.user_premium_features;
CREATE POLICY "Users can view own premium features"
ON public.user_premium_features FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins full access premium features" ON public.user_premium_features;
CREATE POLICY "Admins full access premium features"
ON public.user_premium_features FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ============================================
-- 6. WEBHOOK CONFIGURATIONS TABLE (Zapier Integration)
-- ============================================
CREATE TABLE IF NOT EXISTS public.webhook_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  events text[] DEFAULT '{}',  -- ['call_ended', 'appointment_booked', 'lead_created']
  is_active boolean DEFAULT true,
  secret text,  -- Optional HMAC secret for signing
  headers jsonb DEFAULT '{}',  -- Custom headers
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_configs_user ON public.webhook_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_configs_active ON public.webhook_configs(is_active);

-- RLS
ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own webhooks" ON public.webhook_configs;
CREATE POLICY "Users can manage own webhooks"
ON public.webhook_configs FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins full access webhooks" ON public.webhook_configs;
CREATE POLICY "Admins full access webhooks"
ON public.webhook_configs FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ============================================
-- 7. WEBHOOK DELIVERY LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id uuid REFERENCES public.webhook_configs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status_code integer,
  response_body text,
  error_message text,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON public.webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_user ON public.webhook_deliveries(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON public.webhook_deliveries(created_at);

-- RLS
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Users can view own webhook deliveries"
ON public.webhook_deliveries FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins full access webhook deliveries" ON public.webhook_deliveries;
CREATE POLICY "Admins full access webhook deliveries"
ON public.webhook_deliveries FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- ============================================
-- DONE! Verify by running:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'agents' AND column_name LIKE '%sms%';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles' AND column_name LIKE '%review%';
-- SELECT * FROM public.webhook_configs LIMIT 1;
-- ============================================
