-- Store deploy error for a user when agent provisioning fails (e.g. area code unavailable).
-- Cleared when deploy succeeds or admin retries successfully.
alter table public.profiles
  add column if not exists deploy_error text;

comment on column public.profiles.deploy_error is 'Error code from last failed deploy, e.g. AREA_CODE_UNAVAILABLE. Null when deployed successfully.';
