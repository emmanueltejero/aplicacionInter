import type { Attendance, Player, Register } from './domain';

export type ReportFilters = { from: string; to: string; includeArchived: boolean };
export type PlayerReport = {
  player: Player; present: number; absent: number; excused: number;
  recorded: number; percentage: number | null;
};
const statuses: Attendance[] = ['present', 'absent', 'excused'];

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function attendanceReport(roster: Player[], register: Register, filters: ReportFilters, asOf: string) {
  if ((filters.from && !isCalendarDate(filters.from)) || (filters.to && !isCalendarDate(filters.to))) {
    throw new Error('Introduce fechas válidas con el formato AAAA-MM-DD.');
  }
  if (filters.from && filters.to && filters.from > filters.to) throw new Error('La fecha inicial debe ser anterior o igual a la final.');
  if (!isCalendarDate(asOf)) throw new Error('La fecha actual no es válida.');
  const selected = roster.filter(player => filters.includeArchived || !player.archivedAt);
  const dates = Object.keys(register).filter(date => isCalendarDate(date) && date <= asOf
    && (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)
    && selected.some(player => Object.hasOwn(register[date], player.id) && statuses.includes(register[date][player.id]))).sort();
  const rows: PlayerReport[] = selected.map(player => {
    const counts = { present: 0, absent: 0, excused: 0 };
    for (const date of dates) {
      if (!Object.hasOwn(register[date], player.id)) continue;
      const status = register[date][player.id];
      if (statuses.includes(status)) counts[status]++;
    }
    const recorded = counts.present + counts.absent + counts.excused;
    return { player, ...counts, recorded, percentage: recorded ? counts.present / recorded * 100 : null };
  });
  const totals = rows.reduce((all, row) => ({
    present: all.present + row.present, absent: all.absent + row.absent,
    excused: all.excused + row.excused, recorded: all.recorded + row.recorded,
  }), { present: 0, absent: 0, excused: 0, recorded: 0 });
  return { rows, totals, dates: dates.length };
}
