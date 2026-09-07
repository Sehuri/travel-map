begin;

alter table public.travel_wishlist
  add column if not exists planned_time text;

comment on column public.travel_wishlist.planned_time is
  'Optional free-form planned travel time shown on the public wishlist.';

delete from public.travel_wishlist
where name = '成都 · 重庆';

commit;
