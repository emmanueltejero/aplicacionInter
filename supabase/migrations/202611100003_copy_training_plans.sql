-- Duplicate a saved plan, including its historical exercise snapshots.
-- Run after 202611100002_training_plans.sql. Safe to run again.
begin;
alter table public.training_plans add column if not exists copied_from uuid;
alter table public.training_plans add column if not exists copied_from_revision integer;
create or replace function public.copy_training_plan(p_team uuid, p_source uuid, p_source_revision integer,
  p_id uuid, p_date date, p_title text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare original public.training_plans; copied public.training_plans; snapshots jsonb;
begin
  if p_team is null or not public.can_access_team(p_team) then
    raise exception 'Equipo no autorizado' using errcode = '42501';
  end if;
  if p_id is null or p_source is null or p_id=p_source or p_source_revision is null or p_source_revision < 1
    or p_date is null or p_date not between date '0001-01-01' and date '9999-12-31'
    or p_title is null or char_length(trim(p_title)) not between 1 and 100 then
    raise exception 'Revisa los datos de la copia' using errcode = '22023';
  end if;
  -- Return an already-created copy when retrying a request whose response was lost.
  select * into copied from public.training_plans where id=p_id for update;
  if copied.id is null then
    select * into original from public.training_plans where id=p_source for share;
    if original.id is null or original.team_id <> p_team then
      raise exception 'Entrenamiento original no autorizado' using errcode = '42501';
    end if;
    if original.revision <> p_source_revision then
      raise exception 'El entrenamiento ha cambiado; vuelve a cargarlo' using errcode = '40001';
    end if;
    select jsonb_agg(item || jsonb_build_object('id',gen_random_uuid()) order by position) into snapshots
      from jsonb_array_elements(original.entries) with ordinality as blocks(item,position);
    insert into public.training_plans(id,team_id,created_by,training_date,title,player_count,notes,entries,copied_from,copied_from_revision)
      values(p_id,p_team,auth.uid(),p_date,trim(p_title),original.player_count,original.notes,snapshots,p_source,p_source_revision)
      on conflict(id) do nothing returning * into copied;
    if copied.id is null then select * into copied from public.training_plans where id=p_id for update; end if;
  end if;
  if copied.team_id <> p_team or copied.created_by is distinct from auth.uid()
    or copied.copied_from is distinct from p_source or copied.copied_from_revision is distinct from p_source_revision
    or copied.training_date <> p_date or copied.title <> trim(p_title) or copied.revision <> 1 then
    raise exception 'La copia ha cambiado; vuelve a cargarla' using errcode = '40001';
  end if;
  return to_jsonb(copied);
end;
$$;
revoke all on function public.copy_training_plan(uuid,uuid,integer,uuid,date,text) from public, anon, authenticated;
grant execute on function public.copy_training_plan(uuid,uuid,integer,uuid,date,text) to authenticated;
commit;
