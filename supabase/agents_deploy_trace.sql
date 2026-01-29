-- Add deploy trace columns and index for number-only deploy. Safe to run multiple times.
-- Run in Supabase Dashboard → SQL Editor.
-- Retell docs: create-phone-number uses phone_number (E.164) as unique id for Get/Update/Delete.
-- https://docs.retellai.com/api-references/create-phone-number
-- https://docs.retellai.com/api-references/get-phone-number

alter table public.agents
  add column if not exists deploy_request_id text,
  add column if not exists nickname text,
  add column if not exists provider_number_id text;

comment on column public.agents.deploy_request_id is 'Correlation id for deploy (e.g. deploy-1738...-hex). Logged + stored for traceability.';
comment on column public.agents.nickname is 'Business name sent to Retell as nickname; same value we use to find the number in Retell.';
comment on column public.agents.provider_number_id is 'Provider’s id for this number. For Retell, this is phone_number (E.164); use for reconciliation and provider API calls.';

create index if not exists idx_agents_phone_number on public.agents (phone_number);
