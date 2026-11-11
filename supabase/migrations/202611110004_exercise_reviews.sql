-- Current methodological endorsement. Requires exercise categories and media SQL.
-- Repeatable; no existing exercises are automatically marked as reviewed.
begin;
alter table public.club_members add column if not exists can_review_exercises boolean not null default false;
create or replace function public.can_review_exercises() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.club_members where user_id=(select auth.uid()) and enabled
    and (role='admin' or can_review_exercises));
$$;
revoke all on function public.can_review_exercises() from public, anon, authenticated;
grant execute on function public.can_review_exercises() to authenticated;

create or replace function public.admin_set_exercise_reviewer(p_user uuid, p_allowed boolean, p_expected_allowed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member public.club_members;
begin
  if not public.is_club_admin() then raise exception 'Solo administradores activos' using errcode='42501'; end if;
  if p_user is null or p_allowed is null or p_expected_allowed is null then raise exception 'Permiso inválido' using errcode='22023'; end if;
  select * into member from public.club_members where user_id=p_user for update;
  if not found or member.role <> 'coach' then raise exception 'El entrenador ya no está disponible' using errcode='22023'; end if;
  if member.can_review_exercises is distinct from p_allowed then
    if member.can_review_exercises is distinct from p_expected_allowed then
      raise exception 'El permiso ha cambiado; actualiza los usuarios' using errcode='40001';
    end if;
    update public.club_members set can_review_exercises=p_allowed where user_id=p_user returning * into member;
  end if;
  return jsonb_build_object('user_id',member.user_id,'can_review_exercises',member.can_review_exercises);
end;
$$;
revoke all on function public.admin_set_exercise_reviewer(uuid,boolean,boolean) from public, anon, authenticated;
grant execute on function public.admin_set_exercise_reviewer(uuid,boolean,boolean) to authenticated;

create table if not exists public.exercise_reviews (
  exercise_id uuid primary key references public.exercises(id) on delete cascade,
  exercise_revision integer not null check (exercise_revision >= 1),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default clock_timestamp()
);
alter table public.exercise_reviews enable row level security;
revoke all on public.exercise_reviews from public, anon, authenticated;
grant select on public.exercise_reviews to authenticated;
drop policy if exists exercise_reviews_read on public.exercise_reviews;
create policy exercise_reviews_read on public.exercise_reviews for select to authenticated
  using (public.is_active_club_member());

-- All editing APIs, including older app versions, invalidate a changed endorsement.
-- Archiving, restoring and saving identical content preserve the review date/author.
create or replace function public.invalidate_exercise_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if row(old.title,old.description,old.categories,old.duration,old.min_players,old.max_players,
    old.space_length,old.space_width,old.materials,old.team_categories,old.image_path,old.video_url)
    is distinct from row(new.title,new.description,new.categories,new.duration,new.min_players,new.max_players,
    new.space_length,new.space_width,new.materials,new.team_categories,new.image_path,new.video_url) then
    delete from public.exercise_reviews where exercise_id = new.id;
  else
    update public.exercise_reviews set exercise_revision = new.revision where exercise_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.invalidate_exercise_review() from public, anon, authenticated;
drop trigger if exists exercise_review_content_changed on public.exercises;
create trigger exercise_review_content_changed after update on public.exercises
  for each row execute function public.invalidate_exercise_review();

create or replace function public.set_exercise_review(p_exercise uuid, p_revision integer, p_reviewed boolean, p_expected_reviewed_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare source public.exercises; existing public.exercise_reviews;
begin
  if not public.can_review_exercises() then raise exception 'Solo administradores y revisores autorizados activos' using errcode='42501'; end if;
  if p_exercise is null or p_revision is null or p_revision < 1 or p_reviewed is null then
    raise exception 'Revisión inválida' using errcode='22023';
  end if;
  select * into source from public.exercises where id=p_exercise for update;
  if not found or source.revision <> p_revision then
    raise exception 'El ejercicio ha cambiado; actualiza la biblioteca antes de revisarlo' using errcode='40001';
  end if;
  select * into existing from public.exercise_reviews where exercise_id=p_exercise for update;
  if p_reviewed then
    -- Repeating approval preserves the original reviewer and date.
    if found and existing.exercise_revision = p_revision then return to_jsonb(existing); end if;
    if existing.reviewed_at is distinct from p_expected_reviewed_at then
      raise exception 'La revisión ha cambiado; actualiza la biblioteca' using errcode='40001';
    end if;
    insert into public.exercise_reviews(exercise_id,exercise_revision,reviewed_by)
      values(p_exercise,p_revision,auth.uid())
      on conflict(exercise_id) do update set exercise_revision=excluded.exercise_revision,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at
      returning * into existing;
    return to_jsonb(existing);
  else
    if not found then return null; end if;
    if existing.reviewed_at is distinct from p_expected_reviewed_at then
      raise exception 'La revisión ha cambiado; actualiza la biblioteca' using errcode='40001';
    end if;
    delete from public.exercise_reviews where exercise_id=p_exercise;
    return null;
  end if;
end;
$$;
revoke all on function public.set_exercise_review(uuid,integer,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.set_exercise_review(uuid,integer,boolean,timestamptz) to authenticated;
commit;
