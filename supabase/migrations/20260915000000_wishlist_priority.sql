begin;

alter table public.travel_wishlist
  add column if not exists priority_level smallint not null default 2;

alter table public.travel_wishlist
  drop constraint if exists travel_wishlist_priority_level_check;

alter table public.travel_wishlist
  add constraint travel_wishlist_priority_level_check
  check (priority_level between 1 and 3);

comment on column public.travel_wishlist.priority_level is
  '想去程度：3 最想去，2 很想去，1 有机会去';

drop index if exists public.travel_wishlist_sort_idx;
create index travel_wishlist_sort_idx
  on public.travel_wishlist (priority_level desc, sort_order, name);

commit;
