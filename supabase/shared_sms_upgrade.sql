-- Shared SMS Number Upgrade - REQUIRED for proper conversation routing
-- Run this migration in Supabase SQL Editor

-- Add from_number and to_number to messages table for conversation tracking
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS from_number text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS to_number text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Index for fast conversation lookup (who last texted this customer?)
CREATE INDEX IF NOT EXISTS idx_messages_from_number ON public.messages(from_number);
CREATE INDEX IF NOT EXISTS idx_messages_to_number ON public.messages(to_number);
CREATE INDEX IF NOT EXISTS idx_messages_user_direction ON public.messages(user_id, direction);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

-- Composite index for conversation routing query
CREATE INDEX IF NOT EXISTS idx_messages_conversation_lookup 
  ON public.messages(to_number, direction, created_at DESC) 
  WHERE direction = 'outbound';

COMMENT ON COLUMN public.messages.from_number IS 'Phone number that sent the message';
COMMENT ON COLUMN public.messages.to_number IS 'Phone number that received the message';
