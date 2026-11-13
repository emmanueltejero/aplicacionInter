-- Read-only OAuth access for the club's MCP. Run after the existing migrations.
-- No player/history rows are changed. Configure the OAuth client and Auth hook
-- separately, following supabase/MCP.md; until then the MCP fails closed.
begin;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'club_mcp_reader') then
    create role club_mcp_reader nologin noinherit;
  end if;
end $$;
grant club_mcp_reader to authenticator;
grant usage on schema public, auth to club_mcp_reader;
grant execute on function auth.uid(), auth.jwt() to club_mcp_reader;

create table if not exists public.club_mcp_oauth_clients (
  client_id uuid primary key,
  resource_uri text not null check (resource_uri ~ '^https://[^?#]+$'),
  enabled boolean not null default true
);
alter table public.club_mcp_oauth_clients enable row level security;
revoke all on public.club_mcp_oauth_clients from public, anon, authenticated, club_mcp_reader;

create or replace function public.club_mcp_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb := event->'claims'; client text := coalesce(event->'claims'->>'client_id', event->>'client_id'); resource text;
begin
  -- Ordinary web sign-ins, password recovery and their refreshes are unchanged.
  if client is null then return event; end if;
  select c.resource_uri into resource from public.club_mcp_oauth_clients c
    where c.client_id::text = client and c.enabled;
  if resource is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Cliente OAuth no autorizado para el club.'));
  end if;
  claims := jsonb_set(claims, '{aud}', to_jsonb(resource));
  claims := jsonb_set(claims, '{role}', '"club_mcp_reader"'::jsonb);
  claims := jsonb_set(claims, '{client_id}', to_jsonb(client));
  claims := jsonb_set(claims, '{club_mcp_read}', 'true'::jsonb);
  return jsonb_set(event, '{claims}', claims);
end $$;
revoke all on function public.club_mcp_access_token_hook(jsonb) from public, anon, authenticated, club_mcp_reader;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.club_mcp_access_token_hook(jsonb) to supabase_auth_admin;

create or replace function public.club_mcp_authorized()
returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.jwt()->>'role') = 'club_mcp_reader' and auth.jwt()->'club_mcp_read' = 'true'::jsonb
    and exists (select 1 from public.club_mcp_oauth_clients c where c.client_id::text = auth.jwt()->>'client_id'
      and c.resource_uri = auth.jwt()->>'aud' and c.enabled)
    and exists (select 1 from public.club_members m where m.user_id = auth.uid() and m.enabled);
$$;
revoke all on function public.club_mcp_authorized() from public, anon, authenticated;
grant execute on function public.club_mcp_authorized(), public.can_access_team(uuid) to club_mcp_reader;

create or replace function public.club_mcp_client_allowed(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.club_members m where m.user_id = auth.uid() and m.enabled)
    and exists (select 1 from public.club_mcp_oauth_clients c where c.client_id = p_client and c.enabled);
$$;
revoke all on function public.club_mcp_client_allowed(uuid) from public, anon, club_mcp_reader;
grant execute on function public.club_mcp_client_allowed(uuid) to authenticated;

grant select on public.teams, public.players, public.attendance, public.matches, public.match_players to club_mcp_reader;
drop policy if exists mcp_teams_read on public.teams;
create policy mcp_teams_read on public.teams for select to club_mcp_reader
  using ((select public.club_mcp_authorized()) and public.can_access_team(id));
drop policy if exists mcp_players_read on public.players;
create policy mcp_players_read on public.players for select to club_mcp_reader
  using ((select public.club_mcp_authorized()) and public.can_access_team(team_id));
drop policy if exists mcp_attendance_read on public.attendance;
create policy mcp_attendance_read on public.attendance for select to club_mcp_reader
  using ((select public.club_mcp_authorized()) and public.can_access_team(team_id));
drop policy if exists mcp_matches_read on public.matches;
create policy mcp_matches_read on public.matches for select to club_mcp_reader
  using ((select public.club_mcp_authorized()) and public.can_access_team(team_id));
drop policy if exists mcp_match_players_read on public.match_players;
create policy mcp_match_players_read on public.match_players for select to club_mcp_reader
  using ((select public.club_mcp_authorized()) and public.can_access_team(team_id));

-- One SQL statement/snapshot per tool: no PostgREST row-limit truncation and no
-- partially mixed attendance/match loads. Invoker security keeps RLS in force.
create or replace function public.club_mcp_read_team(
  p_team uuid, p_from date, p_to date, p_as_of date, p_include_archived boolean,
  p_attendance boolean default false, p_matches boolean default false
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare team jsonb; roster jsonb; attendance jsonb := '[]'; matches jsonb := '[]';
begin
  if not coalesce(public.club_mcp_authorized(), false) or not public.can_access_team(p_team) then
    raise exception 'Equipo no autorizado' using errcode = '42501';
  end if;
  if p_as_of is null or p_as_of > (now() at time zone 'Atlantic/Canary')::date
    or (p_from is not null and p_to is not null and p_from > p_to) or p_include_archived is null then
    raise exception 'Período no válido' using errcode = '22023';
  end if;
  select jsonb_build_object('id', t.id, 'name', t.name, 'category', t.category, 'archived_at', t.archived_at)
    into team from public.teams t where t.id = p_team;
  if team is null then raise exception 'Equipo no autorizado' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'number', p.number, 'archivedAt', p.archived_at) order by p.number, p.id), '[]')
    into roster from public.players p where p.team_id = p_team and (p_include_archived or p.archived_at is null);
  if p_attendance then
    select coalesce(jsonb_agg(jsonb_build_object('date', a.training_date, 'player_id', a.player_id, 'status', a.status) order by a.training_date, a.player_id), '[]')
      into attendance from public.attendance a join public.players p on p.id = a.player_id and p.team_id = a.team_id
      where a.team_id = p_team and (p_include_archived or p.archived_at is null)
        and a.training_date <= p_as_of and (p_from is null or a.training_date >= p_from) and (p_to is null or a.training_date <= p_to);
  end if;
  if p_matches then
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'date', m.match_date, 'opponent', m.opponent,
      'duration', m.duration, 'venue', m.venue, 'played', m.played, 'players', (
        select coalesce(jsonb_agg(jsonb_build_object('playerId', mp.player_id, 'minutes', mp.minutes) order by mp.player_id), '[]')
        from public.match_players mp join public.players p on p.id = mp.player_id and p.team_id = mp.team_id
        where mp.team_id = p_team and mp.match_id = m.id and (p_include_archived or p.archived_at is null)
      )) order by m.match_date desc, m.id), '[]') into matches
      from public.matches m where m.team_id = p_team and m.match_date <= p_as_of
        and (p_from is null or m.match_date >= p_from) and (p_to is null or m.match_date <= p_to);
  end if;
  return jsonb_build_object('team', team, 'roster', roster, 'attendance', attendance, 'matches', matches);
end $$;
revoke all on function public.club_mcp_read_team(uuid,date,date,date,boolean,boolean,boolean) from public, anon, authenticated;
grant execute on function public.club_mcp_read_team(uuid,date,date,date,boolean,boolean,boolean) to club_mcp_reader;
commit;
