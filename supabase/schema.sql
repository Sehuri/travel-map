begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.city_details (
  city_name text primary key,
  favorite_places text,
  favorite_foods text,
  travel_days_min smallint check (travel_days_min between 1 and 90),
  travel_days_max smallint check (travel_days_max between 1 and 90),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint valid_travel_days check (
    travel_days_min is null
    or travel_days_max is null
    or travel_days_max >= travel_days_min
  )
);

create table if not exists public.city_ratings (
  city_name text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  score numeric(3,1) not null check (score between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (city_name, user_id)
);

create table if not exists public.city_rating_summary (
  city_name text primary key,
  average_score numeric(4,2) not null default 0,
  rating_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.city_details enable row level security;
alter table public.city_ratings enable row level security;
alter table public.city_rating_summary enable row level security;

create or replace function public.is_current_user_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower('YOUR_OWNER_EMAIL@example.com');
$$;

create or replace function private.refresh_city_rating_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_city text;
begin
  affected_city := case when tg_op = 'DELETE' then old.city_name else new.city_name end;

  insert into public.city_rating_summary (city_name, average_score, rating_count, updated_at)
  select
    affected_city,
    coalesce(round(avg(score), 2), 0),
    count(*)::integer,
    now()
  from public.city_ratings
  where city_name = affected_city
  on conflict (city_name) do update
    set average_score = excluded.average_score,
        rating_count = excluded.rating_count,
        updated_at = excluded.updated_at;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists refresh_city_rating_summary on public.city_ratings;
create trigger refresh_city_rating_summary
after insert or update or delete on public.city_ratings
for each row execute function private.refresh_city_rating_summary();

drop policy if exists city_details_public_read on public.city_details;
create policy city_details_public_read
on public.city_details for select
to anon, authenticated
using (true);

drop policy if exists city_details_owner_insert on public.city_details;
create policy city_details_owner_insert
on public.city_details for insert
to authenticated
with check (
  public.is_current_user_owner()
  and (select auth.uid()) = updated_by
);

drop policy if exists city_details_owner_update on public.city_details;
create policy city_details_owner_update
on public.city_details for update
to authenticated
using (public.is_current_user_owner())
with check (
  public.is_current_user_owner()
  and (select auth.uid()) = updated_by
);

drop policy if exists city_ratings_read_own on public.city_ratings;
create policy city_ratings_read_own
on public.city_ratings for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists city_ratings_insert_own on public.city_ratings;
create policy city_ratings_insert_own
on public.city_ratings for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists city_ratings_update_own on public.city_ratings;
create policy city_ratings_update_own
on public.city_ratings for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists city_rating_summary_public_read on public.city_rating_summary;
create policy city_rating_summary_public_read
on public.city_rating_summary for select
to anon, authenticated
using (true);

revoke all on public.city_details from anon, authenticated;
revoke all on public.city_ratings from anon, authenticated;
revoke all on public.city_rating_summary from anon, authenticated;
grant select on public.city_details to anon, authenticated;
grant insert, update on public.city_details to authenticated;
grant select, insert, update on public.city_ratings to authenticated;
grant select on public.city_rating_summary to anon, authenticated;
revoke execute on function public.is_current_user_owner() from public, anon;
grant execute on function public.is_current_user_owner() to authenticated;
revoke execute on function private.refresh_city_rating_summary() from public, anon, authenticated;

commit;
