-- =============================================================================
-- GOD-TIER LAUNCH HARDENING - DATABASE MIGRATIONS
-- Complete infrastructure for customer retention, observability, and security
-- =============================================================================

-- =============================================================================
-- PART 1: CUSTOMER HEALTH SCORING SYSTEM
-- =============================================================================

-- Main health scores table - tracks current health state per user
CREATE TABLE IF NOT EXISTS public.customer_health_scores (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer CHECK (score >= 0 AND score <= 100),
  grade text CHECK (grade IN ('A', 'B', 'C', 'D', 'F')),
  usage_score integer CHECK (usage_score >= 0 AND usage_score <= 100),
  engagement_score integer CHECK (engagement_score >= 0 AND engagement_score <= 100),
  feature_adoption_score integer CHECK (feature_adoption_score >= 0 AND feature_adoption_score <= 100),
  payment_score integer CHECK (payment_score >= 0 AND payment_score <= 100),
  churn_risk text CHECK (churn_risk IN ('low', 'medium', 'high', 'critical')),
  factors jsonb DEFAULT '{}'::jsonb,
  last_activity_at timestamptz,
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Health score history for trend analysis
CREATE TABLE IF NOT EXISTS public.customer_health_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer,
  grade text,
  churn_risk text,
  factors jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_health_history_user_date 
  ON public.customer_health_history(user_id, created_at DESC);

-- Churn prevention alerts
CREATE TABLE IF NOT EXISTS public.churn_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('score_drop', 'inactivity', 'usage_decline', 'payment_issue')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  message text,
  score_before integer,
  score_after integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  email_sent boolean DEFAULT false,
  email_sent_at timestamptz,
  acknowledged boolean DEFAULT false,
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_at timestamptz,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_churn_alerts_user ON public.churn_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_churn_alerts_unresolved ON public.churn_alerts(resolved, created_at DESC) WHERE resolved = false;

-- RLS for health scores
ALTER TABLE public.customer_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_health_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.churn_alerts ENABLE ROW LEVEL SECURITY;

-- Users can view their own health score
CREATE POLICY "users_view_own_health" ON public.customer_health_scores
  FOR SELECT USING (auth.uid() = user_id);

-- Admins have full access
CREATE POLICY "admins_full_health_scores" ON public.customer_health_scores
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admins_full_health_history" ON public.customer_health_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admins_full_churn_alerts" ON public.churn_alerts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- PART 2: OBSERVABILITY - ERROR TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type text NOT NULL DEFAULT 'Error',
  error_message text,
  stack_trace text,
  context jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  request_id text,
  endpoint text,
  method text,
  ip_address text,
  user_agent text,
  resolved boolean DEFAULT false,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON public.error_logs(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_unresolved ON public.error_logs(resolved, created_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON public.error_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_type ON public.error_logs(error_type, created_at DESC);

-- RLS for error logs (admin only)
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_full_error_logs" ON public.error_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- PART 3: OBSERVABILITY - OPS ALERTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ops_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL,
  message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  source text, -- 'webhook', 'error_rate', 'latency', 'payment', 'system'
  acknowledged boolean DEFAULT false,
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_at timestamptz,
  resolved boolean DEFAULT false,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  auto_resolved boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_severity ON public.ops_alerts(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_unacked ON public.ops_alerts(acknowledged, created_at DESC) WHERE acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_ops_alerts_type ON public.ops_alerts(alert_type, created_at DESC);

-- RLS for ops alerts (admin only)
ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_full_ops_alerts" ON public.ops_alerts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- PART 4: OBSERVABILITY - LATENCY TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.latency_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  method text NOT NULL,
  duration_ms integer NOT NULL,
  status_code integer,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_id text,
  is_slow boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Partition-friendly index for time-based queries
CREATE INDEX IF NOT EXISTS idx_latency_logs_time ON public.latency_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_latency_logs_slow ON public.latency_logs(is_slow, created_at DESC) WHERE is_slow = true;
CREATE INDEX IF NOT EXISTS idx_latency_logs_endpoint ON public.latency_logs(endpoint, created_at DESC);

-- RLS (admin only)
ALTER TABLE public.latency_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_full_latency_logs" ON public.latency_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- PART 5: SESSION SECURITY
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.active_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  ip_address text,
  user_agent text,
  device_type text, -- 'desktop', 'mobile', 'tablet'
  last_active_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason text
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.active_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.active_sessions(user_id, revoked_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_token ON public.active_sessions(token_hash);

-- RLS for sessions
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_sessions" ON public.active_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "admins_full_sessions" ON public.active_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- PART 6: WEBHOOK DELIVERY ENHANCEMENTS
-- =============================================================================

-- Add retry tracking columns to webhook_deliveries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_deliveries' AND column_name = 'retry_count'
  ) THEN
    ALTER TABLE public.webhook_deliveries ADD COLUMN retry_count integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_deliveries' AND column_name = 'next_retry_at'
  ) THEN
    ALTER TABLE public.webhook_deliveries ADD COLUMN next_retry_at timestamptz;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_deliveries' AND column_name = 'max_retries'
  ) THEN
    ALTER TABLE public.webhook_deliveries ADD COLUMN max_retries integer DEFAULT 3;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_deliveries' AND column_name = 'delivery_status'
  ) THEN
    ALTER TABLE public.webhook_deliveries ADD COLUMN delivery_status text DEFAULT 'pending';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'webhook_deliveries' AND column_name = 'last_error'
  ) THEN
    ALTER TABLE public.webhook_deliveries ADD COLUMN last_error text;
  END IF;
END $$;

-- Index for retry queue
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry 
  ON public.webhook_deliveries(delivery_status, next_retry_at) 
  WHERE delivery_status = 'failed' AND retry_count < 3;

-- =============================================================================
-- PART 7: UPGRADE PROMPT TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.upgrade_prompts_shown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_type text NOT NULL,
  trigger_reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  clicked boolean DEFAULT false,
  clicked_at timestamptz,
  dismissed boolean DEFAULT false,
  dismissed_at timestamptz,
  converted boolean DEFAULT false,
  converted_at timestamptz,
  shown_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_upgrade_prompts_user ON public.upgrade_prompts_shown(user_id, shown_at DESC);
CREATE INDEX IF NOT EXISTS idx_upgrade_prompts_type ON public.upgrade_prompts_shown(prompt_type, shown_at DESC);

-- RLS
ALTER TABLE public.upgrade_prompts_shown ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_prompts" ON public.upgrade_prompts_shown
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "admins_full_prompts" ON public.upgrade_prompts_shown
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to calculate grade from score
CREATE OR REPLACE FUNCTION calculate_health_grade(score integer)
RETURNS text AS $$
BEGIN
  RETURN CASE
    WHEN score >= 90 THEN 'A'
    WHEN score >= 80 THEN 'B'
    WHEN score >= 70 THEN 'C'
    WHEN score >= 60 THEN 'D'
    ELSE 'F'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to calculate churn risk from score
CREATE OR REPLACE FUNCTION calculate_churn_risk(score integer)
RETURNS text AS $$
BEGIN
  RETURN CASE
    WHEN score >= 80 THEN 'low'
    WHEN score >= 60 THEN 'medium'
    WHEN score >= 40 THEN 'high'
    ELSE 'critical'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =============================================================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS health_scores_updated_at ON public.customer_health_scores;
CREATE TRIGGER health_scores_updated_at
  BEFORE UPDATE ON public.customer_health_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE 'God-Tier Hardening migration complete. Tables created:';
  RAISE NOTICE '  - customer_health_scores';
  RAISE NOTICE '  - customer_health_history';
  RAISE NOTICE '  - churn_alerts';
  RAISE NOTICE '  - error_logs';
  RAISE NOTICE '  - ops_alerts';
  RAISE NOTICE '  - latency_logs';
  RAISE NOTICE '  - active_sessions';
  RAISE NOTICE '  - upgrade_prompts_shown';
  RAISE NOTICE 'webhook_deliveries table updated with retry columns';
END $$;
