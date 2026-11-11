-- Admin rename/archive/restore and deletion of EMPTY teams only.
-- Run after team categories. Repeatable; preserves all current club data.
begin;
alter table public.teams add column if not exists archived_at timestamptz;
alter table public.teams add column if not exists revision integer not null default 1 check (revision >= 1);

create or replace function public.track_team_revision() returns trigger
language plpgsql set search_path='' as $$
begin
  if row(old.name,old.category,old.archived_at) is distinct from row(new.name,new.category,new.archived_at) then
    new.revision := old.revision + 1;
  else new.revision := old.revision;
  end if;
  return new;
end;
$$;
revoke all on function public.track_team_revision() from public,anon,authenticated;
drop trigger if exists team_revision_changed on public.teams;
create trigger team_revision_changed before update on public.teams for each row execute function public.track_team_revision();

create or replace function public.admin_rename_team(p_team uuid,p_name text,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.teams; clean text := trim(regexp_replace(p_name,'\s+',' ','g'));
begin
  if not public.is_club_admin() then raise exception 'Solo administradores activos' using errcode='42501'; end if;
  if p_team is null or p_revision is null or p_revision < 1 or clean is null or char_length(clean) not between 1 and 80 then raise exception 'Nombre inválido' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('club-team:'||lower(clean),0));
  select * into existing from public.teams where id=p_team for update;
  if not found then raise exception 'Equipo no disponible' using errcode='22023'; end if;
  if existing.name=clean then return to_jsonb(existing); end if;
  if existing.revision <> p_revision then raise exception 'El equipo ha cambiado' using errcode='40001'; end if;
  if exists(select 1 from public.teams where id<>p_team and lower(name)=lower(clean)) then raise exception 'Nombre de equipo repetido' using errcode='23505'; end if;
  update public.teams set name=clean where id=p_team returning * into existing;
  return to_jsonb(existing);
end;
$$;
revoke all on function public.admin_rename_team(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.admin_rename_team(uuid,text,integer) to authenticated;

create or replace function public.admin_archive_team(p_team uuid,p_archived boolean,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.teams;
begin
  if not public.is_club_admin() then raise exception 'Solo administradores activos' using errcode='42501'; end if;
  if p_team is null or p_archived is null or p_revision is null or p_revision<1 then raise exception 'Equipo inválido' using errcode='22023'; end if;
  select * into existing from public.teams where id=p_team for update;
  if not found then raise exception 'Equipo no disponible' using errcode='22023'; end if;
  if (existing.archived_at is not null)=p_archived then return to_jsonb(existing); end if;
  if existing.revision<>p_revision then raise exception 'El equipo ha cambiado' using errcode='40001'; end if;
  update public.teams set archived_at=case when p_archived then clock_timestamp() else null end where id=p_team returning * into existing;
  return to_jsonb(existing);
end;
$$;
revoke all on function public.admin_archive_team(uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.admin_archive_team(uuid,boolean,integer) to authenticated;

create or replace function public.admin_delete_empty_team(p_team uuid,p_revision integer,p_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.teams;
begin
  if not public.is_club_admin() then raise exception 'Solo administradores activos' using errcode='42501'; end if;
  if p_team is null or p_revision is null or p_revision<1 or p_name is null then raise exception 'Equipo inválido' using errcode='22023'; end if;
  select * into existing from public.teams where id=p_team for update;
  if not found then return p_team; end if;
  if existing.revision<>p_revision or existing.name<>p_name then raise exception 'El equipo ha cambiado' using errcode='40001'; end if;
  if exists(select 1 from public.players where team_id=p_team)
    or exists(select 1 from public.attendance where team_id=p_team)
    or exists(select 1 from public.matches where team_id=p_team)
    or exists(select 1 from public.match_players where team_id=p_team)
    or exists(select 1 from public.training_plans where team_id=p_team) then
    raise exception 'El equipo tiene historial; archívalo para conservarlo' using errcode='55000';
  end if;
  -- Only team_coaches cascades; no player, match or training is ever deleted here.
  delete from public.teams where id=p_team;
  return p_team;
end;
$$;
revoke all on function public.admin_delete_empty_team(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.admin_delete_empty_team(uuid,integer,text) to authenticated;

-- History remains readable under existing RLS; every historical write API is guarded.
-- SHARE locks serialize in-flight writes/assignments with archive/delete operations.
create or replace function public.require_active_team() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if tg_table_name='team_coaches' then
    if exists(select 1 from public.team_coaches where team_id=new.team_id and user_id=new.user_id) then return new; end if;
  end if;
  target := case when tg_op='DELETE' then old.team_id else new.team_id end;
  perform 1 from public.teams where id=target and archived_at is null for share;
  if not found then raise exception 'El equipo está archivado o ya no está disponible; restaura el equipo para modificarlo' using errcode='55000'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.require_active_team() from public,anon,authenticated;
do $$ declare item text; begin
  foreach item in array array['players','attendance','matches','match_players','training_plans','team_coaches'] loop
    execute format('drop trigger if exists active_team_required on public.%I',item);
    execute format('create trigger active_team_required before insert or update%s on public.%I for each row execute function public.require_active_team()',case when item='team_coaches' then '' else ' or delete' end,item);
  end loop;
end $$;
commit;
