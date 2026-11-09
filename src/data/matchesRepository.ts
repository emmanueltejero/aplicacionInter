import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Match } from '../matches';
import { parseMatches } from '../matches';

export interface MatchesRepository { load(teamId: string): Promise<Match[]>; save(teamId: string, match: Match): Promise<Match>; }
export class MatchesSetupRequired extends Error {
  constructor() { super('Falta activar las tablas de partidos en Supabase.'); this.name = 'MatchesSetupRequired'; }
}
export const demoMatchesRepository: MatchesRepository = {
  async load(teamId) {
    if (teamId !== 'demo-team') throw new Error('Equipo no disponible.');
    return parseMatches(await AsyncStorage.getItem('@inter-playa-honda/demo-matches/v1'));
  },
  async save(teamId, match) {
    const matches = await this.load(teamId);
    const next = matches.some(item => item.id === match.id) ? matches.map(item => item.id === match.id ? match : item) : [...matches, match];
    await AsyncStorage.setItem('@inter-playa-honda/demo-matches/v1', JSON.stringify(next));
    return match;
  },
};
function check(error: { code?: string } | null) {
  if (error && ['PGRST205', 'PGRST202', '42P01', '42883'].includes(error.code ?? '')) throw new MatchesSetupRequired();
  if (error?.code === '22023') throw new Error('Revisa la fecha, duración y minutos de los jugadores.');
  if (error) throw new Error('No se pudo guardar o consultar el partido. Revisa la conexión y tus permisos.');
}
type RemoteMatch = { id: string; match_date: string; opponent: string; duration: number; venue: 'home' | 'away'; played: boolean; match_players: { player_id: string; minutes: number | null }[] };
export function remoteMatchesRepository(client: SupabaseClient): MatchesRepository {
  return {
    async load(teamId) {
      const matches: Match[] = [];
      for (let offset = 0; ; offset += 500) {
        const result = await client.from('matches').select('id,match_date,opponent,duration,venue,played,match_players(player_id,minutes)')
          .eq('team_id', teamId).order('match_date', { ascending: false }).order('id').range(offset, offset + 499);
        check(result.error);
        const rows = (result.data ?? []) as RemoteMatch[];
        matches.push(...rows.map(row => ({ id: row.id, date: row.match_date, opponent: row.opponent, duration: row.duration, venue: row.venue, played: row.played, players: row.match_players.map(item => ({ playerId: item.player_id, minutes: item.minutes })) })));
        if (rows.length < 500) return matches;
      }
    },
    async save(teamId, match) {
      const result = await client.rpc('save_match', { p_team: teamId, p_match: match.id, p_date: match.date,
        p_opponent: match.opponent, p_duration: match.duration, p_venue: match.venue, p_played: match.played,
        p_players: match.players.map(entry => ({ player_id: entry.playerId, minutes: entry.minutes })) });
      check(result.error);
      if (result.data !== match.id) throw new Error('No se pudo confirmar el guardado del partido.');
      return match;
    },
  };
}
