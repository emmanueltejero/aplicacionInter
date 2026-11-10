-- Daily team plans. Requires the club and exercise-library migrations.
-- Safe to run again; existing plans and exercise snapshots are preserved.
begin;
create table if not exists public.training_plans (
  id uuid primary key,
  team_id uuid not null references public.teams(id),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  training_date date not null,
  title text not null check (char_length(trim(title)) between 1 and 100),
  player_count integer not null check (player_count between 1 and 100),
  notes text not null default '' check (char_length(notes) <= 3000),
  entries jsonb not null check (jsonb_typeof(entries) = 'array' and jsonb_array_length(entries) between 1 and 50),
  revision integer not null default 1 check (revision >= 1),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists training_plans_team_date on public.training_plans(team_id, training_date desc, id);
alter table public.training_plans enable row level security;
revoke all on public.training_plans from anon, authenticated;
grant select on public.training_plans to authenticated;
drop policy if exists training_plans_read on public.training_plans;
create policy training_plans_read on public.training_plans for select to authenticated
  using (public.can_access_team(team_id));

create or replace function public.save_training_plan(p_team uuid, p_id uuid, p_revision integer,
  p_date date, p_title text, p_player_count integer, p_notes text, p_entries jsonb, p_archived boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare previous public.training_plans; saved public.training_plans; source public.exercises;
  requested jsonb; existing_entry jsonb; snapshot jsonb; snapshots jsonb := '[]'::jsonb;
  entry_id uuid; exercise_id uuid; source_revision integer; duration integer;
  total_minutes integer := 0; ids uuid[] := array[]::uuid[];
begin
  if p_team is null or not public.can_access_team(p_team) then
    raise exception 'Equipo no autorizado' using errcode = '42501';
  end if;
  if p_id is null or p_revision is null or p_revision < 0 or p_date is null
    or p_date not between date '0001-01-01' and date '9999-12-31' or p_archived is null
    or p_title is null or char_length(trim(p_title)) not between 1 and 100
    or p_player_count is null or p_player_count not between 1 and 100
    or p_notes is null or char_length(trim(p_notes)) > 3000 then
    raise exception 'Revisa los datos del entrenamiento' using errcode = '22023';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'Los ejercicios deben ser una lista' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) not between 1 and 50 then
    raise exception 'Añade entre 1 y 50 ejercicios' using errcode = '22023';
  end if;
  select * into previous from public.training_plans where id=p_id for update;
  if found then
    if previous.team_id <> p_team then raise exception 'Entrenamiento no autorizado' using errcode = '42501'; end if;
  elsif p_revision <> 0 or p_archived then
    raise exception 'El entrenamiento ya no está disponible' using errcode = '40001';
  end if;
  for requested in select * from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(requested) <> 'object'
      or jsonb_typeof(requested->'duration') is distinct from 'number'
      or (requested->>'duration') !~ '^[1-9][0-9]{0,2}$'
      or jsonb_typeof(requested->'exerciseRevision') is distinct from 'number'
      or (requested->>'exerciseRevision') !~ '^[1-9][0-9]*$' then
      raise exception 'Ejercicio inválido' using errcode = '22023';
    end if;
    entry_id := (requested->>'id')::uuid;
    exercise_id := (requested->>'exerciseId')::uuid;
    source_revision := (requested->>'exerciseRevision')::integer;
    duration := (requested->>'duration')::integer;
    if entry_id is null or exercise_id is null or entry_id=any(ids) or duration not between 1 and 240 then
      raise exception 'Revisa los ejercicios y sus duraciones' using errcode = '22023';
    end if;
    ids := array_append(ids,entry_id);
    select item into existing_entry from jsonb_array_elements(coalesce(previous.entries,'[]'::jsonb)) item
      where item->>'id'=entry_id::text;
    if found then
      if existing_entry->>'exerciseId' <> exercise_id::text or (existing_entry->>'exerciseRevision')::integer <> source_revision then
        raise exception 'No se puede cambiar el origen de un bloque guardado' using errcode = '22023';
      end if;
      snapshot := existing_entry || jsonb_build_object('duration',duration);
    else
      select * into source from public.exercises where id=exercise_id and archived_at is null;
      if not found then raise exception 'El ejercicio no está disponible en la biblioteca' using errcode = '22023'; end if;
      if source.revision <> source_revision then
        raise exception 'La ficha del ejercicio ha cambiado' using errcode = 'P0002';
      end if;
      snapshot := jsonb_build_object('id',entry_id,'exerciseId',source.id,'exerciseRevision',source.revision,
        'title',source.title,'description',source.description,'categories',source.categories,'duration',duration,
        'minPlayers',source.min_players,'maxPlayers',source.max_players,'spaceLength',source.space_length,
        'spaceWidth',source.space_width,'materials',source.materials);
    end if;
    snapshots := snapshots || jsonb_build_array(snapshot);
    total_minutes := total_minutes+duration;
  end loop;
  if total_minutes > 600 then raise exception 'El entrenamiento supera los 600 minutos' using errcode = '22023'; end if;
  if previous.id is not null then
    if p_revision=previous.revision-1 and row(previous.training_date,previous.title,previous.player_count,previous.notes,previous.entries,previous.archived_at is not null)
      is not distinct from row(p_date,trim(p_title),p_player_count,trim(p_notes),snapshots,p_archived) then return to_jsonb(previous); end if;
    if p_revision <> previous.revision then raise exception 'El entrenamiento ha cambiado; vuelve a cargarlo' using errcode = '40001'; end if;
    update public.training_plans set training_date=p_date,title=trim(p_title),player_count=p_player_count,
      notes=trim(p_notes),entries=snapshots,revision=revision+1,updated_at=now(),
      archived_at=case when p_archived then coalesce(previous.archived_at,now()) else null end
    where id=p_id returning * into saved;
  else
    insert into public.training_plans(id,team_id,created_by,training_date,title,player_count,notes,entries)
      values(p_id,p_team,auth.uid(),p_date,trim(p_title),p_player_count,trim(p_notes),snapshots) returning * into saved;
  end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_training_plan(uuid,uuid,integer,date,text,integer,text,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.save_training_plan(uuid,uuid,integer,date,text,integer,text,jsonb,boolean) to authenticated;
commit;
