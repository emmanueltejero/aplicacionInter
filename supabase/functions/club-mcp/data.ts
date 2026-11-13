import { attendanceReport, isCalendarDate } from '../../../src/attendanceReport.ts';
import type { ReportFilters } from '../../../src/attendanceReport.ts';
import type { Player, Register } from '../../../src/domain.ts';
import { matchTotals } from '../../../src/matches.ts';
import type { Match } from '../../../src/matches.ts';

export type Team = { id: string; name: string; category: string | null; archived_at: string | null };
export type Period = ReportFilters & { as_of: string };
export type Snapshot = { team: Team; roster: Player[]; attendance: { date: string; player_id: string; status: 'present' | 'absent' | 'excused' }[]; matches: Match[] };
export class ReadFailure extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function clubToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function period(input: Record<string, unknown>, today: string): Period {
  const from = typeof input.from === 'string' ? input.from : '', to = typeof input.to === 'string' ? input.to : '';
  const as_of = typeof input.as_of === 'string' ? input.as_of : today;
  if ([from, to].some(value => value && !isCalendarDate(value)) || !isCalendarDate(as_of) || as_of > today || (from && to && from > to)) throw new ReadFailure('INVALID_PERIOD');
  return { from, to, as_of, includeArchived: input.include_archived !== false };
}
export function registerOf(snapshot: Snapshot): Register {
  const register: Register = {};
  for (const row of snapshot.attendance) { register[row.date] ??= {}; register[row.date][row.player_id] = row.status; }
  return register;
}
export function context(team: Team | null, range: Period, now: Date) {
  return { team, period: { from: range.from || null, to: range.to || null, inclusive: true }, as_of: range.as_of,
    time_zone: 'Atlantic/Canary', generated_at: now.toISOString(), include_archived_players: range.includeArchived };
}
export function pageOf<T>(items: T[], input: Record<string, unknown>) {
  const page = typeof input.page === 'number' ? input.page : 1, pageSize = typeof input.page_size === 'number' ? input.page_size : 20;
  return { items: items.slice((page - 1) * pageSize, page * pageSize), pagination: { page, page_size: pageSize, total_items: items.length, total_pages: Math.ceil(items.length / pageSize), has_more: page * pageSize < items.length } };
}
export function playerSummary(snapshot: Snapshot, range: Period, now: Date) {
  const report = attendanceReport(snapshot.roster, registerOf(snapshot), range, range.as_of);
  const games = matchTotals(report.rows.map(row => row.player), snapshot.matches, range.from, range.to, range.as_of);
  const byPlayer = new Map(games.rows.map(row => [row.player.id, row]));
  return { ...context(snapshot.team, range, now), training_dates_with_marks: report.dates, matches_played: games.matches,
    pending: { unmarked_on_recorded_training_dates: report.rows.reduce((sum, row) => sum + report.dates - row.recorded, 0), match_minute_entries: games.rows.reduce((sum, row) => sum + row.pending, 0) },
    players: report.rows.map(row => {
      const game = byPlayer.get(row.player.id)!;
      return { player: row.player, attendance: { present: row.present, absent: row.absent, excused: row.excused, completed: row.recorded, percentage: row.percentage, unmarked_on_recorded_dates: report.dates - row.recorded },
        matches: { called: game.called, played: game.played, minutes: game.called > 0 && game.called === game.pending ? null : game.minutes, average_minutes: game.average, pending_minutes: game.pending, provisional: game.pending > 0 } };
    }),
    rules: [
      'Asistencia = presentes / registros completados × 100. Justificadas cuentan como no asistidas. Sin marcar y fechas futuras quedan fuera; sin registros, porcentaje null.',
      'Partidos: solo disputados hasta la fecha de corte. Jugados por jugador: minutos > 0. Media = minutos conocidos / partidos con minutos > 0. Cero y pendiente son distintos; media sin participaciones es null.',
      'Los pendientes de asistencia se refieren a días con alguna marca del listado filtrado; no representan todas las sesiones planificadas ni ausencias inferidas.',
    ] };
}

export function createReader(base: string, publicKey: string, token: string, fetcher: typeof fetch = fetch) {
  async function call(path: string, args?: unknown) {
    const response = await fetcher(`${base}/rest/v1/${path}`, { method: args === undefined ? 'GET' : 'POST',
      headers: { apikey: publicKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      ...(args === undefined ? {} : { body: JSON.stringify(args) }), signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new ReadFailure(response.status === 401 ? 'SESSION_INVALID' : response.status === 403 ? 'ACCESS_DENIED' : 'DATA_UNAVAILABLE');
    const text = await response.text();
    if (text.length > 5000000) throw new ReadFailure('NARROW_PERIOD');
    try { return JSON.parse(text); } catch { throw new ReadFailure('DATA_UNAVAILABLE'); }
  }
  return {
    async authorized(): Promise<boolean> { return await call('rpc/club_mcp_authorized') === true; },
    async teams(includeArchived: boolean): Promise<Team[]> {
      const teams: Team[] = [];
      for (let offset = 0; offset < 10000; offset += 500) {
        const rows = await call(`teams?select=id,name,category,archived_at${includeArchived ? '' : '&archived_at=is.null'}&order=name.asc,id.asc&limit=500&offset=${offset}`);
        if (!Array.isArray(rows)) throw new ReadFailure('DATA_UNAVAILABLE');
        teams.push(...rows);
        if (rows.length < 500) return teams;
      }
      throw new ReadFailure('NARROW_PERIOD');
    },
    async snapshot(team: string, range: Period, attendance: boolean, matches: boolean): Promise<Snapshot> {
      const value = await call('rpc/club_mcp_read_team', { p_team: team, p_from: range.from || null, p_to: range.to || null, p_as_of: range.as_of,
        p_include_archived: range.includeArchived, p_attendance: attendance, p_matches: matches });
      if (!value?.team || value.team.id !== team || !Array.isArray(value.roster) || !Array.isArray(value.attendance) || !Array.isArray(value.matches)) throw new ReadFailure('DATA_UNAVAILABLE');
      return value;
    },
  };
}
