begin;

create table if not exists public.travel_cities (
  name text primary key,
  country text not null,
  region text,
  visit_date date not null,
  longitude numeric(9,6) not null check (longitude between -180 and 180),
  latitude numeric(8,6) not null check (latitude between -90 and 90),
  description text not null default '',
  cover_url text,
  is_hidden boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.travel_wishlist (
  name text primary key,
  icon text not null default '○',
  description text not null default '',
  guide text not null default '',
  sort_order integer not null default 0,
  is_hidden boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.city_photos (
  id uuid primary key default gen_random_uuid(),
  city_name text not null,
  image_url text not null,
  storage_path text,
  caption text,
  sort_order integer not null default 0,
  is_hidden boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (city_name, image_url)
);

create index if not exists city_photos_city_sort_idx
  on public.city_photos (city_name, sort_order, created_at);
alter table public.city_photos add column if not exists is_hidden boolean not null default false;
create index if not exists travel_wishlist_sort_idx
  on public.travel_wishlist (sort_order, name);

alter table public.travel_cities enable row level security;
alter table public.travel_wishlist enable row level security;
alter table public.city_photos enable row level security;

drop policy if exists travel_cities_public_read on public.travel_cities;
create policy travel_cities_public_read
on public.travel_cities for select
to anon, authenticated
using (true);

drop policy if exists travel_cities_owner_insert on public.travel_cities;
create policy travel_cities_owner_insert
on public.travel_cities for insert
to authenticated
with check (public.is_current_user_owner() and (select auth.uid()) = updated_by);

drop policy if exists travel_cities_owner_update on public.travel_cities;
create policy travel_cities_owner_update
on public.travel_cities for update
to authenticated
using (public.is_current_user_owner())
with check (public.is_current_user_owner() and (select auth.uid()) = updated_by);

drop policy if exists travel_cities_owner_delete on public.travel_cities;
create policy travel_cities_owner_delete
on public.travel_cities for delete
to authenticated
using (public.is_current_user_owner());

drop policy if exists travel_wishlist_public_read on public.travel_wishlist;
create policy travel_wishlist_public_read
on public.travel_wishlist for select
to anon, authenticated
using (true);

drop policy if exists travel_wishlist_owner_all on public.travel_wishlist;
create policy travel_wishlist_owner_all
on public.travel_wishlist for all
to authenticated
using (public.is_current_user_owner())
with check (public.is_current_user_owner() and (select auth.uid()) = updated_by);

drop policy if exists city_photos_public_read on public.city_photos;
create policy city_photos_public_read
on public.city_photos for select
to anon, authenticated
using (true);

drop policy if exists city_photos_owner_all on public.city_photos;
create policy city_photos_owner_all
on public.city_photos for all
to authenticated
using (public.is_current_user_owner())
with check (public.is_current_user_owner() and (select auth.uid()) = created_by);

drop policy if exists city_ratings_owner_read on public.city_ratings;
create policy city_ratings_owner_read
on public.city_ratings for select
to authenticated
using (public.is_current_user_owner());

drop policy if exists city_ratings_owner_delete on public.city_ratings;
create policy city_ratings_owner_delete
on public.city_ratings for delete
to authenticated
using (public.is_current_user_owner());

revoke all on public.travel_cities from anon, authenticated;
revoke all on public.travel_wishlist from anon, authenticated;
revoke all on public.city_photos from anon, authenticated;
grant select on public.travel_cities, public.travel_wishlist, public.city_photos to anon, authenticated;
grant insert, update, delete on public.travel_cities, public.travel_wishlist, public.city_photos to authenticated;
grant delete on public.city_ratings to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'city-photos',
  'city-photos',
  true,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists city_photos_storage_public_read on storage.objects;
create policy city_photos_storage_public_read
on storage.objects for select
to public
using (bucket_id = 'city-photos');

drop policy if exists city_photos_storage_owner_insert on storage.objects;
create policy city_photos_storage_owner_insert
on storage.objects for insert
to authenticated
with check (bucket_id = 'city-photos' and public.is_current_user_owner());

drop policy if exists city_photos_storage_owner_update on storage.objects;
create policy city_photos_storage_owner_update
on storage.objects for update
to authenticated
using (bucket_id = 'city-photos' and public.is_current_user_owner())
with check (bucket_id = 'city-photos' and public.is_current_user_owner());

drop policy if exists city_photos_storage_owner_delete on storage.objects;
create policy city_photos_storage_owner_delete
on storage.objects for delete
to authenticated
using (bucket_id = 'city-photos' and public.is_current_user_owner());

commit;
