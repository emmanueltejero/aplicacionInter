-- One private, immutable JPEG per exercise version; video links use no file storage.
-- Run after 202611100006_exercise_team_categories.sql. Safe to repeat.
begin;
create or replace function public.valid_exercise_image_path(value text) returns boolean
language sql immutable set search_path='' as $$
 select value is null or value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$';
$$;
create or replace function public.valid_exercise_video_url(value text) returns boolean
language sql immutable set search_path='' as $$
 select value is null or (char_length(value)<=1000 and value ~ '^https://(youtube\.com|www\.youtube\.com|m\.youtube\.com|youtu\.be|vimeo\.com|www\.vimeo\.com|player\.vimeo\.com)/[^[:space:]<>]*$');
$$;
revoke all on function public.valid_exercise_image_path(text) from public,anon,authenticated;
revoke all on function public.valid_exercise_video_url(text) from public,anon,authenticated;
alter table public.exercises add column if not exists image_path text;
alter table public.exercises add column if not exists video_url text;
alter table public.exercises drop constraint if exists exercises_image_path_valid;
alter table public.exercises add constraint exercises_image_path_valid check(public.valid_exercise_image_path(image_path));
alter table public.exercises drop constraint if exists exercises_video_url_valid;
alter table public.exercises add constraint exercises_video_url_valid check(public.valid_exercise_video_url(video_url));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('exercise-images','exercise-images',false,204800,array['image/jpeg'])
 on conflict(id) do update set public=false,file_size_limit=204800,allowed_mime_types=array['image/jpeg'];
drop policy if exists club_exercise_images_read on storage.objects;
create policy club_exercise_images_read on storage.objects for select to authenticated
 using(bucket_id='exercise-images' and public.is_active_club_member());
drop policy if exists club_exercise_images_upload on storage.objects;
create policy club_exercise_images_upload on storage.objects for insert to authenticated
 with check(bucket_id='exercise-images' and public.is_active_club_member()
   and split_part(name,'/',1)=(select auth.uid())::text and public.valid_exercise_image_path(name));
-- The validator is used by the INSERT policy. No object overwrite or delete policy
-- is granted: old training plans keep their image even after a library edit.
grant execute on function public.valid_exercise_image_path(text) to authenticated;

create or replace function public.save_exercise_with_media(p_id uuid,p_revision integer,p_title text,p_description text,
 p_categories text[],p_duration integer,p_min_players integer,p_max_players integer,p_space_length integer,p_space_width integer,
 p_materials jsonb,p_archived boolean,p_team_categories text[],p_image_path text,p_video_url text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.exercises; saved public.exercises; result jsonb;
begin
 if not public.is_active_club_member() then raise exception 'Acceso al club no autorizado' using errcode='42501'; end if;
 select * into previous from public.exercises where id=p_id for update;
 if previous.id is not null and previous.created_by is distinct from auth.uid() and not public.is_club_admin() then
   raise exception 'Solo el autor o un administrador puede modificar el ejercicio' using errcode='42501';
 end if;
 if not public.valid_exercise_image_path(p_image_path) or not public.valid_exercise_video_url(p_video_url) then
   raise exception 'Imagen o enlace de vídeo inválidos' using errcode='22023';
 end if;
 if previous.id is not null and p_revision=previous.revision-1 and
   row(previous.image_path,previous.video_url) is distinct from row(p_image_path,p_video_url) then
   raise exception 'El ejercicio ha cambiado; vuelve a cargarlo' using errcode='40001';
 end if;
 if p_image_path is not null and p_image_path is distinct from previous.image_path then
   if split_part(p_image_path,'/',1) <> auth.uid()::text and not public.is_club_admin() then
     raise exception 'La imagen debe pertenecer al autor del envío' using errcode='42501';
   end if;
   perform 1 from storage.objects where bucket_id='exercise-images' and name=p_image_path
     and metadata->>'mimetype'='image/jpeg'
     and case when metadata->>'size' ~ '^[0-9]{1,6}$' then (metadata->>'size')::integer between 1 and 204800 else false end;
   if not found then raise exception 'La imagen no está subida o supera el límite' using errcode='22023'; end if;
 end if;
 -- Reuse author, categories, revision and retry checks in the same transaction.
 result := public.save_exercise_with_team_categories(p_id,p_revision,p_title,p_description,p_categories,p_duration,
   p_min_players,p_max_players,p_space_length,p_space_width,p_materials,p_archived,p_team_categories);
 update public.exercises set image_path=p_image_path,video_url=p_video_url where id=p_id returning * into saved;
 return to_jsonb(saved);
end;
$$;
revoke all on function public.save_exercise_with_media(uuid,integer,text,text,text[],integer,integer,integer,integer,integer,jsonb,boolean,text[],text,text) from public,anon,authenticated;
grant execute on function public.save_exercise_with_media(uuid,integer,text,text,text[],integer,integer,integer,integer,integer,jsonb,boolean,text[],text,text) to authenticated;

-- save_training_plan is replaced below to snapshot only trusted library media.

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
        'spaceWidth',source.space_width,'materials',source.materials,'imagePath',source.image_path,'videoUrl',source.video_url);
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
