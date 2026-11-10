-- Admin-only, atomic changes to existing coaches' teams and enabled status.
-- Safe to run again. No Auth account or club history is deleted.
begin;
create or replace function public.admin_update_coach_access(p_user uuid,p_enabled boolean,p_team_ids uuid[],
  p_expected_enabled boolean,p_expected_team_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target public.club_members;
  desired uuid[]; expected uuid[]; current_teams uuid[];
begin
  perform 1 from public.club_members where user_id=actor and role='admin' and enabled for share;
  if not found then raise exception 'Solo administradores activos' using errcode='42501'; end if;
  if p_user is null or p_enabled is null or p_expected_enabled is null or p_team_ids is null or p_expected_team_ids is null
    or cardinality(p_team_ids) > 20 or cardinality(p_expected_team_ids) > 1000
    or array_position(p_team_ids,null) is not null or array_position(p_expected_team_ids,null) is not null then
    raise exception 'Datos de acceso inválidos' using errcode='22023';
  end if;
  if (select count(distinct value) from unnest(p_team_ids) value) <> cardinality(p_team_ids)
    or (select count(distinct value) from unnest(p_expected_team_ids) value) <> cardinality(p_expected_team_ids) then
    raise exception 'Equipos repetidos' using errcode='22023';
  end if;
  desired := array(select value from unnest(p_team_ids) value order by value);
  expected := array(select value from unnest(p_expected_team_ids) value order by value);
  select * into target from public.club_members where user_id=p_user for update;
  if target.user_id is null then raise exception 'Entrenador no disponible' using errcode='22023'; end if;
  -- Admin accounts, including the current operator, cannot be changed here.
  if target.role <> 'coach' or target.user_id=actor then
    raise exception 'Solo se puede gestionar el acceso de entrenadores' using errcode='42501';
  end if;
  current_teams := array(select team_id from public.team_coaches where user_id=p_user order by team_id);
  if target.enabled=p_enabled and current_teams=desired then
    return jsonb_build_object('user_id',p_user,'enabled',target.enabled,'team_ids',current_teams);
  end if;
  if target.enabled <> p_expected_enabled or current_teams <> expected then
    raise exception 'El acceso ha cambiado; actualiza los usuarios' using errcode='40001';
  end if;
  if (select count(*) from public.teams where id=any(desired)) <> cardinality(desired) then
    raise exception 'Algún equipo ya no está disponible' using errcode='22023';
  end if;
  update public.club_members set enabled=p_enabled where user_id=p_user;
  delete from public.team_coaches where user_id=p_user and not (team_id=any(desired));
  insert into public.team_coaches(team_id,user_id) select value,p_user from unnest(desired) value
    on conflict(team_id,user_id) do nothing;
  return jsonb_build_object('user_id',p_user,'enabled',p_enabled,'team_ids',desired);
end;
$$;
revoke all on function public.admin_update_coach_access(uuid,boolean,uuid[],boolean,uuid[]) from public, anon, authenticated;
grant execute on function public.admin_update_coach_access(uuid,boolean,uuid[],boolean,uuid[]) to authenticated;
commit;
