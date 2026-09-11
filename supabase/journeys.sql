begin;

create table if not exists public.travel_journeys (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 160),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  cover_url text,
  summary text not null default '',
  distance_km numeric(12, 1) check (distance_km is null or distance_km >= 0),
  distance_is_estimated boolean not null default true,
  accommodation text not null default '',
  budget_amount numeric(14, 2) check (budget_amount is null or budget_amount >= 0),
  budget_currency text not null default 'CNY' check (char_length(budget_currency) between 3 and 8),
  companions text not null default '',
  planning_notes text not null default '',
  travel_notes text not null default '',
  reflection text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.travel_journey_stops (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.travel_journeys(id) on delete cascade,
  city_name text not null check (char_length(city_name) between 1 and 120),
  stop_order integer not null check (stop_order >= 0),
  arrival_date date,
  departure_date date,
  transport_to_next text not null default '',
  notes text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (journey_id, stop_order),
  check (departure_date is null or arrival_date is null or departure_date >= arrival_date)
);

create table if not exists public.travel_journey_photos (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.travel_journeys(id) on delete cascade,
  city_name text,
  image_url text not null,
  caption text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (journey_id, image_url)
);

create index if not exists travel_journeys_date_idx
  on public.travel_journeys (start_date desc, sort_order);
create index if not exists travel_journey_stops_journey_idx
  on public.travel_journey_stops (journey_id, stop_order);
create index if not exists travel_journey_photos_journey_idx
  on public.travel_journey_photos (journey_id, sort_order);

alter table public.travel_journeys enable row level security;
alter table public.travel_journey_stops enable row level security;
alter table public.travel_journey_photos enable row level security;

drop policy if exists travel_journeys_public_read on public.travel_journeys;
create policy travel_journeys_public_read
on public.travel_journeys for select
to anon, authenticated
using (is_published = true);

drop policy if exists travel_journeys_owner_all on public.travel_journeys;
create policy travel_journeys_owner_all
on public.travel_journeys for all
to authenticated
using (public.is_current_user_owner())
with check (public.is_current_user_owner() and (select auth.uid()) = created_by);

drop policy if exists travel_journey_stops_public_read on public.travel_journey_stops;
create policy travel_journey_stops_public_read
on public.travel_journey_stops for select
to anon, authenticated
using (exists (
  select 1 from public.travel_journeys journey
  where journey.id = journey_id and journey.is_published = true
));

drop policy if exists travel_journey_stops_owner_all on public.travel_journey_stops;
create policy travel_journey_stops_owner_all
on public.travel_journey_stops for all
to authenticated
using (public.is_current_user_owner())
with check (public.is_current_user_owner() and (select auth.uid()) = created_by);

drop policy if exists travel_journey_photos_public_read on public.travel_journey_photos;
create policy travel_journey_photos_public_read
on public.travel_journey_photos for select
to anon, authenticated
using (exists (
  select 1 from public.travel_journeys journey
  where journey.id = journey_id and journey.is_published = true
));

drop policy if exists travel_journey_photos_owner_all on public.travel_journey_photos;
create policy travel_journey_photos_owner_all
on public.travel_journey_photos for all
to authenticated
using (public.is_current_user_owner())
with check (public.is_current_user_owner() and (select auth.uid()) = created_by);

revoke all on public.travel_journeys, public.travel_journey_stops, public.travel_journey_photos from anon, authenticated;
grant select on public.travel_journeys, public.travel_journey_stops, public.travel_journey_photos to anon, authenticated;
grant insert, update, delete on public.travel_journeys, public.travel_journey_stops, public.travel_journey_photos to authenticated;

alter table public.travel_guides
  drop constraint if exists travel_guides_place_type_check;
alter table public.travel_guides
  add constraint travel_guides_place_type_check
  check (place_type in ('visited', 'wishlist', 'journey'));

commit;
