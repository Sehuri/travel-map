begin;

alter table public.travel_wishlist add column if not exists country text;
alter table public.travel_wishlist add column if not exists longitude numeric(9,6);
alter table public.travel_wishlist add column if not exists latitude numeric(8,6);
alter table public.travel_wishlist add column if not exists coordinate_system text not null default 'WGS84';
alter table public.travel_wishlist add column if not exists map_label text;

alter table public.travel_wishlist drop constraint if exists travel_wishlist_map_coordinates_check;
alter table public.travel_wishlist add constraint travel_wishlist_map_coordinates_check check (
  (longitude is null and latitude is null)
  or (longitude is not null and latitude is not null
      and longitude between -180 and 180 and latitude between -90 and 90
      and country is not null and btrim(country) <> '')
);
alter table public.travel_wishlist drop constraint if exists travel_wishlist_coordinate_system_check;
alter table public.travel_wishlist add constraint travel_wishlist_coordinate_system_check
  check (coordinate_system in ('WGS84', 'GCJ-02'));

comment on column public.travel_wishlist.longitude is '愿望目的地代表点经度；与纬度成对填写，空值使用代码预设';
comment on column public.travel_wishlist.latitude is '愿望目的地代表点纬度，不代表已到访';
comment on column public.travel_wishlist.coordinate_system is 'WGS84（GPS/Google）或 GCJ-02（高德/腾讯）';

-- Use the representative point in the owner's 2027 itinerary (Grindelwald).
-- Preserve all manually entered text, priority, visibility and existing coordinates.
update public.travel_wishlist
set country = '瑞士', longitude = 8.0341, latitude = 46.6243,
    coordinate_system = 'WGS84', map_label = coalesce(nullif(map_label, ''), '瑞士'),
    updated_at = now()
where name = '瑞士' and longitude is null and latitude is null;

notify pgrst, 'reload schema';
commit;
