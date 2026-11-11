-- Personal favorites, independent of shared exercise ownership and team assignments.
-- Run after 202611100001_exercises.sql. Safe to run again; preserves existing data.
begin;
create table if not exists public.exercise_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);
create index if not exists exercise_favorites_exercise_id_idx on public.exercise_favorites(exercise_id);
alter table public.exercise_favorites enable row level security;
revoke all on public.exercise_favorites from public, anon, authenticated;
grant select on public.exercise_favorites to authenticated;
drop policy if exists exercise_favorites_read on public.exercise_favorites;
create policy exercise_favorites_read on public.exercise_favorites for select to authenticated
  using (user_id = (select auth.uid()) and public.is_active_club_member());

-- Set an explicit state rather than toggling: a retry after a lost response is safe.
-- The owner comes from the session, never from client input. Even admins use their own list.
create or replace function public.set_exercise_favorite(p_exercise_id uuid, p_favorite boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_club_member() then
    raise exception 'Acceso al club no autorizado' using errcode = '42501';
  end if;
  if p_exercise_id is null or p_favorite is null then
    raise exception 'Favorito inválido' using errcode = '22023';
  end if;
  if p_favorite then
    if not exists(select 1 from public.exercises where id = p_exercise_id) then
      raise exception 'El ejercicio ya no está disponible' using errcode = '22023';
    end if;
    insert into public.exercise_favorites(user_id, exercise_id)
      values(auth.uid(), p_exercise_id) on conflict (user_id, exercise_id) do nothing;
  else
    delete from public.exercise_favorites where user_id = auth.uid() and exercise_id = p_exercise_id;
  end if;
  return p_favorite;
end;
$$;
revoke all on function public.set_exercise_favorite(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_exercise_favorite(uuid, boolean) to authenticated;
commit;
