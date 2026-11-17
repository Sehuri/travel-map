-- Apply AFTER place_journals.sql, only after review and authorization.
-- Display metadata only. No content, date, owner or storage permission changes.
begin;
alter table public.journal_entries add column if not exists pinned_at timestamptz;
alter table public.journal_entries add column if not exists presentation_revision bigint not null default 0;
-- Only the latest reversible display operation, not an operation-history table.
alter table public.journal_entries add column if not exists presentation_undo jsonb;

create or replace function public.pj_clear_ineligible_pin() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare was_public boolean;is_public boolean;begin
 was_public:=old.status='published' and old.visibility='public' and old.published_version_id is not null;
 is_public:=new.status='published' and new.visibility='public' and new.published_version_id is not null;
 if not is_public and (was_public or new.pinned_at is not null or new.presentation_undo is not null) then
  new.pinned_at:=null;new.presentation_undo:=null;new.presentation_revision:=old.presentation_revision+1;
 elsif is_public and not was_public then
  -- A newly published entry never inherits dirty/previous private display data.
  new.pinned_at:=null;new.presentation_undo:=null;
  if old.pinned_at is not null or old.presentation_undo is not null then new.presentation_revision:=old.presentation_revision+1;end if;
 end if;
 return new;
end$$;
revoke all on function public.pj_clear_ineligible_pin() from public,anon,authenticated;
drop trigger if exists journal_clear_ineligible_pin on public.journal_entries;
create trigger journal_clear_ineligible_pin before update on public.journal_entries
 for each row execute function public.pj_clear_ineligible_pin();

-- Append a column; keep all existing projection columns and their order.
create or replace view public.journal_public_entries with (security_barrier=true) as
 select id,status,visibility,published_version_id,created_at,published_at,published_at as updated_at,
 case when status='published' and visibility='public' and published_version_id is not null then pinned_at else null end as pinned_at
 from public.journal_entries where status='published' and visibility='public' and published_version_id is not null;
revoke all on public.journal_public_entries from public;
grant select on public.journal_public_entries to anon,authenticated;

create or replace function public.pj_pin_result(e public.journal_entries) returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',e.id,'status',e.status,'visibility',e.visibility,'published_version_id',e.published_version_id,
  'pinned_at',e.pinned_at,'presentation_revision',e.presentation_revision,
  'operation_id',e.presentation_undo->>'operation_id',
  'undo_token',case when e.presentation_undo->>'kind'='set' then e.presentation_undo->>'token' end)
$$;
revoke all on function public.pj_pin_result(public.journal_entries) from public,anon,authenticated;

create or replace function public.journal_pin_status(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare e journal_entries;begin
 if not is_current_user_owner() or auth.uid() is null then raise exception '仅主人可管理置顶' using errcode='42501'; end if;
 select * into e from journal_entries where id=p_id and owner_id=auth.uid();
 if e.id is null then raise exception '记录状态已变化，请刷新后再操作' using errcode='40001'; end if;
 return pj_pin_result(e);
end$$;

create or replace function public.journal_set_pin(p_id uuid,p_pinned boolean,p_presentation_revision bigint,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare e journal_entries;previous timestamptz;begin
 if not is_current_user_owner() or auth.uid() is null then raise exception '仅主人可管理置顶' using errcode='42501'; end if;
 if p_pinned is null or p_operation_id is null or p_presentation_revision is null then raise exception '置顶参数不完整' using errcode='22023'; end if;
 select * into e from journal_entries where id=p_id and owner_id=auth.uid() for update;
 if e.id is null or e.status<>'published' or e.visibility<>'public' or e.published_version_id is null then
  raise exception '记录状态已变化，请刷新后再操作' using errcode='40001';
 end if;
 if e.presentation_undo->>'operation_id'=p_operation_id::text then
  if e.presentation_undo->>'kind'<>'set' or (e.pinned_at is not null)<>p_pinned then raise exception '操作标识已使用' using errcode='22023'; end if;
  return pj_pin_result(e);
 end if;
 -- Setting an already-achieved target is a no-op, even after a stale read.
 if (e.pinned_at is not null)=p_pinned then return pj_pin_result(e); end if;
 if e.presentation_revision<>p_presentation_revision then raise exception '记录状态已变化，请刷新后再操作' using errcode='40001'; end if;
 previous:=e.pinned_at;
 update journal_entries set pinned_at=case when p_pinned then clock_timestamp() else null end,
  presentation_revision=presentation_revision+1,
  presentation_undo=jsonb_build_object('kind','set','operation_id',p_operation_id,'token',gen_random_uuid(),'previous_pinned_at',previous)
 where id=p_id returning * into e;
 return pj_pin_result(e);
end$$;

create or replace function public.journal_restore_pin(p_id uuid,p_presentation_revision bigint,p_undo_token uuid,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare e journal_entries;previous timestamptz;begin
 if not is_current_user_owner() or auth.uid() is null then raise exception '仅主人可管理置顶' using errcode='42501'; end if;
 if p_operation_id is null or p_undo_token is null or p_presentation_revision is null then raise exception '撤销参数不完整' using errcode='22023'; end if;
 select * into e from journal_entries where id=p_id and owner_id=auth.uid() for update;
 if e.id is null or e.status<>'published' or e.visibility<>'public' or e.published_version_id is null then
  raise exception '记录状态已变化，请刷新后再操作' using errcode='40001';
 end if;
 if e.presentation_undo->>'operation_id'=p_operation_id::text and e.presentation_undo->>'kind'='undo' then return pj_pin_result(e); end if;
 if e.presentation_revision<>p_presentation_revision or e.presentation_undo->>'kind' is distinct from 'set'
  or e.presentation_undo->>'token' is distinct from p_undo_token::text then
  raise exception '记录状态已变化，请刷新后再操作' using errcode='40001';
 end if;
 previous:=(e.presentation_undo->>'previous_pinned_at')::timestamptz;
 update journal_entries set pinned_at=previous,presentation_revision=presentation_revision+1,
  presentation_undo=jsonb_build_object('kind','undo','operation_id',p_operation_id)
 where id=p_id returning * into e;
 return pj_pin_result(e);
end$$;
revoke all on function public.journal_pin_status(uuid),public.journal_set_pin(uuid,boolean,bigint,uuid),public.journal_restore_pin(uuid,bigint,uuid,uuid) from public,anon,authenticated;
grant execute on function public.journal_pin_status(uuid),public.journal_set_pin(uuid,boolean,bigint,uuid),public.journal_restore_pin(uuid,bigint,uuid,uuid) to authenticated;
commit;
