-- Run once in Supabase SQL Editor before enabling the public resource endpoint.
-- No travel records, notes, photos or ratings are changed.
begin;
create table if not exists public.travel_api_daily_budget (
  day date primary key,
  calls integer not null default 0 check (calls >= 0)
);
alter table public.travel_api_daily_budget enable row level security;
revoke all on public.travel_api_daily_budget from public, anon, authenticated;
create or replace function public.consume_travel_api_budget()
returns boolean language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  insert into public.travel_api_daily_budget(day,calls)
  values ((now() at time zone 'Asia/Shanghai')::date,1)
  on conflict(day) do update set calls = public.travel_api_daily_budget.calls + 1
  where public.travel_api_daily_budget.calls < 500
  returning calls into used;
  return used is not null;
end;
$$;
revoke all on function public.consume_travel_api_budget() from public, anon, authenticated;
grant execute on function public.consume_travel_api_budget() to service_role;
commit;
