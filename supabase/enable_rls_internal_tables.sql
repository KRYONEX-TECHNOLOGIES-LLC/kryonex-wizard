-- =============================================================================
-- ENABLE RLS ON INTERNAL TABLES (fixes Supabase Security Advisor)
-- These tables are only used by the backend (service_role). Enabling RLS
-- with no policies = no access for anon/authenticated. Service role bypasses RLS.
-- Run this in Supabase SQL Editor or via migration.
-- =============================================================================

ALTER TABLE public.distributed_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deployment_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_processed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_job_runs ENABLE ROW LEVEL SECURITY;

-- Optional: explicit "no access" policies (RLS with no policies already denies all)
-- Uncomment if you want to be explicit:

-- CREATE POLICY "service_only_distributed_locks"
--   ON public.distributed_locks FOR ALL
--   USING (false);
-- CREATE POLICY "service_only_deployment_locks"
--   ON public.deployment_locks FOR ALL
--   USING (false);
-- CREATE POLICY "service_only_stripe_processed_events"
--   ON public.stripe_processed_events FOR ALL
--   USING (false);
-- CREATE POLICY "service_only_scheduled_job_runs"
--   ON public.scheduled_job_runs FOR ALL
--   USING (false);

-- With RLS enabled and no permissive policies, anon and authenticated get no rows.
-- Your server uses supabaseAdmin (service_role), which bypasses RLS — no code changes needed.
