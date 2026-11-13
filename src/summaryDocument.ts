import type { Player, Register } from './domain';
import { attendanceReport } from './attendanceReport.ts';
import type { ReportFilters } from './attendanceReport';
import { matchTotals } from './matches.ts';
import type { Match } from './matches';

export const summaryColumns = ['Dorsal', 'Jugador', 'Registros', 'Asistidos', 'Ausencias', 'Justificadas', 'Asistencia %', 'Partidos jugados', 'Minutos totales', 'Media min/partido', 'Minutos pendientes'];
export type SummaryDocument = {
  team: string; period: string; asOf: string; archiveFilter: string; overview: string;
  rows: string[][]; notes: string[];
};
const displayDate = (date: string) => date.split('-').reverse().join('/');
const decimal = (value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 1 });
export function summaryDocument(team: string, roster: Player[], register: Register, filters: ReportFilters, matches: Match[], asOf: string): SummaryDocument {
  const attendance = attendanceReport(roster, register, filters, asOf);
  const games = matchTotals(attendance.rows.map(row => row.player), matches, filters.from, filters.to, asOf);
  const byPlayer = new Map(games.rows.map(row => [row.player.id, row]));
  return {
    team, asOf: displayDate(asOf),
    period: filters.from && filters.to ? `Del ${displayDate(filters.from)} al ${displayDate(filters.to)}`
      : filters.from ? `Desde ${displayDate(filters.from)}` : filters.to ? `Hasta ${displayDate(filters.to)}` : 'Todo el historial',
    archiveFilter: filters.includeArchived ? 'Incluye jugadores archivados' : 'Solo jugadores activos',
    overview: `${attendance.rows.length} jugadores · ${attendance.dates} fechas de entrenamiento · ${attendance.totals.recorded} registros completados · ${games.matches} partidos disputados`,
    rows: attendance.rows.map(row => {
      const game = byPlayer.get(row.player.id)!;
      return [`#${row.player.number}`, `${row.player.name}${row.player.archivedAt ? ' (archivado)' : ''}`, String(row.recorded), String(row.present), String(row.absent), String(row.excused),
        row.percentage === null ? 'Sin datos' : `${decimal(row.percentage)}%`, String(game.played),
        game.called > 0 && game.called === game.pending ? '—' : game.minutes.toLocaleString('es-ES'), game.average === null ? '—' : decimal(game.average),
        game.pending ? `${game.pending} ${game.pending === 1 ? 'partido' : 'partidos'}` : '—'];
    }),
    notes: [
      'Asistencia = asistidos ÷ registros completados del jugador. Las ausencias justificadas cuentan como no asistidas. Los días sin marcar y las fechas futuras no se contabilizan.',
      'La media de minutos usa los minutos conocidos divididos entre los partidos en los que el jugador participó con minutos positivos. Las convocatorias con 0 minutos y los minutos pendientes no entran en la media.',
      'Minutos pendientes indica partidos con minutos todavía sin registrar; sus cifras son provisionales. «Sin datos» y «—» no equivalen a un cero registrado. Se cuentan únicamente los partidos marcados como disputados hasta la fecha de corte.',
    ],
  };
}
export function summaryPdfFilename(document: SummaryDocument): string {
  const team = document.team.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'equipo';
  return `inter-resumen-${team}-${document.asOf.split('/').reverse().join('-')}.pdf`;
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function summaryPrintHtml(document: SummaryDocument, crest: string): string {
  const escape = escapeHtml;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Resumen · ${escape(document.team)}</title><style>
    @page { size: A4 landscape; margin: 12mm; } * { box-sizing: border-box; } body { margin: 0; color: #17212d; font: 9pt/1.4 Arial, sans-serif; overflow-wrap: anywhere; }
    header { display: flex; gap: 12px; align-items: center; border-bottom: 2px solid #176ba0; padding-bottom: 10px; } header img { width: 52px; height: 52px; object-fit: contain; } .club { color: #176ba0; font-weight: bold; } h1 { font-size: 18pt; margin: 10px 0; } p { margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 12px 0; font-size: 8pt; } thead { display: table-header-group; } th { background: #176ba0; color: white; } th, td { padding: 6px 3px; border: 1px solid #dae2eb; text-align: center; } th:nth-child(2), td:nth-child(2) { text-align: left; width: 27%; } th:first-child, td:first-child { width: 5%; } tbody tr:nth-child(even) { background: #f1f6fa; } tr { break-inside: avoid; page-break-inside: avoid; }
    footer { border-top: 1px solid #dae2eb; margin-top: 16px; padding-top: 8px; color: #4f6880; font-size: 8pt; } footer p { orphans: 2; widows: 2; }
  </style></head><body><header><img alt="Escudo del Inter Playa Honda" src="${escape(crest)}"><div><div class="club">INTER PLAYA HONDA</div><div>${escape(document.team)}</div></div></header><h1>Resumen por jugador</h1>
    <p>${escape(document.period)} · ${escape(document.archiveFilter)}</p><p>Fecha de corte: ${escape(document.asOf)} · Se excluyen fechas futuras.</p><p>${escape(document.overview)}</p>
    <table><thead><tr>${summaryColumns.map(column => `<th scope="col">${escape(column)}</th>`).join('')}</tr></thead><tbody>${document.rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    ${document.rows.length ? '' : '<p>No hay jugadores para mostrar con este filtro.</p>'}<footer>${document.notes.map(note => `<p>${escape(note)}</p>`).join('')}<p>Inter Playa Honda · Resumen del equipo</p></footer></body></html>`;
}
