-- Allow correcting a mistaken attendance mark without deleting any player.
-- Run in Supabase SQL Editor after 202611050001_club.sql. Safe to run again.
begin;
grant delete on public.attendance to authenticated;
drop policy if exists attendance_remove on public.attendance;
create policy attendance_remove on public.attendance for delete to authenticated
  using (public.can_access_team(team_id) and exists (
    select 1 from public.players p
    where p.team_id = attendance.team_id and p.id = attendance.player_id
      and p.archived_at is null
  ));
commit;
