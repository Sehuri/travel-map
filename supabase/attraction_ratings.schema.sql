-- Source template. Build the complete SQL with scripts/build-attraction-sql.cjs.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.travel_attractions (
  id text primary key check (char_length(id) between 3 and 250),
  city_name text not null,
  country text not null,
  name text not null,
  reference_url text not null default '',
  unique (country, city_name, name)
);
create table if not exists public.attraction_votes (
  attraction_id text not null references public.travel_attractions(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null check (tier in ('hang','top','elite','npc','bad')),
  created_at timestamptz not null default now(),
  primary key (attraction_id, user_id)
);
create table if not exists public.attraction_vote_summary (
  attraction_id text not null references public.travel_attractions(id),
  tier text not null check (tier in ('hang','top','elite','npc','bad')),
  vote_count integer not null default 0 check (vote_count >= 0),
  primary key (attraction_id, tier)
);
alter table public.travel_attractions enable row level security;
alter table public.attraction_votes enable row level security;
alter table public.attraction_vote_summary enable row level security;

-- Increment the shared counter atomically; duplicate votes fail before the trigger.
create or replace function private.count_attraction_vote()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.attraction_vote_summary(attraction_id,tier,vote_count)
    values(new.attraction_id,new.tier,1)
    on conflict (attraction_id,tier) do update
      set vote_count = public.attraction_vote_summary.vote_count + 1;
    return new;
  end if;
  update public.attraction_vote_summary set vote_count = vote_count - 1
    where attraction_id = old.attraction_id and tier = old.tier;
  return old;
end;
$$;
revoke all on function private.count_attraction_vote() from public, anon, authenticated;
drop trigger if exists count_attraction_vote on public.attraction_votes;
create trigger count_attraction_vote after insert or delete on public.attraction_votes
  for each row execute function private.count_attraction_vote();

drop policy if exists attractions_read on public.travel_attractions;
create policy attractions_read on public.travel_attractions for select to anon,authenticated using (true);
drop policy if exists attraction_summary_read on public.attraction_vote_summary;
create policy attraction_summary_read on public.attraction_vote_summary for select to anon,authenticated using (true);
drop policy if exists attraction_votes_read_own on public.attraction_votes;
create policy attraction_votes_read_own on public.attraction_votes for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists attraction_votes_insert_own on public.attraction_votes;
create policy attraction_votes_insert_own on public.attraction_votes for insert to authenticated
  with check ((select auth.uid()) = user_id);
revoke all on public.travel_attractions, public.attraction_vote_summary, public.attraction_votes from anon,authenticated;
grant select on public.travel_attractions, public.attraction_vote_summary to anon,authenticated;
grant select,insert on public.attraction_votes to authenticated;
-- No UPDATE, DELETE or UPSERT access: a submitted choice stays fixed.

-- CATALOGUE_SEED
commit;
