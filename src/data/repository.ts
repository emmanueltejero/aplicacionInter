import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseRegister, parseRoster, validatePlayer } from '../domain';
import type { Attendance, Player, Register } from '../domain';
import { demoMatchesRepository, remoteMatchesRepository } from './matchesRepository';
import type { MatchesRepository } from './matchesRepository';
import { demoExercisesRepository, remoteExercisesRepository } from './exercisesRepository';
import type { ExercisesRepository } from './exercisesRepository';
import { demoTrainingRepository, remoteTrainingRepository } from './trainingRepository';
import type { TrainingRepository } from './trainingRepository';
import { demoUsersRepository, remoteUsersRepository } from './usersRepository';
import type { UsersRepository } from './usersRepository';
import { loadTeams } from './teamsRepository';
import type { Team } from '../teams';

export type { Team } from '../teams';
export type TeamData = { roster: Player[]; register: Register };
export interface ClubRepository {
  readonly demo: boolean;
  readonly matches: MatchesRepository;
  readonly exercises: ExercisesRepository;
  readonly training: TrainingRepository;
  readonly users: UsersRepository;
  teams(): Promise<Team[]>;
  load(teamId: string): Promise<TeamData>;
  savePlayer(teamId: string, data: { name: string; number: number }, id?: string): Promise<Player>;
  archivePlayer(teamId: string, id: string, archived: boolean): Promise<Player>;
  mark(teamId: string, date: string, playerId: string, status: Attendance): Promise<void>;
  clearAttendance(teamId: string, date: string, playerId: string): Promise<void>;
}
const DEMO_TEAM = 'demo-team';
const ROSTER_KEY = '@inter-playa-honda/demo-roster/v1';
const ATTENDANCE_KEY = '@inter-playa-honda/demo-attendance/v1';
function requireDemoTeam(teamId: string) {
  if (teamId !== DEMO_TEAM) throw new Error('Equipo no disponible.');
}

export const demoRepository: ClubRepository = {
  demo: true,
  matches: demoMatchesRepository,
  exercises: demoExercisesRepository,
  training: demoTrainingRepository,
  users: demoUsersRepository,
  async teams() { return [{ id: DEMO_TEAM, name: 'Equipo de prueba', category: 'Alevín' }]; },
  async load(teamId) {
    requireDemoTeam(teamId);
    const [roster, register] = await Promise.all([AsyncStorage.getItem(ROSTER_KEY), AsyncStorage.getItem(ATTENDANCE_KEY)]);
    return { roster: parseRoster(roster), register: parseRegister(register) };
  },
  async savePlayer(teamId, data, id) {
    const { roster } = await this.load(teamId);
    const clean = validatePlayer(data.name, data.number, roster, id);
    const previous = id ? roster.find(player => player.id === id) : undefined;
    if (id && !previous) throw new Error('El jugador ya no está disponible.');
    const player = { ...previous, ...clean, id: previous?.id ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    const next = previous ? roster.map(item => item.id === id ? player : item) : [...roster, player];
    await AsyncStorage.setItem(ROSTER_KEY, JSON.stringify(next));
    return player;
  },
  async archivePlayer(teamId, id, archived) {
    const { roster } = await this.load(teamId);
    const player = roster.find(item => item.id === id);
    if (!player) throw new Error('Jugador no disponible.');
    if (!archived) validatePlayer(player.name, player.number, roster, id);
    const next = { ...player, archivedAt: archived ? new Date().toISOString() : null };
    await AsyncStorage.setItem(ROSTER_KEY, JSON.stringify(roster.map(item => item.id === id ? next : item)));
    return next;
  },
  async mark(teamId, date, playerId, status) {
    const { roster, register } = await this.load(teamId);
    if (!roster.some(player => player.id === playerId && !player.archivedAt)) throw new Error('Jugador no activo.');
    await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify({ ...register, [date]: { ...register[date], [playerId]: status } }));
  },
  async clearAttendance(teamId, date, playerId) {
    const { roster, register } = await this.load(teamId);
    if (!roster.some(player => player.id === playerId && !player.archivedAt)) throw new Error('Jugador no activo.');
    const day = { ...register[date] };
    delete day[playerId];
    if (Object.keys(day).length) register[date] = day;
    else delete register[date];
    await AsyncStorage.setItem(ATTENDANCE_KEY, JSON.stringify(register));
  },
};

type RemotePlayer = { id: string; name: string; number: number; archived_at: string | null };
const playerColumns = 'id,name,number,archived_at';
const fromRemote = (player: RemotePlayer): Player => ({ id: player.id, name: player.name, number: player.number, archivedAt: player.archived_at });
function check(error: { code?: string } | null) {
  if (error?.code === '55000') throw new Error('El equipo está archivado. Un administrador debe restaurarlo para modificar sus datos.');
  if (error?.code === '23505') throw new Error('Ese dorsal ya está asignado a un jugador activo.');
  if (error) throw new Error('No se pudo guardar o consultar el equipo. Revisa la conexión y tus permisos.');
}
async function allRows<Row>(page: (start: number, end: number) => PromiseLike<{ data: Row[] | null; error: { code?: string } | null }>): Promise<Row[]> {
  const rows: Row[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const result = await page(offset, offset + size - 1);
    check(result.error);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < size) return rows;
  }
}
export function remoteRepository(client: SupabaseClient): ClubRepository {
  return {
    demo: false,
    matches: remoteMatchesRepository(client),
    exercises: remoteExercisesRepository(client),
    training: remoteTrainingRepository(client),
    users: remoteUsersRepository(client),
    async teams() {
      return (await loadTeams(client)).teams;
    },
    async load(teamId) {
      const [roster, attendance] = await Promise.all([
        allRows<RemotePlayer>((start, end) => client.from('players').select(playerColumns).eq('team_id', teamId).order('number').order('id').range(start, end)),
        allRows<{ player_id: string; training_date: string; status: Attendance }>((start, end) => client.from('attendance').select('player_id,training_date,status').eq('team_id', teamId).order('training_date').order('player_id').range(start, end)),
      ]);
      const register: Register = {};
      for (const row of attendance) {
        register[row.training_date] ??= {};
        register[row.training_date][row.player_id] = row.status;
      }
      return { roster: roster.map(fromRemote), register };
    },
    async savePlayer(teamId, data, id) {
      const query = id
        ? client.from('players').update(data).eq('id', id).eq('team_id', teamId)
        : client.from('players').insert({ ...data, team_id: teamId });
      const result = await query.select(playerColumns).single();
      check(result.error); if (!result.data) throw new Error('Jugador no disponible.');
      return fromRemote(result.data);
    },
    async archivePlayer(teamId, id, archived) {
      const { data, error } = await client.from('players').update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', id).eq('team_id', teamId).select(playerColumns).single();
      check(error); if (!data) throw new Error('Jugador no disponible.');
      return fromRemote(data);
    },
    async mark(teamId, date, playerId, status) {
      // Insert first, then update only the mutable status when the record exists.
      // This respects the database's column grants on historical identifiers.
      const inserted = await client.from('attendance').insert({ team_id: teamId, player_id: playerId, training_date: date, status });
      if (inserted.error?.code !== '23505') { check(inserted.error); return; }
      const result = await client.from('attendance').update({ status }).eq('team_id', teamId)
        .eq('player_id', playerId).eq('training_date', date).select('player_id').single();
      check(result.error); if (!result.data) throw new Error('No se pudo actualizar la asistencia.');
    },
    async clearAttendance(teamId, date, playerId) {
      const result = await client.from('attendance').delete().eq('team_id', teamId)
        .eq('player_id', playerId).eq('training_date', date).select('player_id');
      if (result.error?.code === '42501') throw new Error('El club debe activar la actualización de Supabase para quitar marcas de asistencia. La marca se ha conservado.');
      check(result.error);
      if (result.data?.length !== 1) throw new Error('No se pudo quitar la marca. Revisa tus permisos y vuelve a cargar la asistencia.');
    },
  };
}
