-- =============================================================================
-- OPS INFRASTRUCTURE MIGRATION
-- Run in Supabase SQL Editor. Safe to run multiple times (idempotent).
-- Implements: webhook handling, event storage, usage tracking, tier enforcement
-- =============================================================================

-- =============================================================================
-- 1. AGENTS TABLE ENHANCEMENTS
-- Add canonical fields per ops spec
-- =============================================================================
alter table public.agents
  add column if not exists status text default 'deployed',
  add column if not exists updated_at timestamptz default now(),
  add column if not exists provisioned_by uuid references auth.users(id) on delete set null,
  add column if not exists provider text default 'retell',
  add column if not exists provider_region text;

comment on column public.agents.status is 'Agent lifecycle: deployed, configured, suspended, failed, retired';
comment on column public.agents.provisioned_by is 'User or admin who initiated the deploy';
comment on column public.agents.provider is 'Provider name (Retell, Twilio, etc.)';

-- Trigger to auto-update updated_at
create or replace function update_agents_updated_at()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists agents_updated_at on public.agents;
create trigger agents_updated_at
  before update on public.agents
  for each row execute function update_agents_updated_at();

-- =============================================================================
-- 2. WEBHOOK_QUEUE TABLE
-- Stores webhooks for pending agents or failed processing for replay
-- =============================================================================
create table if not exists public.webhook_queue (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  user_id uuid references auth.users(id) on delete set null,
  agent_id text,
  event_type text not null, -- call_inbound, sms_inbound, call_ended, etc.
  raw_payload jsonb not null,
  idempotency_key text unique,
  received_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_attempt_at timestamptz,
  processed_at timestamptz,
  processed_by text, -- 'system', 'admin:uuid', 'replay:uuid'
  result text, -- 'success', 'failed', 'skipped'
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_webhook_queue_phone on public.webhook_queue(phone_number);
create index if not exists idx_webhook_queue_user on public.webhook_queue(user_id);
create index if not exists idx_webhook_queue_pending on public.webhook_queue(processed_at) where processed_at is null;
create index if not exists idx_webhook_queue_received on public.webhook_queue(received_at);

comment on table public.webhook_queue is 'Queued webhooks for pending agents or failed processing. Supports replay.';

-- =============================================================================
-- 3. UNKNOWN_PHONE TABLE
-- Stores webhooks for numbers not found in agents table
-- =============================================================================
create table if not exists public.unknown_phone (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  event_type text not null,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution text, -- 'matched_agent', 'spam', 'ignored', etc.
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_unknown_phone_number on public.unknown_phone(phone_number);
create index if not exists idx_unknown_phone_unresolved on public.unknown_phone(resolved_at) where resolved_at is null;

comment on table public.unknown_phone is 'Webhooks for phone numbers not found in agents. Alert ops, do not drop.';

-- =============================================================================
-- 4. CALL_EVENTS TABLE
-- Raw and normalized call event storage
-- =============================================================================
create table if not exists public.call_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null, -- system-generated or provider id
  idempotency_key text unique,
  phone_number text not null, -- to_number for inbound
  user_id uuid references auth.users(id) on delete set null,
  agent_id text,
  
  -- Provider data
  call_sid text, -- provider call id
  direction text not null, -- 'inbound' or 'outbound'
  from_number text,
  to_number text,
  
  -- Timestamps
  start_time timestamptz,
  answer_time timestamptz,
  end_time timestamptz,
  
  -- Duration and billing
  duration_seconds integer default 0,
  billed_seconds integer default 0,
  
  -- Status
  call_status text, -- ringing, in-progress, completed, no-answer, busy, failed
  disconnect_reason text,
  
  -- Recording and transcript
  recording_url text,
  transcript_id text,
  
  -- Agent and flow
  agent_used text, -- agent_id at call time
  ivr_flow_id text,
  call_tags text[], -- freeform tags
  
  -- Raw data
  raw_payload jsonb,
  
  -- Processing metadata
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  ingest_node text,
  signature_valid boolean,
  
  created_at timestamptz not null default now()
);

create index if not exists idx_call_events_phone on public.call_events(phone_number);
create index if not exists idx_call_events_user on public.call_events(user_id);
create index if not exists idx_call_events_time on public.call_events(start_time);
create index if not exists idx_call_events_status on public.call_events(call_status);

comment on table public.call_events is 'All call events with raw payload and normalized fields for billing and audit.';

-- =============================================================================
-- 5. SMS_EVENTS TABLE
-- Raw and normalized SMS event storage
-- =============================================================================
create table if not exists public.sms_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null,
  idempotency_key text unique,
  phone_number text not null, -- to_number for inbound
  user_id uuid references auth.users(id) on delete set null,
  agent_id text,
  
  -- Provider data
  message_sid text, -- provider message id
  direction text not null, -- 'inbound' or 'outbound'
  from_number text,
  to_number text,
  
  -- Content
  body text,
  body_sanitized text, -- PII-masked version
  media_urls text[],
  
  -- Status
  status text, -- received, delivered, failed, undelivered
  delivery_timestamp timestamptz,
  
  -- Billing
  billed_units integer default 1, -- segments for multipart
  sms_cost numeric(10,4),
  
  -- Raw data
  raw_payload jsonb,
  
  -- Processing metadata
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  ingest_node text,
  signature_valid boolean,
  
  created_at timestamptz not null default now()
);

create index if not exists idx_sms_events_phone on public.sms_events(phone_number);
create index if not exists idx_sms_events_user on public.sms_events(user_id);
create index if not exists idx_sms_events_time on public.sms_events(received_at);

comment on table public.sms_events is 'All SMS events with raw payload and normalized fields for billing and audit.';

-- =============================================================================
-- 6. USAGE_LIMITS ENHANCEMENTS
-- Add tier enforcement and billing fields
-- =============================================================================
alter table public.usage_limits
  add column if not exists tier_id text,
  add column if not exists tier_free_minutes integer default 0,
  add column if not exists tier_free_sms integer default 0,
  add column if not exists overage_rate_minutes numeric(10,4) default 0.15,
  add column if not exists overage_rate_sms numeric(10,4) default 0.02,
  add column if not exists soft_limit_threshold integer default 80,
  add column if not exists hard_limit_threshold integer default 100,
  add column if not exists limit_action text default 'block', -- warn, throttle, block, notify-billing
  add column if not exists limit_state text default 'ok', -- ok, warning, throttled, blocked
  add column if not exists inbound_calls_count integer default 0,
  add column if not exists outbound_calls_count integer default 0,
  add column if not exists call_cost_total numeric(10,2) default 0,
  add column if not exists sms_cost_total numeric(10,2) default 0,
  add column if not exists customer_billed_amount numeric(10,2) default 0,
  add column if not exists billing_period_id text,
  add column if not exists last_warning_at timestamptz,
  add column if not exists last_block_at timestamptz;

comment on column public.usage_limits.limit_state is 'Current enforcement state: ok, warning, throttled, blocked';
comment on column public.usage_limits.soft_limit_threshold is 'Percentage of limit to trigger warning (e.g., 80)';
comment on column public.usage_limits.hard_limit_threshold is 'Percentage where service is throttled or blocked (e.g., 100)';

-- =============================================================================
-- 7. TIER_SNAPSHOTS TABLE
-- Snapshot of tier rules at time of event for historical billing accuracy
-- =============================================================================
create table if not exists public.tier_snapshots (
  id uuid primary key default gen_random_uuid(),
  tier_id text not null,
  tier_name text not null,
  free_minutes integer not null,
  free_sms integer not null,
  overage_rate_minutes numeric(10,4) not null,
  overage_rate_sms numeric(10,4) not null,
  monthly_price numeric(10,2),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_tier_snapshots_tier on public.tier_snapshots(tier_id);
create index if not exists idx_tier_snapshots_effective on public.tier_snapshots(effective_from);

comment on table public.tier_snapshots is 'Immutable tier rule snapshots for accurate historical billing.';

-- =============================================================================
-- 8. BILLING_LINE_ITEMS TABLE
-- Traceable billing records linked to events
-- =============================================================================
create table if not exists public.billing_line_items (
  id uuid primary key default gen_random_uuid(),
  billing_period_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  phone_number text,
  event_type text, -- call, sms, overage_minutes, overage_sms
  event_ids text[], -- array of event_id references
  event_range_start timestamptz,
  event_range_end timestamptz,
  billed_units numeric not null,
  unit_rate numeric(10,4) not null,
  total_amount numeric(10,2) not null,
  provider_cost numeric(10,2),
  margin numeric(10,2),
  tier_snapshot_id uuid references public.tier_snapshots(id),
  provider_invoice_link text,
  dispute_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_line_items_user on public.billing_line_items(user_id);
create index if not exists idx_billing_line_items_period on public.billing_line_items(billing_period_id);

comment on table public.billing_line_items is 'Every billed unit traceable back to raw events and provider charges.';

-- =============================================================================
-- 9. RECONCILIATION_RUNS TABLE
-- Track nightly reconciliation jobs
-- =============================================================================
create table if not exists public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null, -- 'nightly', 'manual', 'billing'
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text default 'running', -- running, completed, failed
  records_checked integer default 0,
  discrepancies_found integer default 0,
  discrepancy_details jsonb,
  triggered_by text, -- 'scheduler', 'admin:uuid'
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.reconciliation_runs is 'Audit trail for reconciliation jobs.';

-- =============================================================================
-- 10. ALERTS TABLE
-- Operational alerts for monitoring
-- =============================================================================
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null, -- webhook_queue_growth, unknown_phone_spike, signature_failures, billing_spike, delivery_failures
  severity text not null, -- info, warning, critical
  user_id uuid references auth.users(id) on delete set null,
  phone_number text,
  message text not null,
  details jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_alerts_unresolved on public.alerts(resolved_at) where resolved_at is null;
create index if not exists idx_alerts_type on public.alerts(alert_type);
create index if not exists idx_alerts_severity on public.alerts(severity);

comment on table public.alerts is 'Operational alerts for webhook queue, signature failures, billing spikes, etc.';

-- =============================================================================
-- 11. RLS POLICIES
-- =============================================================================
alter table public.webhook_queue enable row level security;
alter table public.unknown_phone enable row level security;
alter table public.call_events enable row level security;
alter table public.sms_events enable row level security;
alter table public.tier_snapshots enable row level security;
alter table public.billing_line_items enable row level security;
alter table public.reconciliation_runs enable row level security;
alter table public.alerts enable row level security;

-- Admin-only access for all ops tables
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'webhook_queue', 'unknown_phone', 'call_events', 'sms_events',
    'tier_snapshots', 'billing_line_items', 'reconciliation_runs', 'alerts'
  ]) loop
    execute format('drop policy if exists "admins_full_access_%s" on public.%I', t, t);
    execute format('
      create policy "admins_full_access_%s"
        on public.%I
        for all
        using (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = ''admin''))
        with check (exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = ''admin''))
    ', t, t);
  end loop;
end
$$;

-- Users can view their own events
drop policy if exists "user_view_call_events" on public.call_events;
create policy "user_view_call_events"
  on public.call_events
  for select
  using (user_id = auth.uid());

drop policy if exists "user_view_sms_events" on public.sms_events;
create policy "user_view_sms_events"
  on public.sms_events
  for select
  using (user_id = auth.uid());

drop policy if exists "user_view_billing" on public.billing_line_items;
create policy "user_view_billing"
  on public.billing_line_items
  for select
  using (user_id = auth.uid());

-- =============================================================================
-- 12. HELPER FUNCTIONS
-- =============================================================================

-- Generate idempotency key from payload
create or replace function generate_idempotency_key(payload jsonb)
returns text as $$
begin
  return encode(digest(payload::text, 'sha256'), 'hex');
end;
$$ language plpgsql immutable;

-- Check if event is duplicate
create or replace function is_duplicate_event(p_idempotency_key text, p_table text)
returns boolean as $$
declare
  found_count integer;
begin
  execute format('select count(*) from public.%I where idempotency_key = $1', p_table)
    into found_count
    using p_idempotency_key;
  return found_count > 0;
end;
$$ language plpgsql;

-- =============================================================================
-- DONE
-- =============================================================================
