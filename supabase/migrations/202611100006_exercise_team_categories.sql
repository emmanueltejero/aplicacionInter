-- Recommended club categories, independent of exercise content categories.
-- Run after the exercise-library migration. Safe to repeat; keeps existing data.
begin;
create or replace function public.valid_exercise_team_categories(items text[]) returns boolean
language sql immutable set search_path = '' as $$
  select items is not null and cardinality(items) between 0 and 9
    and array_position(items,null) is null
    and items <@ array['Minis','Prebenjamín','Benjamín','Alevín','Infantil','Cadete','Juvenil','Femenino','Regional']::text[]
    and (select count(distinct item) from unnest(items) item) = cardinality(items);
$$;
revoke all on function public.valid_exercise_team_categories(text[]) from public, anon, authenticated;
alter table public.exercises add column if not exists team_categories text[] not null default '{}'::text[];
alter table public.exercises drop constraint if exists exercises_team_categories_valid;
alter table public.exercises add constraint exercises_team_categories_valid check (public.valid_exercise_team_categories(team_categories));

create or replace function public.save_exercise_with_team_categories(p_id uuid, p_revision integer, p_title text, p_description text,
  p_categories text[], p_duration integer, p_min_players integer, p_max_players integer,
  p_space_length integer, p_space_width integer, p_materials jsonb, p_archived boolean, p_team_categories text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare previous public.exercises; saved public.exercises; identical boolean; recommended text[];
begin
  if not public.is_active_club_member() then
    raise exception 'Acceso al club no autorizado' using errcode = '42501';
  end if;
  if p_id is null or p_revision is null or p_revision < 0 or p_archived is null then
    raise exception 'Identificador o revisión inválidos' using errcode = '22023';
  end if;
  if (select count(distinct category) from unnest(p_categories) category) is distinct from cardinality(p_categories) then
    raise exception 'Categorías inválidas o repetidas' using errcode = '22023';
  end if;
  select * into previous from public.exercises where id=p_id for update;
  if previous.id is not null and previous.created_by is distinct from auth.uid() and not public.is_club_admin() then
    raise exception 'Solo el autor o un administrador puede modificar el ejercicio' using errcode='42501';
  end if;
  -- NULL is reserved for the legacy save_exercise wrapper: keep its classification.
  recommended := coalesce(p_team_categories, previous.team_categories, '{}'::text[]);
  if not public.valid_exercise_team_categories(recommended) then
    raise exception 'Categorías de equipo inválidas o repetidas' using errcode='22023';
  end if;
  recommended := array(select item from unnest(recommended) item order by array_position(
    array['Minis','Prebenjamín','Benjamín','Alevín','Infantil','Cadete','Juvenil','Femenino','Regional']::text[],item));
  if previous.id is not null then
    identical := row(previous.title,previous.description,previous.categories,previous.duration,previous.min_players,previous.max_players,previous.space_length,previous.space_width,previous.materials,previous.archived_at is not null,previous.team_categories)
      is not distinct from row(trim(p_title),trim(p_description),p_categories,p_duration,p_min_players,p_max_players,p_space_length,p_space_width,p_materials,p_archived,recommended);
    if p_revision=previous.revision-1 and identical then return to_jsonb(previous); end if;
    if p_revision <> previous.revision then
      raise exception 'El ejercicio ha cambiado; vuelve a cargarlo antes de editarlo' using errcode='40001';
    end if;
    update public.exercises set title=trim(p_title),description=trim(p_description),categories=p_categories,
      duration=p_duration,min_players=p_min_players,max_players=p_max_players,
      space_length=p_space_length,space_width=p_space_width,materials=p_materials,team_categories=recommended,
      archived_at=case when p_archived then coalesce(previous.archived_at,now()) else null end,
      revision=revision+1,updated_at=now()
    where id=p_id returning * into saved;
  else
    if p_revision <> 0 or p_archived then
      raise exception 'El ejercicio ya no está disponible' using errcode='40001';
    end if;
    insert into public.exercises(id,created_by,title,description,categories,duration,min_players,max_players,space_length,space_width,materials,team_categories)
      values(p_id,auth.uid(),trim(p_title),trim(p_description),p_categories,p_duration,p_min_players,p_max_players,p_space_length,p_space_width,p_materials,recommended)
      returning * into saved;
  end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_exercise_with_team_categories(uuid,integer,text,text,text[],integer,integer,integer,integer,integer,jsonb,boolean,text[]) from public, anon, authenticated;
grant execute on function public.save_exercise_with_team_categories(uuid,integer,text,text,text[],integer,integer,integer,integer,integer,jsonb,boolean,text[]) to authenticated;

-- Existing app tabs keep working and cannot silently erase a newer classification.
create or replace function public.save_exercise(p_id uuid, p_revision integer, p_title text, p_description text,
  p_categories text[], p_duration integer, p_min_players integer, p_max_players integer,
  p_space_length integer, p_space_width integer, p_materials jsonb, p_archived boolean)
returns jsonb language sql security definer set search_path = '' as $$
  select public.save_exercise_with_team_categories(p_id,p_revision,p_title,p_description,p_categories,
    p_duration,p_min_players,p_max_players,p_space_length,p_space_width,p_materials,p_archived,null::text[]);
$$;
revoke all on function public.save_exercise(uuid,integer,text,text,text[],integer,integer,integer,integer,integer,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.save_exercise(uuid,integer,text,text,text[],integer,integer,integer,integer,integer,jsonb,boolean) to authenticated;
commit;
