begin;

create table if not exists public.travel_city_visits (
  id uuid primary key default gen_random_uuid(),
  city_name text not null,
  visit_date date not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (city_name, visit_date)
);

create index if not exists travel_city_visits_city_date_idx
  on public.travel_city_visits (city_name, visit_date desc);

alter table public.travel_city_visits enable row level security;

drop policy if exists travel_city_visits_public_read on public.travel_city_visits;
create policy travel_city_visits_public_read
on public.travel_city_visits for select
to anon, authenticated
using (true);

drop policy if exists travel_city_visits_owner_all on public.travel_city_visits;
create policy travel_city_visits_owner_all
on public.travel_city_visits for all
to authenticated
using (public.is_current_user_owner())
with check (public.is_current_user_owner() and (select auth.uid()) = created_by);

revoke all on public.travel_city_visits from anon, authenticated;
grant select on public.travel_city_visits to anon, authenticated;
grant insert, update, delete on public.travel_city_visits to authenticated;

commit;
