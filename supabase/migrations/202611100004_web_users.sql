-- Admin-only user directory and atomic provisioning from the club-users function.
-- Requires the initial club schema. Safe to run again; existing accounts are unchanged.
begin;
create or replace function public.provision_web_coach() returns trigger
language plpgsql security definer set search_path = '' as $$
declare payload jsonb; actor uuid; team_ids uuid[];
begin
  payload := new.raw_app_meta_data->'club_provisioning';
  if payload is null then return new; end if;
  if tg_op='UPDATE' and old.raw_app_meta_data->'club_provisioning' is not distinct from payload then return new; end if;
  if jsonb_typeof(payload) <> 'object' or payload->>'version' is distinct from '1'
    or payload->>'request_id' is distinct from new.id::text
    or jsonb_typeof(payload->'team_ids') is distinct from 'array' then
    raise exception 'Alta del club inválida' using errcode='22023';
  end if;
  actor := (payload->>'actor_id')::uuid;
  if actor is null or actor=new.id then raise exception 'Administrador no autorizado' using errcode='42501'; end if;
  perform 1 from public.club_members where user_id=actor and role='admin' and enabled for share;
  if not found then raise exception 'Administrador no autorizado' using errcode='42501'; end if;
  select array_agg(value::uuid order by value) into team_ids from jsonb_array_elements_text(payload->'team_ids');
  if cardinality(team_ids) is null or cardinality(team_ids) not between 1 and 20
    or (select count(distinct value) from unnest(team_ids) value) <> cardinality(team_ids)
    or (select count(*) from public.teams where id=any(team_ids)) <> cardinality(team_ids) then
    raise exception 'Equipos inválidos' using errcode='22023';
  end if;
  -- Never reactivate or rewrite an existing membership through Auth metadata updates.
  if exists(select 1 from public.club_members where user_id=new.id) then
    raise exception 'La membresía ya existe' using errcode='23505';
  end if;
  insert into public.club_members(user_id,role,enabled) values(new.id,'coach',true);
  insert into public.team_coaches(team_id,user_id) select value,new.id from unnest(team_ids) value;
  return new;
end;
$$;
revoke all on function public.provision_web_coach() from public, anon, authenticated;
drop trigger if exists club_web_coach_provision on auth.users;
-- GoTrue may apply app_metadata in an UPDATE after the initial INSERT, in the
-- same transaction. Both paths must provision together with the Auth account.
create trigger club_web_coach_provision after insert or update of raw_app_meta_data on auth.users
  for each row execute function public.provision_web_coach();

create or replace function public.admin_user_setup_ready() returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_club_admin() then raise exception 'Solo administradores' using errcode='42501'; end if;
  return case when exists(select 1 from pg_catalog.pg_trigger where tgname='club_web_coach_provision'
    and tgrelid='auth.users'::regclass and tgfoid='public.provision_web_coach'::regproc and tgenabled in ('O','A')) then 1 else 0 end;
end;
$$;
revoke all on function public.admin_user_setup_ready() from public, anon, authenticated;
grant execute on function public.admin_user_setup_ready() to authenticated;

create or replace function public.admin_list_users(p_offset integer default 0, p_limit integer default 100)
returns table(user_id uuid,email text,display_name text,role text,enabled boolean,team_ids uuid[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_club_admin() then raise exception 'Solo administradores' using errcode='42501'; end if;
  if p_offset is null or p_offset < 0 or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Paginación inválida' using errcode='22023';
  end if;
  return query select u.id,u.email::text,
    left(coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),nullif(trim(u.raw_user_meta_data->>'full_name'),''),u.email,''),80),
    m.role,m.enabled,array(select tc.team_id from public.team_coaches tc where tc.user_id=u.id order by tc.team_id)
    from public.club_members m join auth.users u on u.id=m.user_id
    order by lower(coalesce(u.email,'')),u.id offset p_offset limit p_limit;
end;
$$;
revoke all on function public.admin_list_users(integer,integer) from public, anon, authenticated;
grant execute on function public.admin_list_users(integer,integer) to authenticated;

create or replace function public.admin_create_team(p_id uuid,p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare existing public.teams; clean text := trim(regexp_replace(p_name,'\s+',' ','g'));
begin
  if not public.is_club_admin() then raise exception 'Solo administradores' using errcode='42501'; end if;
  if p_id is null or clean is null or char_length(clean) not between 1 and 80 then
    raise exception 'Nombre de equipo inválido' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('club-team:'||lower(clean),0));
  select * into existing from public.teams where id=p_id for update;
  if existing.id is not null then
    if existing.name=clean then return to_jsonb(existing); end if;
    raise exception 'El equipo ya existe con otro nombre' using errcode='40001';
  end if;
  if exists(select 1 from public.teams where lower(name)=lower(clean)) then
    raise exception 'Ya existe un equipo con ese nombre' using errcode='23505';
  end if;
  insert into public.teams(id,name) values(p_id,clean) returning * into existing;
  return to_jsonb(existing);
end;
$$;
revoke all on function public.admin_create_team(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_create_team(uuid,text) to authenticated;
commit;
