import { dateKey } from './domain.ts';
import type { Match } from './matches';
import type { TrainingPlan } from './trainingPlans';

export type CalendarEvent = { kind: 'training'; plan: TrainingPlan } | { kind: 'match'; match: Match };

// Local noon keeps a date-only activity on its own day, including across DST.
export function calendarDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && dateKey(parsed) === value ? parsed : null;
}

export function calendarMonth(value: string): (string | null)[][] {
  const selected = calendarDate(value);
  if (!selected) throw new Error('Introduce una fecha válida con el formato AAAA-MM-DD.');
  const first = new Date(selected); first.setDate(1);
  const last = new Date(first); last.setMonth(first.getMonth() + 1, 0);
  const offset = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((offset + last.getDate()) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    if (day < 1 || day > last.getDate()) return null;
    const date = new Date(first); date.setDate(day); return dateKey(date);
  });
  return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}

export function moveCalendarMonth(value: string, offset: number): string | null {
  const date = calendarDate(value);
  if (!date || !Number.isInteger(offset)) return null;
  const day = date.getDate(); date.setDate(1); date.setMonth(date.getMonth() + offset);
  const last = new Date(date); last.setMonth(date.getMonth() + 1, 0);
  date.setDate(Math.min(day, last.getDate()));
  const result = dateKey(date);
  return calendarDate(result) ? result : null;
}

export function teamCalendarEvents(teamId: string, plans: TrainingPlan[], matches: Match[]): Record<string, CalendarEvent[]> {
  const days: Record<string, CalendarEvent[]> = {};
  for (const plan of plans) {
    if (plan.teamId !== teamId || plan.archivedAt || !calendarDate(plan.date)) continue;
    (days[plan.date] ??= []).push({ kind: 'training', plan });
  }
  for (const match of matches) {
    if (!calendarDate(match.date)) continue;
    (days[match.date] ??= []).push({ kind: 'match', match });
  }
  for (const events of Object.values(days)) events.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'training' ? -1 : 1;
    const label = (event: CalendarEvent) => event.kind === 'training' ? event.plan.title : event.match.opponent;
    return label(a).localeCompare(label(b), 'es');
  });
  return days;
}
