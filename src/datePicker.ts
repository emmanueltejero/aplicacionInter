import { dateKey } from './domain.ts';
import { calendarDate } from './teamCalendar.ts';

export const datePickerMonths = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export function datePickerLabel(value: string): string {
  return calendarDate(value) ? value.split('-').reverse().join('/') : 'Seleccionar fecha';
}
export function changePickerMonth(value: string, year: number, month: number): string {
  const date = calendarDate(value);
  if (!date || !Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Fecha fuera del calendario.');
  const day = date.getDate(); date.setDate(1); date.setFullYear(year, month - 1);
  const last = new Date(date); last.setMonth(last.getMonth() + 1, 0);
  date.setDate(Math.min(day, last.getDate()));
  return dateKey(date);
}
export function pickerYearPage(year: number): number {
  return Math.floor((year - 1) / 12) * 12 + 1;
}
