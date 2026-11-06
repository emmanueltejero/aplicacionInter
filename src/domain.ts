export type Attendance = 'present' | 'absent' | 'excused';
export type Register = Record<string, Record<string, Attendance>>;
export type Player = { id: string; name: string; number: number; archivedAt?: string | null };

// Fictional players only. Replace with club data after authenticated access exists.
export const players: Player[] = [
  { id: 'demo-1', name: 'Álex Martín', number: 1 },
  { id: 'demo-2', name: 'Daniel Pérez', number: 4 },
  { id: 'demo-3', name: 'Hugo García', number: 7 },
  { id: 'demo-4', name: 'Leo Hernández', number: 8 },
  { id: 'demo-5', name: 'Pablo Díaz', number: 9 },
  { id: 'demo-6', name: 'Mateo Rodríguez', number: 10 },
  { id: 'demo-7', name: 'Lucas Romero', number: 11 },
  { id: 'demo-8', name: 'Adrián Suárez', number: 14 },
];

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function summary(roster: Player[], day: Record<string, Attendance> = {}) {
  const counts = { present: 0, absent: 0, excused: 0, pending: 0 };
  for (const player of roster) {
    const status = day[player.id];
    if (status) counts[status]++;
    else counts.pending++;
  }
  return counts;
}

export function parseRegister(value: string | null): Register {
  if (value === null) return {};
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid register');
  for (const [date, day] of Object.entries(parsed)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !day || typeof day !== 'object' || Array.isArray(day)) {
      throw new Error('Invalid day');
    }
    for (const value of Object.values(day)) {
      if (!['present', 'absent', 'excused'].includes(value as string)) throw new Error('Invalid attendance');
    }
  }
  return parsed as Register;
}

export function validatePlayer(name: string, number: string | number, roster: Player[], editingId?: string) {
  const cleanName = name.trim().replace(/\s+/g, ' ');
  if (!cleanName || cleanName.length > 80) throw new Error('Escribe un nombre de entre 1 y 80 caracteres.');
  if (!/^\d{1,2}$/.test(String(number).trim())) throw new Error('El dorsal debe ser un número entero entre 0 y 99.');
  const cleanNumber = Number(number);
  if (roster.some(player => player.id !== editingId && !player.archivedAt && player.number === cleanNumber)) {
    throw new Error('Ese dorsal ya está asignado a un jugador activo.');
  }
  return { name: cleanName, number: cleanNumber };
}

export function parseRoster(value: string | null): Player[] {
  if (value === null) return players.map(player => ({ ...player }));
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error('Invalid roster');
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const item of parsed) {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80
      || !Number.isInteger(item.number) || item.number < 0 || item.number > 99
      || (item.archivedAt != null && (typeof item.archivedAt !== 'string' || !Number.isFinite(Date.parse(item.archivedAt))))) {
      throw new Error('Invalid player');
    }
    ids.add(item.id);
    if (!item.archivedAt) {
      if (numbers.has(item.number)) throw new Error('Duplicate active number');
      numbers.add(item.number);
    }
  }
  return parsed as Player[];
}
