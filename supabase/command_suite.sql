-- Kryonex Command Suite schema (Sales + Onboarding)
create extension if not exists "pgcrypto";

-- Profiles (extend auth.users)
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists status text default 'active',
  add column if not exists role text default 'owner',
  add column if not exists referrer_id uuid references auth.users(id) on delete set null,
  add column if not exists cal_api_key text,
  add column if not exists cal_event_type_id integer,
  add column if not exists cal_time_zone text,
  add column if not exists cal_event_type_slug text,
  add column if not exists cal_username text,
  add column if not exists cal_team_slug text,
  add column if not exists cal_organization_slug text;

-- Integrations (OAuth tokens, encrypted by app)
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  is_active boolean default false,
  booking_url text,
  event_type_id integer,
  event_type_slug text,
  cal_username text,
  cal_team_slug text,
  cal_organization_slug text,
  cal_time_zone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- Leads (Sales CRM)
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  business_name text,
  phone text,
  email text,
  status text not null default 'new',
  owner_id uuid references public.profiles(user_id) on delete set null,
  lock_expires_at timestamptz,
  tier_interest text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leads
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists owner_id uuid references public.profiles(user_id) on delete set null,
  add column if not exists business_name text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists status text default 'new',
  add column if not exists lock_expires_at timestamptz,
  add column if not exists tier_interest text,
  add column if not exists metadata jsonb;

-- Deals (Stripe sessions)
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  seller_id uuid references public.profiles(user_id) on delete set null,
  referrer_id uuid references auth.users(id) on delete set null,
  stripe_session_id text unique,
  amount numeric default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- Commissions (Ledger)
create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.profiles(user_id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  deal_amount numeric not null default 0,
  commission_amount numeric not null default 0,
  status text not null default 'pending_locked',
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'call_outcome' and n.nspname = 'public'
  ) then
    create type public.call_outcome as enum (
      'No Answer',
      'Gatekeeper',
      'Not Interested',
      'Hangup',
      'Pitch Delivered',
      'Demo Set'
    );
  end if;
end
$$;

create table if not exists public.call_recordings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid references public.profiles(user_id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  duration integer not null default 0,
  recording_url text,
  outcome public.call_outcome not null default 'No Answer',
  qa_flags jsonb default '[]'::jsonb,
  manager_notes text,
  flagged_for_review boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.call_recordings enable row level security;

drop policy if exists "admins_full_access_call_recordings" on public.call_recordings;
create policy "admins_full_access_call_recordings"
  on public.call_recordings
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.deals enable row level security;
alter table public.commissions enable row level security;
alter table public.integrations enable row level security;

-- Helper policy check
-- Drop policies to make script re-runnable
drop policy if exists "admins_full_access_profiles" on public.profiles;
drop policy if exists "admins_full_access_leads" on public.leads;
drop policy if exists "admins_full_access_deals" on public.deals;
drop policy if exists "admins_full_access_commissions" on public.commissions;
drop policy if exists "admins_full_access_audit_logs" on public.audit_logs;
drop policy if exists "audit_logs_are_viewable_by_owner" on public.audit_logs;
drop policy if exists "admins_full_access_integrations" on public.integrations;
drop policy if exists "admins_full_access_black_box_logs" on public.black_box_logs;
drop policy if exists "self_profile_access" on public.profiles;
drop policy if exists "self_profile_update" on public.profiles;
drop policy if exists "self_integrations_access" on public.integrations;
drop policy if exists "self_integrations_update" on public.integrations;
drop policy if exists "seller_read_leads" on public.leads;
drop policy if exists "seller_insert_leads" on public.leads;

-- Admins: full access on all tables (profiles uses self-only to avoid recursion)
create policy "admins_full_access_leads"
  on public.leads
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

create policy "admins_full_access_deals"
  on public.deals
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

create policy "admins_full_access_commissions"
  on public.commissions
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

create policy "admins_full_access_integrations"
  on public.integrations
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

-- Users can read/update their own profile (keeps existing flows working)
create policy "self_profile_access"
  on public.profiles
  for select
  using (auth.uid() = user_id);

create policy "self_profile_update"
  on public.profiles
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "self_integrations_access"
  on public.integrations
  for select
  using (auth.uid() = user_id);

create policy "self_integrations_update"
  on public.integrations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sellers: read assigned leads, insert new assigned leads
create policy "seller_read_leads"
  on public.leads
  for select
  using (owner_id = auth.uid());

create policy "seller_insert_leads"
  on public.leads
  for insert
  with check (owner_id = auth.uid());

-- Live tracking sessions
create table if not exists public.tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  update_key text not null,
  created_by uuid references public.profiles(user_id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  customer_phone text,
  status text not null default 'active',
  eta_minutes integer,
  last_lat double precision,
  last_lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracking_points (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.tracking_sessions(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null default now()
);

alter table public.tracking_sessions enable row level security;
alter table public.tracking_points enable row level security;

-- Appointments (Calendar)
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  customer_name text not null,
  customer_phone text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  location text,
  notes text,
  reminder_minutes integer not null default 0,
  reminder_enabled boolean not null default true,
  reminder_sent boolean not null default false,
  reminder_last_sent_at timestamptz,
  eta_enabled boolean not null default false,
  eta_minutes integer not null default 10,
  eta_link text,
  eta_last_sent_at timestamptz,
  status text not null default 'booked',
  job_value numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists start_time timestamptz,
  add column if not exists end_time timestamptz,
  add column if not exists location text,
  add column if not exists notes text,
  add column if not exists reminder_minutes integer,
  add column if not exists reminder_enabled boolean,
  add column if not exists reminder_sent boolean,
  add column if not exists reminder_last_sent_at timestamptz,
  add column if not exists eta_enabled boolean,
  add column if not exists eta_minutes integer,
  add column if not exists eta_link text,
  add column if not exists eta_last_sent_at timestamptz,
  add column if not exists status text,
  add column if not exists job_value numeric;

create index if not exists appointments_user_id_idx
  on public.appointments(user_id);
create index if not exists appointments_start_time_idx
  on public.appointments(start_time);

alter table public.appointments enable row level security;

-- Drop tracking policies after tables exist
drop policy if exists "admins_full_access_tracking_sessions" on public.tracking_sessions;
drop policy if exists "admins_full_access_tracking_points" on public.tracking_points;
drop policy if exists "creator_read_tracking_sessions" on public.tracking_sessions;
drop policy if exists "creator_read_tracking_points" on public.tracking_points;
drop policy if exists "admins_full_access_appointments" on public.appointments;
drop policy if exists "owner_access_appointments" on public.appointments;

create policy "admins_full_access_tracking_sessions"
  on public.tracking_sessions
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

create policy "admins_full_access_tracking_points"
  on public.tracking_points
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

create policy "creator_read_tracking_sessions"
  on public.tracking_sessions
  for select
  using (created_by = auth.uid());

create policy "creator_read_tracking_points"
  on public.tracking_points
  for select
  using (
    exists (
      select 1 from public.tracking_sessions s
      where s.id = tracking_points.session_id
        and s.created_by = auth.uid()
    )
  );

create policy "admins_full_access_appointments"
  on public.appointments
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

create policy "owner_access_appointments"
  on public.appointments
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Audit logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  action_type text,
  entity text,
  entity_id text,
  ip text,
  user_agent text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs
  add column if not exists actor_id uuid references auth.users(id) on delete set null;

alter table public.audit_logs enable row level security;

create policy "admins_full_access_audit_logs"
  on public.audit_logs
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

create policy "audit_logs_are_viewable_by_owner"
  on public.audit_logs
  for select
  using (actor_id = auth.uid());

-- Black box logs (immutable forensic trail)
create table if not exists public.black_box_logs (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null,
  user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  timestamp timestamptz not null default now(),
  ip_address text,
  user_agent text,
  meta_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.black_box_logs enable row level security;

create policy "admins_full_access_black_box_logs"
  on public.black_box_logs
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );

-- Dialer queue
create table if not exists public.dialer_queue (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  created_by uuid references public.profiles(user_id) on delete set null,
  status text not null default 'queued',
  created_at timestamptz not null default now()
);

create unique index if not exists dialer_queue_lead_id_key
  on public.dialer_queue(lead_id);

alter table public.dialer_queue enable row level security;

drop policy if exists "admins_full_access_dialer_queue" on public.dialer_queue;
create policy "admins_full_access_dialer_queue"
  on public.dialer_queue
  for all
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid() and p.role = 'admin'
    )
  );
