import type { Player } from './domain.ts';
export { newRecordId as newMatchId } from './recordId.js';

export type MatchEntry = { playerId: string; minutes: number | null };
export type Match = { id: string; date: string; opponent: string; duration: number; venue: 'home' | 'away'; played: boolean; players: MatchEntry[] };
export type MatchDraft = Omit<Match, 'duration' | 'players'> & { duration: string; players: Record<string, string> };
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function validateMatch(draft: MatchDraft, roster: Player[], previous: Match | undefined, today: string): Match {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draft.id)) throw new Error('El identificador del partido no es válido.');
  if (!validDate(draft.date)) throw new Error('Introduce una fecha válida con el formato AAAA-MM-DD.');
  const opponent = draft.opponent.trim().replace(/\s+/g, ' ');
  if (!opponent || opponent.length > 100) throw new Error('Escribe un rival de entre 1 y 100 caracteres.');
  if (!/^\d{1,3}$/.test(draft.duration) || Number(draft.duration) < 1 || Number(draft.duration) > 240) throw new Error('La duración debe ser un número entero entre 1 y 240 minutos.');
  if (!['home', 'away'].includes(draft.venue)) throw new Error('Elige local o visitante.');
  if (draft.played && draft.date > today) throw new Error('Un partido futuro no puede marcarse como disputado.');
  const duration = Number(draft.duration);
  const entries = Object.entries(draft.players).map(([playerId, value]) => {
    const player = roster.find(item => item.id === playerId);
    if (!player || (player.archivedAt && !previous?.players.some(entry => entry.playerId === playerId))) throw new Error('Solo puedes convocar jugadores activos de este equipo.');
    if (value !== '' && (!/^\d{1,3}$/.test(value) || Number(value) > duration)) throw new Error(`Los minutos de ${player.name} deben estar entre 0 y ${duration}. Deja el campo vacío si están pendientes.`);
    return { playerId, minutes: value === '' ? null : Number(value) };
  });
  return { id: draft.id, date: draft.date, opponent, duration, venue: draft.venue, played: draft.played, players: entries };
}
export function parseMatches(value: string | null): Match[] {
  if (value === null) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('No se pudieron leer los partidos guardados.');
  const ids = new Set<string>();
  for (const match of parsed) {
    if (!match || typeof match.id !== 'string' || ids.has(match.id) || !validDate(match.date)
      || typeof match.opponent !== 'string' || !match.opponent.trim() || match.opponent.length > 100
      || !Number.isInteger(match.duration) || match.duration < 1 || match.duration > 240
      || typeof match.played !== 'boolean' || !['home', 'away'].includes(match.venue) || !Array.isArray(match.players)) throw new Error('No se pudieron leer los partidos guardados.');
    ids.add(match.id);
    const players = new Set<string>();
    for (const entry of match.players) {
      if (!entry || typeof entry.playerId !== 'string' || !entry.playerId || players.has(entry.playerId)
        || (entry.minutes !== null && (!Number.isInteger(entry.minutes) || entry.minutes < 0 || entry.minutes > match.duration))) throw new Error('No se pudieron leer los minutos guardados.');
      players.add(entry.playerId);
    }
  }
  return parsed as Match[];
}
export function matchTotals(roster: Player[], matches: Match[], from: string, to: string, today: string) {
  if ((from && !validDate(from)) || (to && !validDate(to))) throw new Error('Introduce fechas válidas con el formato AAAA-MM-DD.');
  if (from && to && from > to) throw new Error('La fecha inicial debe ser anterior o igual a la final.');
  const selected = matches.filter(match => match.played && match.date <= today && (!from || match.date >= from) && (!to || match.date <= to));
  return { matches: selected.length, rows: roster.map(player => {
    const counts = { called: 0, played: 0, minutes: 0, pending: 0 };
    for (const match of selected) {
      const entry = match.players.find(item => item.playerId === player.id);
      if (!entry) continue;
      counts.called++;
      if (entry.minutes === null) counts.pending++;
      else { counts.minutes += entry.minutes; if (entry.minutes > 0) counts.played++; }
    }
    return { player, ...counts, average: counts.played ? counts.minutes / counts.played : null };
  }) };
}
