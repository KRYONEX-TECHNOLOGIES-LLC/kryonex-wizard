-- Fix agents table constraints for shared master agent architecture
-- All users share the same master agent_id but have unique phone numbers
-- The unique constraint should be on user_id, not agent_id

-- Step 1: Drop the unique constraint on agent_id if it exists
-- This constraint was wrong because all users share the same master agent
DO $$
BEGIN
  -- Try to drop the constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'agents_agent_id_key'
  ) THEN
    ALTER TABLE agents DROP CONSTRAINT agents_agent_id_key;
    RAISE NOTICE 'Dropped agents_agent_id_key constraint';
  END IF;
  
  -- Also check for any unique index on agent_id
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'agents_agent_id_idx' AND tablename = 'agents'
  ) THEN
    DROP INDEX IF EXISTS agents_agent_id_idx;
    RAISE NOTICE 'Dropped agents_agent_id_idx index';
  END IF;
END $$;

-- Step 2: Ensure unique constraint on user_id (one agent per user)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'agents_user_id_key'
  ) THEN
    -- First check if there are duplicates (shouldn't be, but be safe)
    -- If there are duplicates, we keep only the most recent one
    WITH ranked AS (
      SELECT id, user_id, created_at,
             ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) as rn
      FROM agents
      WHERE user_id IS NOT NULL
    )
    DELETE FROM agents WHERE id IN (
      SELECT id FROM ranked WHERE rn > 1
    );
    
    -- Now add the unique constraint
    ALTER TABLE agents ADD CONSTRAINT agents_user_id_key UNIQUE (user_id);
    RAISE NOTICE 'Added agents_user_id_key constraint';
  END IF;
END $$;

-- Step 3: Ensure phone_number is unique (each phone number belongs to one user)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'agents_phone_number_key'
  ) THEN
    ALTER TABLE agents ADD CONSTRAINT agents_phone_number_key UNIQUE (phone_number);
    RAISE NOTICE 'Added agents_phone_number_key constraint';
  ELSE
    RAISE NOTICE 'agents_phone_number_key constraint already exists';
  END IF;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'agents_phone_number_key constraint already exists (caught exception)';
END $$;

-- Step 4: Create index on agent_id for queries (not unique, since all share master)
CREATE INDEX IF NOT EXISTS agents_agent_id_idx ON agents(agent_id);

-- Step 5: Create index on phone_number for fast lookups
CREATE INDEX IF NOT EXISTS agents_phone_number_idx ON agents(phone_number);
