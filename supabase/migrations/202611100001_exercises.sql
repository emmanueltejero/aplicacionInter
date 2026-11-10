-- Shared club library. Run after 202611050001_club.sql. Safe to run again.
begin;
create or replace function public.is_active_club_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.club_members where user_id = (select auth.uid()) and enabled);
$$;
revoke all on function public.is_active_club_member() from public, anon, authenticated;
grant execute on function public.is_active_club_member() to authenticated;

create or replace function public.valid_exercise_materials(items jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(items) = 'array' then
    jsonb_array_length(items) <= 30 and not exists (
      select 1 from jsonb_array_elements(items) item
      where jsonb_typeof(item) is distinct from 'object'
        or jsonb_typeof(item->'name') is distinct from 'string'
        or char_length(trim(item->>'name')) not between 1 and 60
        or jsonb_typeof(item->'quantity') is distinct from 'number'
        or (item->>'quantity') !~ '^[1-9][0-9]{0,2}$|^1000$'
    ) and (select count(*) = count(distinct lower(trim(item->>'name'))) from jsonb_array_elements(items) item)
  else false end;
$$;
revoke all on function public.valid_exercise_materials(jsonb) from public, anon, authenticated;
-- Validation is used by the table constraint inside the trusted save function.

create table if not exists public.exercises (
  id uuid primary key,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  title text not null check (char_length(trim(title)) between 1 and 100),
  description text not null check (char_length(trim(description)) between 1 and 5000),
  categories text[] not null check (cardinality(categories) between 1 and 8
    and array_position(categories, null) is null
    and categories <@ array['Calentamiento','Técnica','Táctica','Posesión','Finalización','Defensa','Preparación física','Porteros']::text[]),
  duration integer not null check (duration between 1 and 240),
  min_players integer not null check (min_players between 1 and 100),
  max_players integer not null check (max_players between min_players and 100),
  space_length integer not null check (space_length between 1 and 150),
  space_width integer not null check (space_width between 1 and 150),
  materials jsonb not null check (public.valid_exercise_materials(materials)),
  revision integer not null default 1 check (revision >= 1),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.exercises enable row level security;
revoke all on public.exercises from anon, authenticated;
grant select on public.exercises to authenticated;
drop policy if exists exercises_read on public.exercises;
create policy exercises_read on public.exercises for select to authenticated
  using (public.is_active_club_member());

-- No direct writes: author, revision and timestamps are controlled here.
create or replace function public.save_exercise(p_id uuid, p_revision integer, p_title text, p_description text,
  p_categories text[], p_duration integer, p_min_players integer, p_max_players integer,
  p_space_length integer, p_space_width integer, p_materials jsonb, p_archived boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare previous public.exercises; saved public.exercises; identical boolean;
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
  select * into previous from public.exercises where id = p_id for update;
  if found then
    if previous.created_by is distinct from auth.uid() and not public.is_club_admin() then
      raise exception 'Solo el autor o un administrador puede modificar el ejercicio' using errcode = '42501';
    end if;
    identical := row(previous.title,previous.description,previous.categories,previous.duration,previous.min_players,previous.max_players,previous.space_length,previous.space_width,previous.materials,previous.archived_at is not null)
      is not distinct from row(trim(p_title),trim(p_description),p_categories,p_duration,p_min_players,p_max_players,p_space_length,p_space_width,p_materials,p_archived);
    -- Retrying a request whose response was lost must not duplicate or overwrite it.
    if p_revision = previous.revision - 1 and identical then return to_jsonb(previous); end if;
    if p_revision <> previous.revision then
      raise exception 'El ejercicio ha cambiado; vuelve a cargarlo antes de editarlo' using errcode = '40001';
    end if;
    update public.exercises set title=trim(p_title),description=trim(p_description),categories=p_categories,
      duration=p_duration,min_players=p_min_players,max_players=p_max_players,
      space_length=p_space_length,space_width=p_space_width,materials=p_materials,
      archived_at=case when p_archived then coalesce(previous.archived_at,now()) else null end,
      revision=revision+1,updated_at=now()
    where id=p_id returning * into saved;
  else
    if p_revision <> 0 or p_archived then
      raise exception 'El ejercicio ya no está disponible' using errcode = '40001';
    end if;
    insert into public.exercises(id,created_by,title,description,categories,duration,min_players,max_players,space_length,space_width,materials)
      values(p_id,auth.uid(),trim(p_title),trim(p_description),p_categories,p_duration,p_min_players,p_max_players,p_space_length,p_space_width,p_materials)
      returning * into saved;
  end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_exercise(uuid,integer,text,text,text[],integer,integer,integer,integer,integer,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.save_exercise(uuid,integer,text,text,text[],integer,integer,integer,integer,integer,jsonb,boolean) to authenticated;
commit;
