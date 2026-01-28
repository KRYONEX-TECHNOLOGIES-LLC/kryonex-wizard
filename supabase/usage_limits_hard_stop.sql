-- Hard-stop guardrail for usage_limits. Run when usage_limits table exists.
-- Ensures calls/SMS can be blocked once user exceeds cap + grace.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'usage_limits'
      and column_name = 'hard_stop_active'
  ) then
    alter table public.usage_limits
      add column hard_stop_active boolean not null default false;
  end if;
end
$$;
