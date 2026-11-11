-- Explicit team category. Run after 202611100004_web_users.sql.
-- Repeatable: existing teams start without a category; no names or history are changed.
begin;
alter table public.teams add column if not exists category text
  check (category in ('Minis','Prebenjamín','Benjamín','Alevín','Infantil','Cadete','Juvenil','Femenino','Regional'));

create or replace function public.admin_create_team_with_category(p_id uuid, p_name text, p_category text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.teams; clean text := trim(regexp_replace(p_name,'\s+',' ','g'));
begin
  if not public.is_club_admin() then raise exception 'Solo administradores' using errcode='42501'; end if;
  if p_id is null or clean is null or char_length(clean) not between 1 and 80 then
    raise exception 'Nombre de equipo inválido' using errcode='22023';
  end if;
  if p_category is not null and p_category not in ('Minis','Prebenjamín','Benjamín','Alevín','Infantil','Cadete','Juvenil','Femenino','Regional') then
    raise exception 'Categoría de equipo inválida' using errcode='22023';
  end if;
  -- Same lock as the previous creation API, which remains available for older clients.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('club-team:'||lower(clean),0));
  select * into existing from public.teams where id=p_id for update;
  if found then
    if existing.name=clean and existing.category is not distinct from p_category then return to_jsonb(existing); end if;
    raise exception 'El equipo ya existe con otros datos' using errcode='40001';
  end if;
  if exists(select 1 from public.teams where lower(name)=lower(clean)) then
    raise exception 'Ya existe un equipo con ese nombre' using errcode='23505';
  end if;
  insert into public.teams(id,name,category) values(p_id,clean,p_category) returning * into existing;
  return to_jsonb(existing);
end;
$$;
revoke all on function public.admin_create_team_with_category(uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_create_team_with_category(uuid,text,text) to authenticated;

create or replace function public.admin_set_team_category(p_team uuid, p_category text, p_expected_category text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing public.teams;
begin
  if not public.is_club_admin() then raise exception 'Solo administradores' using errcode='42501'; end if;
  if p_team is null or (p_category is not null and p_category not in ('Minis','Prebenjamín','Benjamín','Alevín','Infantil','Cadete','Juvenil','Femenino','Regional')) then
    raise exception 'Categoría o equipo inválidos' using errcode='22023';
  end if;
  select * into existing from public.teams where id=p_team for update;
  if not found then raise exception 'El equipo ya no está disponible' using errcode='22023'; end if;
  -- A lost-response retry confirms the same result without overwriting a later change.
  if existing.category is not distinct from p_category then return to_jsonb(existing); end if;
  if existing.category is distinct from p_expected_category then
    raise exception 'La categoría ha cambiado; actualiza los equipos' using errcode='40001';
  end if;
  update public.teams set category=p_category where id=p_team returning * into existing;
  return to_jsonb(existing);
end;
$$;
revoke all on function public.admin_set_team_category(uuid,text,text) from public, anon, authenticated;
grant execute on function public.admin_set_team_category(uuid,text,text) to authenticated;
commit;
