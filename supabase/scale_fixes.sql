-- =============================================================================
-- SCALE FIXES - Production hardening for multi-instance deployment
-- =============================================================================

-- 1. DISTRIBUTED LOCK TABLE
-- Prevents multiple Railway instances from running the same scheduled jobs
CREATE TABLE IF NOT EXISTS public.distributed_locks (
  lock_name TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_distributed_locks_expires 
ON public.distributed_locks(expires_at);

-- 2. DEPLOYMENT LOCKS TABLE
-- Prevents duplicate deployments for the same user
CREATE TABLE IF NOT EXISTS public.deployment_locks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lock_expires_at TIMESTAMPTZ NOT NULL,
  request_id TEXT,
  source TEXT -- 'stripe', 'wizard', 'admin'
);

-- Index for cleanup
CREATE INDEX IF NOT EXISTS idx_deployment_locks_expires
ON public.deployment_locks(lock_expires_at);

-- 3. STRIPE IDEMPOTENCY TABLE
-- Tracks processed Stripe events to prevent duplicate processing
CREATE TABLE IF NOT EXISTS public.stripe_processed_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result JSONB
);

-- Index for cleanup (keep 30 days)
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
ON public.stripe_processed_events(processed_at);

-- 4. CALCOM BOOKING METADATA TABLE
-- Store additional Cal.com identifiers for better user resolution
ALTER TABLE public.integrations 
ADD COLUMN IF NOT EXISTS cal_user_id TEXT;

ALTER TABLE public.integrations 
ADD COLUMN IF NOT EXISTS cal_organization_id TEXT;

-- Index for Cal.com user lookups
CREATE INDEX IF NOT EXISTS idx_integrations_cal_user_id
ON public.integrations(cal_user_id) WHERE cal_user_id IS NOT NULL;

-- 5. SCHEDULED JOB HISTORY
-- Tracks when jobs last ran (survives restarts)
CREATE TABLE IF NOT EXISTS public.scheduled_job_runs (
  job_name TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_by TEXT, -- instance_id
  last_result TEXT, -- 'success', 'failed', 'skipped'
  run_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata JSONB
);

-- 6. Add unique constraint on agents phone_number if not exists
-- This ensures we can't accidentally create duplicate phone numbers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_phone_number_unique'
  ) THEN
    -- First clean up any duplicates (keep the most recent)
    WITH ranked AS (
      SELECT id, phone_number, created_at,
             ROW_NUMBER() OVER (PARTITION BY phone_number ORDER BY created_at DESC) as rn
      FROM agents
      WHERE phone_number IS NOT NULL
    )
    DELETE FROM agents WHERE id IN (
      SELECT id FROM ranked WHERE rn > 1
    );
    
    -- Now add the constraint
    ALTER TABLE agents ADD CONSTRAINT agents_phone_number_unique UNIQUE (phone_number);
    RAISE NOTICE 'Added agents_phone_number_unique constraint';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'agents_phone_number_unique constraint already exists';
END $$;

-- 7. Function to acquire distributed lock
CREATE OR REPLACE FUNCTION acquire_distributed_lock(
  p_lock_name TEXT,
  p_instance_id TEXT,
  p_ttl_seconds INTEGER DEFAULT 300
) RETURNS BOOLEAN AS $$
DECLARE
  v_acquired BOOLEAN := FALSE;
BEGIN
  -- Try to insert new lock
  INSERT INTO distributed_locks (lock_name, instance_id, acquired_at, expires_at)
  VALUES (p_lock_name, p_instance_id, NOW(), NOW() + (p_ttl_seconds || ' seconds')::INTERVAL)
  ON CONFLICT (lock_name) DO UPDATE
  SET 
    instance_id = EXCLUDED.instance_id,
    acquired_at = EXCLUDED.acquired_at,
    expires_at = EXCLUDED.expires_at
  WHERE 
    -- Only acquire if lock is expired or owned by same instance
    distributed_locks.expires_at < NOW()
    OR distributed_locks.instance_id = p_instance_id;
  
  -- Check if we own the lock
  SELECT instance_id = p_instance_id INTO v_acquired
  FROM distributed_locks
  WHERE lock_name = p_lock_name;
  
  RETURN COALESCE(v_acquired, FALSE);
END;
$$ LANGUAGE plpgsql;

-- 8. Function to release distributed lock
CREATE OR REPLACE FUNCTION release_distributed_lock(
  p_lock_name TEXT,
  p_instance_id TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM distributed_locks
  WHERE lock_name = p_lock_name AND instance_id = p_instance_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- 9. Function to acquire deployment lock for a user
CREATE OR REPLACE FUNCTION acquire_deployment_lock(
  p_user_id UUID,
  p_request_id TEXT,
  p_source TEXT,
  p_ttl_seconds INTEGER DEFAULT 120
) RETURNS BOOLEAN AS $$
DECLARE
  v_acquired BOOLEAN := FALSE;
BEGIN
  -- Try to insert new lock
  INSERT INTO deployment_locks (user_id, locked_at, lock_expires_at, request_id, source)
  VALUES (p_user_id, NOW(), NOW() + (p_ttl_seconds || ' seconds')::INTERVAL, p_request_id, p_source)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    locked_at = EXCLUDED.locked_at,
    lock_expires_at = EXCLUDED.lock_expires_at,
    request_id = EXCLUDED.request_id,
    source = EXCLUDED.source
  WHERE 
    -- Only acquire if lock is expired
    deployment_locks.lock_expires_at < NOW();
  
  -- Check if we own the lock
  SELECT request_id = p_request_id INTO v_acquired
  FROM deployment_locks
  WHERE user_id = p_user_id;
  
  RETURN COALESCE(v_acquired, FALSE);
END;
$$ LANGUAGE plpgsql;

-- 10. Function to release deployment lock
CREATE OR REPLACE FUNCTION release_deployment_lock(
  p_user_id UUID,
  p_request_id TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM deployment_locks
  WHERE user_id = p_user_id AND request_id = p_request_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- 11. Cleanup old data periodically (call from cron or app)
CREATE OR REPLACE FUNCTION cleanup_scale_tables() RETURNS VOID AS $$
BEGIN
  -- Clean expired locks
  DELETE FROM distributed_locks WHERE expires_at < NOW() - INTERVAL '1 hour';
  DELETE FROM deployment_locks WHERE lock_expires_at < NOW() - INTERVAL '1 hour';
  
  -- Clean old Stripe events (keep 30 days)
  DELETE FROM stripe_processed_events WHERE processed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Done
COMMENT ON TABLE distributed_locks IS 'Prevents duplicate scheduled job execution across Railway instances';
COMMENT ON TABLE deployment_locks IS 'Prevents duplicate agent deployments for the same user';
COMMENT ON TABLE stripe_processed_events IS 'Tracks processed Stripe webhook events for idempotency';
COMMENT ON TABLE scheduled_job_runs IS 'Tracks scheduled job history for observability';
