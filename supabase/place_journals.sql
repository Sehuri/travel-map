-- 景点手记 v1. Review and run as project owner after explicit authorization.
-- Prerequisites: admin_backend.sql, journeys.sql, attraction_ratings.sql.
-- No seed records. Existing cities, journeys, albums and public votes are untouched.
begin;
create table if not exists public.journal_places (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 name text not null check(length(btrim(name)) between 1 and 160),
 country text not null default '', location text not null default '', kind text not null default 'other',
 longitude numeric, latitude numeric, city_name text, attraction_id text references public.travel_attractions(id),
 created_at timestamptz not null default now(),
 check ((longitude is null and latitude is null) or (longitude between -180 and 180 and latitude between -90 and 90 and longitude is not null and latitude is not null))
);
create table if not exists public.journal_entries (
 id uuid primary key, owner_id uuid not null references auth.users(id),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 visibility text not null default 'private' check(visibility in ('private','public')),
 published_version_id uuid, revision bigint not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), published_at timestamptz
);
create table if not exists public.journal_versions (
 id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.journal_entries(id),
 place_id uuid not null references public.journal_places(id), content jsonb not null,
 created_at timestamptz not null default now(), unique(entry_id,id)
);
do $$begin
 if not exists(select 1 from pg_constraint where conname='journal_current_version_fk') then
 alter table public.journal_entries add constraint journal_current_version_fk foreign key(id,published_version_id) references public.journal_versions(entry_id,id);
 end if;
end$$;
create table if not exists public.journal_drafts (
 entry_id uuid primary key references public.journal_entries(id), place_id uuid not null references public.journal_places(id),
 content jsonb not null, visibility text not null default 'private' check(visibility in ('private','public')),
 updated_at timestamptz not null default now()
);
create table if not exists public.journal_media (
 id uuid primary key, entry_id uuid not null references public.journal_entries(id),
 source text not null check(source in ('private','public_album')),
 object_path text unique, thumb_path text unique, public_url text,
 ready boolean not null default false, created_at timestamptz not null default now(),
 check ((source='private' and object_path is not null and thumb_path is not null and public_url is null)
 or (source='public_album' and public_url is not null and object_path is null and thumb_path is null))
);
create index if not exists journal_versions_place_idx on public.journal_versions(place_id);
create index if not exists journal_media_entry_idx on public.journal_media(entry_id);

-- Definer helpers avoid policy recursion. They return only permission booleans.
create or replace function public.pj_can_read_entry(e uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from journal_entries where id=e and (is_current_user_owner() or (status='published' and visibility='public' and published_version_id is not null)))
$$;
create or replace function public.pj_can_read_version(v uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select is_current_user_owner() or exists(select 1 from journal_entries where published_version_id=v and status='published' and visibility='public')
$$;
create or replace function public.pj_can_read_place(p uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select is_current_user_owner() or exists(select 1 from journal_versions v join journal_entries e on e.published_version_id=v.id where v.place_id=p and e.status='published' and e.visibility='public')
$$;
create or replace function public.pj_can_read_media(m uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select is_current_user_owner() or exists(select 1 from journal_media m1 join journal_entries e on e.id=m1.entry_id join journal_versions v on v.id=e.published_version_id
 where m1.id=m and m1.ready and e.status='published' and e.visibility='public' and exists(select 1 from jsonb_array_elements(v.content->'photos') p where p->>'id'=m::text))
$$;
create or replace function public.pj_can_read_object(p text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from journal_media m where (m.object_path=p or m.thumb_path=p) and pj_can_read_media(m.id))
$$;
create or replace function public.pj_can_upload_object(p text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select is_current_user_owner() and exists(select 1 from journal_media m where not m.ready and m.source='private' and (m.object_path=p or m.thumb_path=p))
$$;

alter table public.journal_places enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_versions enable row level security;
alter table public.journal_drafts enable row level security;
alter table public.journal_media enable row level security;
-- Writes go through atomic owner-only RPCs, not direct REST writes.
revoke all on public.journal_places,public.journal_entries,public.journal_versions,public.journal_drafts,public.journal_media from anon,authenticated;
grant select on public.journal_places,public.journal_entries,public.journal_versions,public.journal_media to anon,authenticated;
grant select on public.journal_drafts to authenticated;
drop policy if exists journal_places_read on public.journal_places;
create policy journal_places_read on public.journal_places for select to anon,authenticated using (pj_can_read_place(id));
drop policy if exists journal_entries_read on public.journal_entries;
create policy journal_entries_read on public.journal_entries for select to anon,authenticated using (is_current_user_owner());
drop policy if exists journal_versions_read on public.journal_versions;
create policy journal_versions_read on public.journal_versions for select to anon,authenticated using (pj_can_read_version(id));
drop policy if exists journal_drafts_read on public.journal_drafts;
create policy journal_drafts_read on public.journal_drafts for select to authenticated using (is_current_user_owner());
drop policy if exists journal_media_read on public.journal_media;
create policy journal_media_read on public.journal_media for select to anon,authenticated using (pj_can_read_media(id));

-- Public projection does not expose revision counters or private-draft update times.
create or replace view public.journal_public_entries with (security_barrier=true) as
 select id,status,visibility,published_version_id,created_at,published_at,published_at as updated_at
 from public.journal_entries where status='published' and visibility='public' and published_version_id is not null;
revoke all on public.journal_public_entries from public;
grant select on public.journal_public_entries to anon,authenticated;

create or replace function public.pj_check_content(e uuid,c jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p jsonb;begin
 if jsonb_typeof(c)<>'object' or length(coalesce(c->>'title',''))>240 or length(coalesce(c->>'body',''))>50000 then raise exception '手记内容格式或长度不正确'; end if;
 if c->>'visit_date' is not null and c->>'visit_date'<>'' then perform (c->>'visit_date')::date; end if;
 if c->>'rating' is not null and ((c->>'rating')::numeric not between 1 and 10 or (c->>'rating')::numeric<>trunc((c->>'rating')::numeric)) then raise exception '评分必须为 1–10 整数或空值'; end if;
 if c->>'revisit' is not null and c->>'revisit' not in ('yes','no','maybe') then raise exception '再访意愿不正确'; end if;
 if jsonb_typeof(c->'tags') is distinct from 'array' or jsonb_array_length(c->'tags')>20 then raise exception '标签格式不正确'; end if;
 if exists(select 1 from jsonb_array_elements(c->'tags') t where jsonb_typeof(t)<>'string' or length(t#>>'{}')>40) then raise exception '标签过长'; end if;
 if jsonb_typeof(c->'photos') is distinct from 'array' or jsonb_array_length(c->'photos')>100 then raise exception '照片数量或格式不正确'; end if;
 for p in select * from jsonb_array_elements(c->'photos') loop
  if not exists(select 1 from journal_media m where m.id=(p->>'id')::uuid and m.entry_id=e and m.ready) then raise exception '照片尚未上传完成或不属于本篇手记'; end if;
  if length(coalesce(p->>'caption',''))>500 then raise exception '照片说明过长'; end if;
 end loop;
 if c->>'cover_id' is not null and not exists(select 1 from jsonb_array_elements(c->'photos') photo where photo->>'id'=c->>'cover_id') then raise exception '封面必须来自本篇照片'; end if;
end$$;

create or replace function public.journal_save_draft(p_id uuid,p_place_id uuid,p_place jsonb,p_content jsonb,p_visibility text,p_revision bigint)
 returns public.journal_entries language plpgsql security definer set search_path=public,pg_temp as $$
declare e journal_entries;old_place journal_places;normalized jsonb;begin
 if not is_current_user_owner() or auth.uid() is null then raise exception '仅主人可写入' using errcode='42501'; end if;
 if p_visibility not in ('public','private') then raise exception '可见性不正确'; end if;
 insert into journal_entries(id,owner_id) values(p_id,auth.uid()) on conflict do nothing;
 select * into e from journal_entries where id=p_id for update;
 if e.owner_id<>auth.uid() or e.revision is distinct from p_revision then raise exception '记录已更新，请重新打开后编辑，当前输入未丢失' using errcode='40001'; end if;
 select * into old_place from journal_places where id=p_place_id for update;
 normalized:=jsonb_build_object('name',btrim(p_place->>'name'),'country',coalesce(p_place->>'country',''),'location',coalesce(p_place->>'location',''),'kind',coalesce(p_place->>'kind','other'),
 'longitude',nullif(p_place->>'longitude','')::numeric,'latitude',nullif(p_place->>'latitude','')::numeric,'city_name',nullif(p_place->>'city_name',''),'attraction_id',nullif(p_place->>'attraction_id',''));
 if old_place.id is not null and (to_jsonb(old_place)-'id'-'owner_id'-'created_at') is distinct from normalized then
  if old_place.owner_id<>auth.uid() or exists(select 1 from journal_versions where place_id=p_place_id) or exists(select 1 from journal_drafts where place_id=p_place_id and entry_id<>p_id) then
   raise exception '地点已被其他手记或发布版本引用，请明确复制地点资料后再修改';
  end if;
  update journal_places set name=normalized->>'name',country=normalized->>'country',location=normalized->>'location',kind=normalized->>'kind',longitude=(normalized->>'longitude')::numeric,latitude=(normalized->>'latitude')::numeric,city_name=normalized->>'city_name',attraction_id=normalized->>'attraction_id' where id=p_place_id;
 end if;
 if old_place.id is null then
  insert into journal_places(id,owner_id,name,country,location,kind,longitude,latitude,city_name,attraction_id)
  values(p_place_id,auth.uid(),btrim(p_place->>'name'),coalesce(p_place->>'country',''),coalesce(p_place->>'location',''),coalesce(p_place->>'kind','other'),nullif(p_place->>'longitude','')::numeric,nullif(p_place->>'latitude','')::numeric,nullif(p_place->>'city_name',''),nullif(p_place->>'attraction_id',''));
 end if;
 if not exists(select 1 from journal_places where id=p_place_id and owner_id=auth.uid()) then raise exception '地点不可用'; end if;
 perform pj_check_content(p_id,p_content);
 insert into journal_drafts(entry_id,place_id,content,visibility) values(p_id,p_place_id,p_content,p_visibility)
 on conflict(entry_id) do update set place_id=excluded.place_id,content=excluded.content,visibility=excluded.visibility,updated_at=now();
 update journal_entries set revision=revision+1,visibility=case when status='draft' then p_visibility else visibility end,updated_at=now() where id=p_id returning * into e;
 return e;
end$$;
create or replace function public.journal_publish(p_id uuid,p_revision bigint,p_visibility text) returns public.journal_entries
 language plpgsql security definer set search_path=public,pg_temp as $$
declare e journal_entries;d journal_drafts;v uuid;begin
 if not is_current_user_owner() then raise exception '仅主人可发布' using errcode='42501'; end if;
 select * into e from journal_entries where id=p_id and owner_id=auth.uid() for update;
 if e.id is null or e.revision is distinct from p_revision then raise exception '记录已更新，请重新打开后编辑' using errcode='40001'; end if;
 select * into d from journal_drafts where entry_id=p_id;
 if d.entry_id is null then raise exception '请先保存草稿'; end if;
 if p_visibility is distinct from d.visibility then raise exception '请重新确认可见性'; end if;
 if not exists(select 1 from journal_places where id=d.place_id and length(btrim(location))>0) then raise exception '发布需要地点名称和位置文字'; end if;
 if length(btrim(coalesce(d.content->>'body','')))=0 and jsonb_array_length(d.content->'photos')=0 then raise exception '请填写感受或添加有效照片'; end if;
 if length(btrim(coalesce(d.content->>'title','')))=0 then raise exception '请确认手记标题'; end if;
 perform pj_check_content(p_id,d.content);
 if p_visibility='public' and exists(select 1 from travel_journeys where slug=d.content->>'journey_slug' and not is_published) then
  d.content:=d.content-'journey_slug';
 end if;
 insert into journal_versions(entry_id,place_id,content) values(p_id,d.place_id,d.content) returning id into v;
 update journal_entries set status='published',visibility=p_visibility,published_version_id=v,revision=revision+1,updated_at=now(),published_at=now() where id=p_id returning * into e;
 delete from journal_drafts where entry_id=p_id;
 return e;
end$$;
create or replace function public.journal_set_state(p_id uuid,p_revision bigint,p_action text) returns public.journal_entries
 language plpgsql security definer set search_path=public,pg_temp as $$
declare e journal_entries;begin
 if not is_current_user_owner() then raise exception '仅主人可操作' using errcode='42501'; end if;
 select * into e from journal_entries where id=p_id and owner_id=auth.uid() for update;
 if e.id is null or e.revision is distinct from p_revision then raise exception '记录已更新，请重新打开后操作' using errcode='40001'; end if;
 if p_action not in ('withdraw','archive','restore') then raise exception '操作不正确'; end if;
 update journal_entries set visibility=case when p_action='withdraw' then 'private' else visibility end,
 status=case when p_action='archive' then 'archived' when p_action='restore' then 'draft' else status end,
 revision=revision+1,updated_at=now() where id=p_id returning * into e;
 return e;
end$$;
create or replace function public.journal_register_media(p_entry_id uuid,p_id uuid,p_public_url text default null) returns public.journal_media
 language plpgsql security definer set search_path=public,pg_temp as $$
declare m journal_media;begin
 if not is_current_user_owner() or not exists(select 1 from journal_entries where id=p_entry_id and owner_id=auth.uid()) then raise exception '仅主人可上传' using errcode='42501'; end if;
 if p_public_url is not null then
  if not exists(select 1 from city_photos where image_url=p_public_url and not is_hidden)
   and not (p_public_url like './photos/%' and p_public_url not like '%..%' and p_public_url !~ '[?#]') then raise exception '请选择现有公开相册照片'; end if;
 end if;
 insert into journal_media(id,entry_id,source,object_path,thumb_path,public_url,ready)
 values(p_id,p_entry_id,case when p_public_url is null then 'private' else 'public_album' end,
 case when p_public_url is null then p_entry_id::text||'/'||p_id::text||'/image.webp' end,
 case when p_public_url is null then p_entry_id::text||'/'||p_id::text||'/thumb.webp' end,p_public_url,p_public_url is not null) returning * into m;
 return m;
end$$;
create or replace function public.journal_complete_media(p_id uuid) returns public.journal_media
 language plpgsql security definer set search_path=public,pg_temp as $$
declare m journal_media;begin
 if not is_current_user_owner() then raise exception '仅主人可上传' using errcode='42501'; end if;
 select * into m from journal_media where id=p_id;
 if m.id is null or not exists(select 1 from journal_entries where id=m.entry_id and owner_id=auth.uid()) then raise exception '图片不可用'; end if;
 if m.source='private' and (not exists(select 1 from storage.objects where bucket_id='place-journal-media' and name=m.object_path) or not exists(select 1 from storage.objects where bucket_id='place-journal-media' and name=m.thumb_path)) then raise exception '照片上传未完成，请重试'; end if;
 update journal_media set ready=true where id=p_id returning * into m;return m;
end$$;

revoke all on function public.pj_check_content(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.journal_save_draft(uuid,uuid,jsonb,jsonb,text,bigint),public.journal_publish(uuid,bigint,text),public.journal_set_state(uuid,bigint,text),public.journal_register_media(uuid,uuid,text),public.journal_complete_media(uuid) from public,anon,authenticated;
grant execute on function public.journal_save_draft(uuid,uuid,jsonb,jsonb,text,bigint),public.journal_publish(uuid,bigint,text),public.journal_set_state(uuid,bigint,text),public.journal_register_media(uuid,uuid,text),public.journal_complete_media(uuid) to authenticated;

create or replace function public.journal_place_editable(p_place_id uuid,p_entry_id uuid) returns boolean
 language sql stable security definer set search_path=public,pg_temp as $$
 select is_current_user_owner()
 and exists(select 1 from journal_entries where id=p_entry_id and owner_id=auth.uid())
 and exists(select 1 from journal_places where id=p_place_id and owner_id=auth.uid())
 and not exists(select 1 from journal_versions where place_id=p_place_id)
 and not exists(select 1 from journal_drafts where place_id=p_place_id and entry_id<>p_entry_id)
$$;
revoke all on function public.journal_place_editable(uuid,uuid) from public,anon;
grant execute on function public.journal_place_editable(uuid,uuid) to authenticated;

create or replace function public.journal_linked_journey(p_id uuid) returns jsonb
 language plpgsql stable security definer set search_path=public,pg_temp as $$
declare s text;j travel_journeys;begin
 if not pj_can_read_entry(p_id) then return null; end if;
 select v.content->>'journey_slug' into s from journal_entries e join journal_versions v on e.published_version_id=v.id where e.id=p_id;
 if s is null then return null; end if;
 select * into j from travel_journeys where slug=s;
 if j.id is not null then
  if not j.is_published and not is_current_user_owner() then return null; end if;
  return jsonb_build_object('slug',j.slug,'title',j.title);
 end if;
 return jsonb_build_object('slug',s,'builtin',true);
end$$;
revoke all on function public.journal_linked_journey(uuid) from public;
grant execute on function public.journal_linked_journey(uuid) to anon,authenticated;

-- This bucket must remain PRIVATE. Never use getPublicUrl or signed URLs for new media.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('place-journal-media','place-journal-media',false,15728640,array['image/webp']) on conflict(id) do nothing;
do $$begin
 if exists(select 1 from storage.buckets where id='place-journal-media' and public) then raise exception 'place-journal-media 必须是私有桶，请先审查配置'; end if;
end$$;
drop policy if exists journal_objects_read on storage.objects;
create policy journal_objects_read on storage.objects for select to anon,authenticated using(bucket_id='place-journal-media' and public.pj_can_read_object(name));
drop policy if exists journal_objects_insert on storage.objects;
create policy journal_objects_insert on storage.objects for insert to authenticated with check(bucket_id='place-journal-media' and public.pj_can_upload_object(name));
-- No UPDATE/DELETE policy: images are immutable, removal only removes a reference.
commit;
