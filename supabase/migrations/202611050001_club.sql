-- Run once in a new Supabase project, using its SQL editor as postgres.
begin;
create table public.club_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'coach')),
  enabled boolean not null default true
);
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80)
);
create table public.team_coaches (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.club_members(user_id) on delete cascade,
  primary key (team_id, user_id)
);
create table public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id),
  name text not null check (char_length(trim(name)) between 1 and 80),
  number integer not null check (number between 0 and 99),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique(team_id, id)
);
create unique index players_active_number on public.players(team_id, number) where archived_at is null;
create table public.attendance (
  team_id uuid not null,
  player_id uuid not null,
  training_date date not null,
  status text not null check (status in ('present', 'absent', 'excused')),
  primary key(team_id, player_id, training_date),
  foreign key(team_id, player_id) references public.players(team_id, id)
);

-- Security-definer helpers avoid recursive membership policies. Membership and
-- assignments are managed only by the trusted Supabase dashboard, not the client.
create function public.is_club_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.club_members where user_id = (select auth.uid()) and enabled and role = 'admin');
$$;
create function public.can_access_team(target_team uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.club_members m where m.user_id = (select auth.uid()) and m.enabled
    and (m.role = 'admin' or exists(select 1 from public.team_coaches t where t.user_id = m.user_id and t.team_id = target_team)));
$$;
revoke all on function public.is_club_admin() from public;
revoke all on function public.can_access_team(uuid) from public;
grant execute on function public.is_club_admin(), public.can_access_team(uuid) to authenticated;

alter table public.club_members enable row level security;
alter table public.teams enable row level security;
alter table public.team_coaches enable row level security;
alter table public.players enable row level security;
alter table public.attendance enable row level security;

revoke all on public.club_members, public.teams, public.team_coaches, public.players, public.attendance from anon, authenticated;
grant select on public.club_members, public.teams, public.team_coaches, public.players, public.attendance to authenticated;
grant insert on public.players, public.attendance to authenticated;
grant update(name, number, archived_at) on public.players to authenticated;
grant update(status) on public.attendance to authenticated;

create policy membership_read on public.club_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_club_admin());
create policy assignments_read on public.team_coaches for select to authenticated
  using (user_id = (select auth.uid()) or public.is_club_admin());
create policy teams_read on public.teams for select to authenticated using (public.can_access_team(id));
create policy players_read on public.players for select to authenticated using (public.can_access_team(team_id));
create policy players_add on public.players for insert to authenticated
  with check (public.can_access_team(team_id) and archived_at is null);
create policy players_edit on public.players for update to authenticated
  using (public.can_access_team(team_id)) with check (public.can_access_team(team_id));
create policy attendance_read on public.attendance for select to authenticated using (public.can_access_team(team_id));
create policy attendance_add on public.attendance for insert to authenticated
  with check (public.can_access_team(team_id) and exists (
    select 1 from public.players p where p.team_id = attendance.team_id and p.id = attendance.player_id and p.archived_at is null
  ));
create policy attendance_edit on public.attendance for update to authenticated
  using (public.can_access_team(team_id)) with check (public.can_access_team(team_id) and exists (
    select 1 from public.players p where p.team_id = attendance.team_id and p.id = attendance.player_id and p.archived_at is null
  ));
-- No DELETE permission: archive players and retain all attendance history.
commit;
