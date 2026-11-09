-- Nueva ampliación: partidos y minutos. Ejecutar una vez, después de la migración inicial.
-- No modifica las tablas ni los registros de asistencia.
begin;
create table public.matches (
  id uuid primary key,
  team_id uuid not null references public.teams(id),
  match_date date not null,
  opponent text not null check (char_length(trim(opponent)) between 1 and 100),
  duration integer not null check (duration between 1 and 240),
  venue text not null check (venue in ('home', 'away')),
  played boolean not null default false,
  unique(team_id, id)
);
create table public.match_players (
  match_id uuid not null,
  team_id uuid not null,
  player_id uuid not null,
  minutes integer check (minutes between 0 and 240),
  primary key(match_id, player_id),
  foreign key(team_id, match_id) references public.matches(team_id, id) on delete cascade,
  foreign key(team_id, player_id) references public.players(team_id, id)
);
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
revoke all on public.matches, public.match_players from anon, authenticated;
grant select on public.matches, public.match_players to authenticated;
create policy matches_read on public.matches for select to authenticated using (public.can_access_team(team_id));
create policy match_players_read on public.match_players for select to authenticated using (public.can_access_team(team_id));

-- All client writes pass through this atomic, team-authorized operation.
-- A stable client UUID makes retries update the same match instead of duplicating it.
create function public.save_match(
  p_team uuid, p_match uuid, p_date date, p_opponent text, p_duration integer,
  p_venue text, p_played boolean, p_players jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare existing_team uuid;
begin
  if not public.can_access_team(p_team) then raise exception 'Equipo no autorizado' using errcode='42501'; end if;
  perform 1 from public.teams where id=p_team for update;
  if p_match is null or p_date is null or p_opponent is null or char_length(trim(p_opponent)) not between 1 and 100
    or p_duration is null or p_duration not between 1 and 240 or p_venue is null or p_venue not in ('home','away')
    or p_played is null or p_players is null or jsonb_typeof(p_players) <> 'array' then
    raise exception 'Datos del partido no válidos' using errcode='22023';
  end if;
  if p_played and p_date > (now() at time zone 'Atlantic/Canary')::date then
    raise exception 'Un partido futuro no puede marcarse como disputado' using errcode='22023';
  end if;
  if jsonb_array_length(p_players)>100 then raise exception 'Demasiados convocados' using errcode='22023'; end if;
  select team_id into existing_team from public.matches where id=p_match for update;
  if found and existing_team<>p_team then raise exception 'Partido no autorizado' using errcode='42501'; end if;
  if (select count(*)<>count(distinct player_id) from jsonb_to_recordset(p_players) as x(player_id uuid, minutes integer)) then
    raise exception 'Hay convocados duplicados o sin identificar' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_players) as x(player_id uuid,minutes integer)
    where x.minutes<0 or x.minutes>p_duration) then
    raise exception 'Los minutos superan la duración o son negativos' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_players) as x(player_id uuid, minutes integer)
    left join public.players pl on pl.id=x.player_id and pl.team_id=p_team
    where pl.id is null or (pl.archived_at is not null and not exists(
      select 1 from public.match_players old where old.match_id=p_match and old.player_id=x.player_id and old.team_id=p_team
    ))) then
    raise exception 'Jugador ajeno al equipo o archivado sin participación previa' using errcode='42501';
  end if;
  insert into public.matches(id,team_id,match_date,opponent,duration,venue,played)
    values(p_match,p_team,p_date,trim(p_opponent),p_duration,p_venue,p_played)
    on conflict(id) do update set match_date=excluded.match_date,opponent=excluded.opponent,
      duration=excluded.duration,venue=excluded.venue,played=excluded.played;
  delete from public.match_players where match_id=p_match and team_id=p_team;
  insert into public.match_players(match_id,team_id,player_id,minutes)
    select p_match,p_team,x.player_id,x.minutes from jsonb_to_recordset(p_players) as x(player_id uuid,minutes integer);
  return p_match;
end $$;
revoke all on function public.save_match(uuid,uuid,date,text,integer,text,boolean,jsonb) from public;
grant execute on function public.save_match(uuid,uuid,date,text,integer,text,boolean,jsonb) to authenticated;
commit;
