-- =============================================================================
-- AGENTS TABLE CRITICAL FIELD ENFORCEMENT
-- Run in Supabase SQL Editor. Ensures agent_id and phone_number are never null.
-- =============================================================================

-- Add NOT NULL constraint to agent_id if not already set
-- First, clean up any null values (shouldn't exist but safety first)
UPDATE public.agents SET agent_id = 'UNKNOWN_' || id::text WHERE agent_id IS NULL;
ALTER TABLE public.agents ALTER COLUMN agent_id SET NOT NULL;

-- Add NOT NULL constraint to phone_number if not already set
UPDATE public.agents SET phone_number = 'UNKNOWN_' || id::text WHERE phone_number IS NULL;
ALTER TABLE public.agents ALTER COLUMN phone_number SET NOT NULL;

-- Add NOT NULL constraint to user_id if not already set
-- (user_id should always exist - this is who owns the agent)
DELETE FROM public.agents WHERE user_id IS NULL; -- Remove orphaned records
ALTER TABLE public.agents ALTER COLUMN user_id SET NOT NULL;

-- Add unique constraint on phone_number to prevent duplicates
-- (each phone number should only belong to one agent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_phone_number_unique ON public.agents (phone_number);

-- Add index on agent_id for faster lookups (fallback routing)
CREATE INDEX IF NOT EXISTS idx_agents_agent_id ON public.agents (agent_id);

-- Add composite index for webhook lookups
CREATE INDEX IF NOT EXISTS idx_agents_user_phone ON public.agents (user_id, phone_number);

COMMENT ON COLUMN public.agents.agent_id IS 'Retell agent ID - REQUIRED for webhook fallback routing';
COMMENT ON COLUMN public.agents.phone_number IS 'E.164 phone number - REQUIRED, PRIMARY key for call/SMS attribution';
COMMENT ON COLUMN public.agents.user_id IS 'Owner user ID - REQUIRED for billing and usage tracking';

-- =============================================================================
-- VERIFICATION QUERY - Run after to confirm constraints
-- =============================================================================
-- SELECT 
--   column_name, 
--   is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'agents' 
--   AND column_name IN ('agent_id', 'phone_number', 'user_id');
