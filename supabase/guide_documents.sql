begin;

create table if not exists public.travel_guides (
  id uuid primary key default gen_random_uuid(),
  place_type text not null check (place_type in ('visited', 'wishlist', 'journey')),
  place_name text not null,
  title text not null check (char_length(title) between 1 and 160),
  file_type text not null check (file_type in ('html', 'pdf')),
  file_url text not null,
  storage_path text not null unique,
  file_size bigint not null check (file_size between 1 and 20971520),
  is_hidden boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists travel_guides_place_idx
  on public.travel_guides (place_type, place_name, created_at desc);

alter table public.travel_guides enable row level security;

drop policy if exists travel_guides_public_read on public.travel_guides;
create policy travel_guides_public_read
on public.travel_guides for select
to anon, authenticated
using (is_hidden = false);

drop policy if exists travel_guides_owner_read on public.travel_guides;
create policy travel_guides_owner_read
on public.travel_guides for select
to authenticated
using (public.is_current_user_owner());

drop policy if exists travel_guides_owner_all on public.travel_guides;
drop policy if exists travel_guides_owner_insert on public.travel_guides;
create policy travel_guides_owner_insert
on public.travel_guides for insert
to authenticated
with check (public.is_current_user_owner() and (select auth.uid()) = created_by);

drop policy if exists travel_guides_owner_update on public.travel_guides;
create policy travel_guides_owner_update
on public.travel_guides for update
to authenticated
using (public.is_current_user_owner())
with check (public.is_current_user_owner() and (select auth.uid()) = created_by);

drop policy if exists travel_guides_owner_delete on public.travel_guides;
create policy travel_guides_owner_delete
on public.travel_guides for delete
to authenticated
using (public.is_current_user_owner());

revoke all on public.travel_guides from anon, authenticated;
grant select on public.travel_guides to anon, authenticated;
grant insert, update, delete on public.travel_guides to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'travel-guides',
  'travel-guides',
  true,
  20971520,
  array['text/html', 'application/xhtml+xml', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists travel_guides_storage_public_read on storage.objects;
create policy travel_guides_storage_public_read
on storage.objects for select
to public
using (bucket_id = 'travel-guides');

drop policy if exists travel_guides_storage_owner_insert on storage.objects;
create policy travel_guides_storage_owner_insert
on storage.objects for insert
to authenticated
with check (bucket_id = 'travel-guides' and public.is_current_user_owner());

drop policy if exists travel_guides_storage_owner_update on storage.objects;
create policy travel_guides_storage_owner_update
on storage.objects for update
to authenticated
using (bucket_id = 'travel-guides' and public.is_current_user_owner())
with check (bucket_id = 'travel-guides' and public.is_current_user_owner());

drop policy if exists travel_guides_storage_owner_delete on storage.objects;
create policy travel_guides_storage_owner_delete
on storage.objects for delete
to authenticated
using (bucket_id = 'travel-guides' and public.is_current_user_owner());

commit;
