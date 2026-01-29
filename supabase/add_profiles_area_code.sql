-- Add area_code (and related profile columns) if missing.
-- Run this in Supabase Dashboard → SQL Editor if you see "column profiles.area_code does not exist".

alter table public.profiles
  add column if not exists area_code text,
  add column if not exists business_name text,
  add column if not exists industry text default 'hvac',
  add column if not exists onboarding_step integer,
  add column if not exists consent_accepted_at timestamptz,
  add column if not exists consent_version text,
  add column if not exists deploy_error text;

comment on column public.profiles.area_code is '3-digit area code for phone number provisioning (e.g. 419).';
comment on column public.profiles.industry is 'Protocol for deploy: hvac or plumbing. Picks which Retell template (HVAC vs Plumbing) to use.';
