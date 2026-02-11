-- =============================================================================
-- AI HELPER - PROPOSAL & AUDIT LAYER
-- Purpose:
-- - Store assistant "proposals" (write actions) that require user confirmation
-- - Keep v1 simple + safe: backend (service_role) reads/writes; clients do NOT
--   access these tables directly via PostgREST.
--
-- Notes:
-- - RLS enabled with NO permissive policies => anon/authenticated cannot read/write.
-- - Service role (used by backend) bypasses RLS.
-- =============================================================================

create table if not exists public.assistant_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null, -- e.g. 'update_settings', 'send_sms'
  status text not null default 'pending', -- pending | confirmed | cancelled | expired | applied | failed
  payload jsonb not null default '{}'::jsonb,
  diff jsonb,
  summary text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  confirmed_at timestamptz,
  applied_at timestamptz,
  error text
);

create index if not exists idx_assistant_proposals_user_created
  on public.assistant_proposals(user_id, created_at desc);

create index if not exists idx_assistant_proposals_status_expires
  on public.assistant_proposals(status, expires_at);

alter table public.assistant_proposals enable row level security;

-- No policies on purpose. Backend only.

